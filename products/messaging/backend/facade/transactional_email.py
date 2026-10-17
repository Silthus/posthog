"""Transactional email: a template made sendable over the API, backed by a workflow that runs once per send."""

from products.messaging.backend.facade.contracts import (
    DeliveryUnavailable,
    EmailDeliveryStatus,
    EmailStatus,
    QueuedEmail,
    TransactionalEmailError,
)
from products.messaging.backend.services.transactional_email import (
    SENDER_ADDRESS_MAX_LENGTH,
    TransactionalEmailStage,
    make_transactional,
    observe_transactional_email_stage,
    send_transactional_email,
    sender_address_error,
    transactional_email_stage,
)
from products.messaging.backend.services.transactional_email_status import get_email_status

__all__ = [
    "SENDER_ADDRESS_MAX_LENGTH",
    "DeliveryUnavailable",
    "EmailDeliveryStatus",
    "EmailStatus",
    "QueuedEmail",
    "TransactionalEmailError",
    "TransactionalEmailStage",
    "get_email_status",
    "make_transactional",
    "observe_transactional_email_stage",
    "send_transactional_email",
    "sender_address_error",
    "transactional_email_stage",
]
