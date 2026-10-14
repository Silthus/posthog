from collections.abc import Callable
from typing import Any, cast

from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_field
from rest_framework import serializers, viewsets
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.settings import api_settings

from posthog.api.routing import TeamAndOrgViewSetMixin
from posthog.auth import ProjectSecretAPIKeyAuthentication
from posthog.event_usage import report_user_action
from posthog.permissions import is_authenticated_via_project_secret_api_key
from posthog.synthetic_user import SyntheticUser

from products.workflows.backend.services import api_send_service
from products.workflows.backend.services.api_send_errors import (
    CATALOG,
    EmailSendError,
    EmailSendErrorCode,
    add_catalog_fields,
)


@extend_schema_field(
    {
        "oneOf": [
            {"type": "string"},
            {"type": "array", "items": {"type": "string"}},
        ]
    }
)
class AddressListField(serializers.Field):
    default_error_messages = {"invalid": "Must be an email address or a list of email addresses."}

    def __init__(self, **kwargs: Any) -> None:
        self.allow_empty = kwargs.pop("allow_empty", True)
        super().__init__(**kwargs)

    def to_internal_value(self, data: Any) -> tuple[str, ...]:
        addresses = [data] if isinstance(data, str) else data
        if not isinstance(addresses, list) or not all(isinstance(address, str) for address in addresses):
            self.fail("invalid")
        if not addresses and not self.allow_empty:
            self.fail("invalid")
        return tuple(addresses)

    def to_representation(self, value: Any) -> Any:
        return list(value)


class EmailSendRequestSerializer(serializers.Serializer):
    to = AddressListField(
        allow_empty=False,
        help_text="The one recipient, as `name@example.com` or `Name <name@example.com>`. A list must hold exactly one address.",
    )
    subject = serializers.CharField(max_length=998, help_text="Subject line. One line, sent exactly as written.")
    html = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=False,
        help_text="HTML body. Send `html`, `text`, or both.",
    )
    text = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=False,
        help_text="Plain-text body. Without `html`, the HTML body is this text, escaped, with line breaks kept.",
    )
    replyTo = AddressListField(
        required=False,
        default=(),
        help_text="Reply-to address, or a list of them.",
    )
    cc = AddressListField(required=False, default=(), help_text="Cc address, or a list of them.")
    bcc = AddressListField(required=False, default=(), help_text="Bcc address, or a list of them.")
    distinctId = serializers.CharField(
        required=False,
        allow_null=True,
        default=None,
        max_length=400,
        help_text="Distinct ID of the person the email goes to. Delivery events, such as opened and clicked, land on this person.",
    )

    def get_fields(self) -> dict[str, serializers.Field]:
        # `from` is a Python keyword, so it can't be a class attribute.
        fields = super().get_fields()
        fields["from"] = serializers.CharField(
            required=False,
            allow_null=True,
            default=None,
            help_text=(
                "Sender, as `name@example.com` or `Name <name@example.com>`, on a verified sender domain of the "
                "project. Leave it out to send from the project's default sender."
            ),
        )
        return fields

    def validate_subject(self, subject: str) -> str:
        if "\n" in subject or "\r" in subject:
            raise serializers.ValidationError("The subject must be one line.")
        return subject

    def to_email_send_request(self) -> api_send_service.EmailSendRequest:
        data = self.validated_data
        return api_send_service.EmailSendRequest(
            from_address=data["from"],
            to=data["to"],
            subject=data["subject"],
            html=data["html"],
            text=data["text"],
            reply_to=data["replyTo"],
            cc=data["cc"],
            bcc=data["bcc"],
            distinct_id=data["distinctId"],
        )


class EmailSendResponseSerializer(serializers.Serializer):
    id = serializers.CharField(help_text="ID of the send. The API sends workflow's logs list each send by this ID.")
    url = serializers.URLField(help_text="Link to the API sends workflow in PostHog, where this send shows up.")


class EmailSendErrorSerializer(serializers.Serializer):
    type = serializers.CharField(
        help_text="Error class: validation_error, authentication_error, throttled_error or server_error."
    )
    code = serializers.CharField(help_text="Stable error code to branch on. The docs page has a section for each code.")
    detail = serializers.CharField(help_text="What happened, why, and how to fix it.")
    attr = serializers.CharField(allow_null=True, help_text="The request field the error is about, if any.")
    docs_url = serializers.URLField(help_text="Link to the docs section for this error code.")


class ProjectSecretAPIKeyOnly(BasePermission):
    message = CATALOG[EmailSendErrorCode.PERMISSION_DENIED].message

    def has_permission(self, request: Request, view: Any) -> bool:
        return is_authenticated_via_project_secret_api_key(request)


_ERROR_RESPONSE = OpenApiResponse(response=EmailSendErrorSerializer)


class EmailSendViewSet(TeamAndOrgViewSetMixin, viewsets.GenericViewSet):
    scope_object = "email_send"
    authentication_classes = [ProjectSecretAPIKeyAuthentication]
    permission_classes = [ProjectSecretAPIKeyOnly]
    psak_allowed_actions = ["create"]
    serializer_class = EmailSendRequestSerializer

    def get_exception_handler(self) -> Callable[[Exception, dict[str, Any]], Response | None]:
        platform_handler = super().get_exception_handler()

        def handler(exc: Exception, context: dict[str, Any]) -> Response | None:
            response = platform_handler(exc, context)
            if response is not None and isinstance(response.data, dict):
                add_catalog_fields(response.data, exc)
            return response

        return handler

    @extend_schema(
        request=EmailSendRequestSerializer,
        responses={
            200: OpenApiResponse(response=EmailSendResponseSerializer),
            400: _ERROR_RESPONSE,
            401: _ERROR_RESPONSE,
            402: _ERROR_RESPONSE,
            403: _ERROR_RESPONSE,
            422: _ERROR_RESPONSE,
            423: _ERROR_RESPONSE,
            503: _ERROR_RESPONSE,
        },
        summary="Send an email",
        description=(
            "Send one transactional email from a verified sender of the project. Needs a project secret API key "
            "with the email_send:write scope. The email is accepted once it is queued; delivery happens after the "
            "response. Every error carries a stable code and a docs_url."
        ),
    )
    def create(self, request: Request, **kwargs: Any) -> Response:
        api_send_service.require_email_api_enabled(self.team)
        serializer = EmailSendRequestSerializer(data=request.data)
        if not serializer.is_valid():
            raise EmailSendError(EmailSendErrorCode.INVALID_REQUEST, attr=_first_invalid_field(serializer.errors))
        email = serializer.to_email_send_request()
        accepted = api_send_service.send(self.team, email)
        report_user_action(
            cast(SyntheticUser, request.user),
            "email api send",
            {
                "auth_method": "project_secret_api_key",
                "has_from": email.from_address is not None,
                "has_distinct_id": email.distinct_id is not None,
                "has_html": bool(email.html.strip()),
                "has_text": bool(email.text.strip()),
            },
            team=self.team,
            request=request,
        )
        return Response(EmailSendResponseSerializer(accepted).data)


def _first_invalid_field(errors: Any) -> str | None:
    if not isinstance(errors, dict) or not errors:
        return None
    field = next(iter(errors))
    return None if field == api_settings.NON_FIELD_ERRORS_KEY else field
