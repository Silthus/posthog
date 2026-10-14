# PROTOTYPE (Silthus/posthog#463): throwaway stub of the API send error catalog.
# Not imported anywhere. The real module lands as products/workflows/backend/services/api_send_errors.py.
from enum import StrEnum
from typing import Final

from rest_framework.exceptions import APIException

from posthog.dataclasses import frozen

DOCS_BASE_URL: Final = "https://posthog.com/docs/workflows/email-api"


class EmailSendErrorCode(StrEnum):
    EMAIL_API_NOT_ENABLED = "email_api_not_enabled"
    INVALID_REQUEST = "invalid_request"
    MISSING_BODY = "missing_body"
    INVALID_ADDRESS = "invalid_address"
    TOO_MANY_RECIPIENTS = "too_many_recipients"
    SENDER_NOT_FOUND = "sender_not_found"
    SENDER_NOT_VERIFIED = "sender_not_verified"
    NO_DEFAULT_SENDER = "no_default_sender"
    SENDING_PAUSED = "sending_paused"
    IDEMPOTENCY_KEY_IN_PROGRESS = "idempotency_key_in_progress"
    IDEMPOTENCY_KEY_REUSED = "idempotency_key_reused"
    RATE_LIMITED = "rate_limited"
    SEND_SERVICE_UNAVAILABLE = "send_service_unavailable"


@frozen
class EmailSendErrorSpec:
    status: int
    error_type: str
    what: str
    why: str
    fix: str

    def message(self) -> str:
        return f"{self.what} {self.why} {self.fix}"


CATALOG: Final[dict[EmailSendErrorCode, EmailSendErrorSpec]] = {
    EmailSendErrorCode.EMAIL_API_NOT_ENABLED: EmailSendErrorSpec(
        403,
        "authentication_error",
        "Sending email through the API is not enabled for this project.",
        "The feature is in a limited beta.",
        "Ask PostHog support to enable it for this project.",
    ),
    EmailSendErrorCode.MISSING_BODY: EmailSendErrorSpec(
        400,
        "validation_error",
        "The email has no content.",
        "Both html and text are empty.",
        "Send html, text, or both.",
    ),
    EmailSendErrorCode.SENDER_NOT_FOUND: EmailSendErrorSpec(
        422,
        "validation_error",
        "No email sender in this project matches the from domain.",
        "PostHog only sends from domains that the project has added as senders.",
        "Add and verify a sender for that domain in Workflows, or remove from to use the default sender.",
    ),
    EmailSendErrorCode.SENDER_NOT_VERIFIED: EmailSendErrorSpec(
        422,
        "validation_error",
        "The sender for this domain cannot send yet.",
        "Its DNS records are not verified.",
        "Finish domain verification in Workflows, then retry.",
    ),
    EmailSendErrorCode.NO_DEFAULT_SENDER: EmailSendErrorSpec(
        422,
        "validation_error",
        "The email has no sender.",
        "from is empty and the project has no default sender.",
        "Pass from with an address on a verified domain, or set a default sender in Workflows.",
    ),
    EmailSendErrorCode.IDEMPOTENCY_KEY_REUSED: EmailSendErrorSpec(
        422,
        "validation_error",
        "This Idempotency-Key was already used for a different email.",
        "A key identifies one email for 24 hours.",
        "Use a new key for a new email.",
    ),
    EmailSendErrorCode.SEND_SERVICE_UNAVAILABLE: EmailSendErrorSpec(
        503,
        "server_error",
        "PostHog could not queue the email right now.",
        "The sending service did not answer in time.",
        "Retry with the same Idempotency-Key. The email is sent at most once.",
    ),
}


class EmailSendError(APIException):
    def __init__(self, code: EmailSendErrorCode, attr: str | None = None) -> None:
        spec = CATALOG[code]
        self.status_code = spec.status
        self.attr = attr
        self.docs_url = f"{DOCS_BASE_URL}#{code.value}"
        super().__init__(detail=spec.message(), code=code.value)
