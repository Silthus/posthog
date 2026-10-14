"""Sends one email through the email API: one invocation on the team's API sends workflow.

The send is accepted once the plugin server queued the invocation. Everything after that (suppression, provider
errors, delivery) happens later and shows in the API sends workflow's logs under the returned id."""

from email.utils import parseaddr

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils.html import escape

import requests
import structlog
import posthoganalytics

from posthog.dataclasses import frozen
from posthog.exceptions_capture import capture_exception
from posthog.models.integration import Integration
from posthog.models.team import Team
from posthog.plugins.plugin_server_api import (
    ApiSendEmail,
    ApiSendInvocation,
    HogFlowApiSendTimeout,
    create_hog_flow_api_send,
)
from posthog.utils import absolute_uri
from posthog.uuidt import UUIDT

from products.workflows.backend.models.hog_flow.hog_flow import HogFlow
from products.workflows.backend.models.team_workflows_config import TeamWorkflowsConfig
from products.workflows.backend.services.api_send_errors import EmailSendError, EmailSendErrorCode
from products.workflows.backend.services.api_sends_flow import get_or_create_api_sends_flow

logger = structlog.get_logger(__name__)

EMAIL_API_FLAG = "workflows-email-api"


@frozen
class EmailSendRequest:
    from_address: str | None
    to: tuple[str, ...]
    subject: str
    html: str
    text: str
    reply_to: tuple[str, ...]
    cc: tuple[str, ...]
    bcc: tuple[str, ...]
    distinct_id: str | None


@frozen
class AcceptedEmailSend:
    id: str
    url: str


@frozen
class _Mailbox:
    name: str
    address: str


@frozen
class _Content:
    to: str
    reply_to: str
    cc: str
    bcc: str
    subject: str
    text: str
    html: str


@frozen
class _Sender:
    integration_id: int
    from_email: str
    from_name: str


def require_email_api_enabled(team: Team) -> None:
    if not _email_api_flag_enabled(team):
        raise EmailSendError(EmailSendErrorCode.EMAIL_API_NOT_ENABLED)


def send(team: Team, request: EmailSendRequest) -> AcceptedEmailSend:
    content = _validated_content(request)
    sender = _resolve_sender(team, request.from_address)
    flow = get_or_create_api_sends_flow(team)
    send_id = str(UUIDT())
    _queue(
        team,
        flow,
        ApiSendInvocation(
            invocation_id=send_id,
            distinct_id=request.distinct_id,
            email=ApiSendEmail(
                to=content.to,
                integration_id=sender.integration_id,
                from_email=sender.from_email,
                from_name=sender.from_name,
                reply_to=content.reply_to,
                cc=content.cc,
                bcc=content.bcc,
                subject=content.subject,
                text=content.text,
                html=content.html,
            ),
        ),
    )
    return AcceptedEmailSend(
        id=send_id,
        url=absolute_uri(f"/project/{team.project_id}/workflows/{flow.id}/invocations"),
    )


def _email_api_flag_enabled(team: Team) -> bool:
    try:
        return bool(
            posthoganalytics.feature_enabled(
                EMAIL_API_FLAG,
                str(team.uuid),
                groups={"organization": str(team.organization_id), "project": str(team.id)},
                group_properties={
                    "organization": {"id": str(team.organization_id)},
                    "project": {"id": str(team.id)},
                },
                only_evaluate_locally=False,
                send_feature_flag_events=False,
            )
        )
    except Exception as error:
        capture_exception(error)
        return False


def _validated_content(request: EmailSendRequest) -> _Content:
    if not request.to:
        raise EmailSendError(EmailSendErrorCode.INVALID_REQUEST, attr="to")
    if len(request.to) > 1:
        raise EmailSendError(EmailSendErrorCode.TOO_MANY_RECIPIENTS, attr="to")
    if len(request.cc) + len(request.bcc) > settings.EMAIL_API_MAX_CC_BCC_RECIPIENTS:
        raise EmailSendError(EmailSendErrorCode.TOO_MANY_RECIPIENTS)
    if not request.html.strip() and not request.text.strip():
        raise EmailSendError(EmailSendErrorCode.MISSING_BODY)
    return _Content(
        to=_parse_mailbox(request.to[0], "to").address,
        reply_to=_address_list(request.reply_to, "replyTo"),
        cc=_address_list(request.cc, "cc"),
        bcc=_address_list(request.bcc, "bcc"),
        subject=request.subject,
        text=request.text,
        html=request.html if request.html.strip() else _html_from_text(request.text),
    )


def _address_list(raw_addresses: tuple[str, ...], field: str) -> str:
    return ", ".join(_parse_mailbox(raw, field).address for raw in raw_addresses)


def _parse_mailbox(raw: str, field: str) -> _Mailbox:
    name, address = parseaddr(raw)
    try:
        validate_email(address)
    except ValidationError:
        raise EmailSendError(EmailSendErrorCode.INVALID_ADDRESS, attr=field)
    return _Mailbox(name=name, address=address)


def _html_from_text(text: str) -> str:
    return escape(text).replace("\r\n", "\n").replace("\n", "<br>\n")


def _resolve_sender(team: Team, from_address: str | None) -> _Sender:
    if from_address is None or not from_address.strip():
        return _default_sender(team)
    mailbox = _parse_mailbox(from_address, "from")
    domain = mailbox.address.rsplit("@", 1)[1].lower()
    same_domain = list(Integration.objects.filter(team_id=team.id, kind="email", config__domain=domain))
    if not same_domain:
        raise EmailSendError(EmailSendErrorCode.SENDER_NOT_FOUND, attr="from")
    exact_match_first = sorted(same_domain, key=lambda sender: _sender_address(sender) != mailbox.address.lower())
    verified = next((sender for sender in exact_match_first if _is_verified(sender)), None)
    if verified is None:
        raise EmailSendError(EmailSendErrorCode.SENDER_NOT_VERIFIED, attr="from")
    return _Sender(integration_id=verified.id, from_email=mailbox.address, from_name=mailbox.name)


def _default_sender(team: Team) -> _Sender:
    default_id = (
        TeamWorkflowsConfig.objects.filter(team_id=team.id)
        .values_list("default_email_integration_id", flat=True)
        .first()
    )
    sender = Integration.objects.filter(team_id=team.id, kind="email", id=default_id).first() if default_id else None
    if sender is None:
        raise EmailSendError(EmailSendErrorCode.NO_DEFAULT_SENDER, attr="from")
    if not _is_verified(sender):
        raise EmailSendError(EmailSendErrorCode.SENDER_NOT_VERIFIED)
    # Empty overrides make the email step send with the sender's own address and name.
    return _Sender(integration_id=sender.id, from_email="", from_name="")


def _sender_address(sender: Integration) -> str:
    return str(sender.config.get("email", "")).lower()


def _is_verified(sender: Integration) -> bool:
    return sender.config.get("verified") is True


def _queue(team: Team, flow: HogFlow, invocation: ApiSendInvocation) -> None:
    try:
        response = create_hog_flow_api_send(team.id, str(flow.id), invocation)
    except HogFlowApiSendTimeout:
        logger.warning("email_api_send_timed_out", team_id=team.id, send_id=invocation.invocation_id)
        raise EmailSendError(EmailSendErrorCode.SEND_SERVICE_UNAVAILABLE)
    except (requests.RequestException, RuntimeError) as error:
        capture_exception(error, {"team_id": team.id, "send_id": invocation.invocation_id})
        raise EmailSendError(EmailSendErrorCode.SEND_SERVICE_UNAVAILABLE)

    match response.status_code:
        case 200:
            return
        case 402:
            raise EmailSendError(EmailSendErrorCode.QUOTA_LIMIT_EXCEEDED)
        case 423:
            raise EmailSendError(EmailSendErrorCode.SENDING_PAUSED)
        case _:
            logger.warning(
                "email_api_send_rejected",
                team_id=team.id,
                send_id=invocation.invocation_id,
                status_code=response.status_code,
            )
            raise EmailSendError(EmailSendErrorCode.SEND_SERVICE_UNAVAILABLE)
