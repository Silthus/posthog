"""Every error the email API answers with.

Callers are often coding agents, so each message says what happened, why, and how to fix it, and each code
has its own section on the docs page."""

from enum import StrEnum
from typing import Any, Final

from rest_framework.exceptions import APIException

from posthog.dataclasses import frozen

DOCS_URL: Final = "https://posthog.com/docs/workflows/email-api"


class EmailSendErrorCode(StrEnum):
    EMAIL_API_NOT_ENABLED = "email_api_not_enabled"
    AUTHENTICATION_FAILED = "authentication_failed"
    PERMISSION_DENIED = "permission_denied"
    INVALID_REQUEST = "invalid_request"
    MISSING_BODY = "missing_body"
    INVALID_ADDRESS = "invalid_address"
    TOO_MANY_RECIPIENTS = "too_many_recipients"
    SENDER_NOT_FOUND = "sender_not_found"
    SENDER_NOT_VERIFIED = "sender_not_verified"
    NO_DEFAULT_SENDER = "no_default_sender"
    SENDING_PAUSED = "sending_paused"
    QUOTA_LIMIT_EXCEEDED = "quota_limit_exceeded"
    IDEMPOTENCY_KEY_IN_PROGRESS = "idempotency_key_in_progress"
    IDEMPOTENCY_KEY_REUSED = "idempotency_key_reused"
    RATE_LIMITED = "rate_limited"
    SEND_SERVICE_UNAVAILABLE = "send_service_unavailable"


class EmailSendErrorType(StrEnum):
    VALIDATION = "validation_error"
    AUTHENTICATION = "authentication_error"
    THROTTLED = "throttled_error"
    SERVER = "server_error"


@frozen(kw_only=False)
class EmailSendErrorSpec:
    status: int
    type: EmailSendErrorType
    message: str


CATALOG: Final[dict[EmailSendErrorCode, EmailSendErrorSpec]] = {
    EmailSendErrorCode.EMAIL_API_NOT_ENABLED: EmailSendErrorSpec(
        403,
        EmailSendErrorType.AUTHENTICATION,
        "Sending email through the API is not enabled for this project. "
        "The email API is in beta and is turned on one project at a time. "
        "Contact PostHog support to ask for access. Retrying does not help until then.",
    ),
    EmailSendErrorCode.AUTHENTICATION_FAILED: EmailSendErrorSpec(
        401,
        EmailSendErrorType.AUTHENTICATION,
        "The request has no valid API key, so PostHog can't tell which project it is for. "
        "Send a project secret API key, which starts with phs_, as a Bearer token in the Authorization header.",
    ),
    EmailSendErrorCode.PERMISSION_DENIED: EmailSendErrorSpec(
        403,
        EmailSendErrorType.AUTHENTICATION,
        "This credential can't send email. "
        "Only a project secret API key with the email_send:write scope can send, and personal API keys "
        "and logged-in sessions can't. "
        "Create a project secret API key with that scope in project settings, or add the scope to your key.",
    ),
    EmailSendErrorCode.INVALID_REQUEST: EmailSendErrorSpec(
        400,
        EmailSendErrorType.VALIDATION,
        "A field is missing or has the wrong type. The attr field of this error names it. "
        "Fix that field and send the request again.",
    ),
    EmailSendErrorCode.MISSING_BODY: EmailSendErrorSpec(
        400,
        EmailSendErrorType.VALIDATION,
        "The email has no content because html and text are both empty. Send html, text, or both.",
    ),
    EmailSendErrorCode.INVALID_ADDRESS: EmailSendErrorSpec(
        400,
        EmailSendErrorType.VALIDATION,
        "An email address is not valid. The attr field of this error names the field it is in. "
        "Use the form name@example.com or Name <name@example.com>, with one address per entry.",
    ),
    EmailSendErrorCode.TOO_MANY_RECIPIENTS: EmailSendErrorSpec(
        400,
        EmailSendErrorType.VALIDATION,
        "The email has more recipients than one send allows. "
        "Each send goes to exactly one to address, and cc and bcc together have a limit. "
        "Send one request for each to address, and move extra cc or bcc addresses to another send.",
    ),
    EmailSendErrorCode.SENDER_NOT_FOUND: EmailSendErrorSpec(
        422,
        EmailSendErrorType.VALIDATION,
        "No email sender in this project matches the domain of from. "
        "PostHog only sends from domains that the project has added as senders. "
        "Add and verify a sender for that domain in Workflows > Channels, or leave out from to use the "
        "project's default sender.",
    ),
    EmailSendErrorCode.SENDER_NOT_VERIFIED: EmailSendErrorSpec(
        422,
        EmailSendErrorType.VALIDATION,
        "The sender can't send yet because its domain is not verified. "
        "PostHog needs the domain's DNS records in place before it sends from that domain. "
        "Finish domain verification for the sender in Workflows > Channels, then send again.",
    ),
    EmailSendErrorCode.NO_DEFAULT_SENDER: EmailSendErrorSpec(
        422,
        EmailSendErrorType.VALIDATION,
        "The email has no sender because from is empty and the project has no default sender. "
        "Pass from with an address on a verified domain, or set a default sender in Workflows > Channels.",
    ),
    EmailSendErrorCode.SENDING_PAUSED: EmailSendErrorSpec(
        423,
        EmailSendErrorType.VALIDATION,
        "Email sending is paused for API sends in this project, so PostHog did not queue the email. "
        "Open the API sends workflow in Workflows to see why it was paused, and resume it there.",
    ),
    EmailSendErrorCode.QUOTA_LIMIT_EXCEEDED: EmailSendErrorSpec(
        402,
        EmailSendErrorType.VALIDATION,
        "This project is over its billing limit for workflows, so PostHog did not queue the email. "
        "Raise the limit in Billing settings, or ask an organization admin to do it.",
    ),
    EmailSendErrorCode.IDEMPOTENCY_KEY_IN_PROGRESS: EmailSendErrorSpec(
        409,
        EmailSendErrorType.VALIDATION,
        "A send with this Idempotency-Key is still being accepted. Wait a second, then retry with the same key.",
    ),
    EmailSendErrorCode.IDEMPOTENCY_KEY_REUSED: EmailSendErrorSpec(
        422,
        EmailSendErrorType.VALIDATION,
        "This Idempotency-Key was used in the last 24 hours for a different email. Use a new key for each new email.",
    ),
    EmailSendErrorCode.RATE_LIMITED: EmailSendErrorSpec(
        429,
        EmailSendErrorType.THROTTLED,
        "Too many sends in a short time for this key or project. "
        "Wait the number of seconds in the Retry-After header, then retry with the same Idempotency-Key.",
    ),
    EmailSendErrorCode.SEND_SERVICE_UNAVAILABLE: EmailSendErrorSpec(
        503,
        EmailSendErrorType.SERVER,
        "PostHog couldn't queue the email right now. "
        "Retry with the same Idempotency-Key. PostHog sends the email at most once.",
    ),
}

# The platform raises these before the email API runs, with its own codes and messages.
_PLATFORM_CODES: Final[dict[str, EmailSendErrorCode]] = {
    "not_authenticated": EmailSendErrorCode.AUTHENTICATION_FAILED,
    "authentication_failed": EmailSendErrorCode.AUTHENTICATION_FAILED,
    "permission_denied": EmailSendErrorCode.PERMISSION_DENIED,
}


def docs_url(code: EmailSendErrorCode) -> str:
    return f"{DOCS_URL}#{code.value}"


class EmailSendError(APIException):
    def __init__(self, code: EmailSendErrorCode, attr: str | None = None) -> None:
        spec = CATALOG[code]
        super().__init__(detail=spec.message, code=code.value)
        self.error_code = code
        self.status_code = spec.status
        self.exception_type = spec.type.value
        self.attr = attr


def add_catalog_fields(error_body: dict[str, Any], exc: Exception) -> None:
    """Adds `attr` and `docs_url` to an error body the platform exception handler rendered."""
    if isinstance(exc, EmailSendError):
        error_body["attr"] = exc.attr
        error_body["docs_url"] = docs_url(exc.error_code)
        return
    platform_code = _PLATFORM_CODES.get(str(error_body.get("code")))
    if platform_code is not None:
        error_body["docs_url"] = docs_url(platform_code)
