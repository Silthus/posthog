# Django seams for scheduled transactional email sends (rung 4).
# Names marked "added" are new. Everything else exists on master or in the code-send PR this map builds on,
# PostHog/posthog#127123 (head 583e766b75e).
from datetime import datetime
from uuid import UUID

import requests
from rest_framework.throttling import BaseThrottle

from posthog.dataclasses import frozen
from posthog.enums import LabeledStrEnum
from posthog.models import Team

from products.messaging.backend.facade.contracts import EmailStatus, TransactionalEmailError

# --- Public HTTP API (MessagingSendViewSet, MessagingEmailsViewSet) ----------------------------------
#
# POST /api/projects/{team_id}/messaging/send/email/        scope hog_flow:write
#   body: the flat body of #127123 (template_id + message_data, or template_key + subject + html/text)
#         + scheduled_at: ISO 8601 with a UTC offset, optional (added)
#   202 {"message_id", "status": "queued" | "scheduled", "scheduled_at": str | null}
#       A time at or before now is a send now: "queued", scheduled_at null (Q6).
#   400 on scheduled_at: no offset, more than 30 days after the request, or the scheduled-sends flag is off
#   422 idempotency_key_reused: same key, other body or other scheduled_at
#
# GET  /api/projects/{team_id}/messaging/emails/?status=scheduled&cursor=&limit=   scope hog_flow:read (added)
#   200 {"results": [{"id", "to", "scheduled_at", "created_at"}], "next": str | null}   send-time order
#   400 when status is missing or not "scheduled". Other filters belong to the batch map (#286).
#
# GET  /api/projects/{team_id}/messaging/emails/{id}/        scope hog_flow:read
#   200 EmailStatusSerializer; status gains "scheduled" and "canceled"
#
# POST /api/projects/{team_id}/messaging/emails/{id}/cancel/ scope hog_flow:write (added)
#   200 {"id", "status": "canceled"}   also for a repeated cancel, best effort (Q3)
#   404 no such email for this project
#   409 {"code": "already_sending"}    a worker has the job
#
# PATCH /api/projects/{team_id}/messaging/emails/{id}/       scope hog_flow:write (added)
#   body {"scheduled_at"} only
#   200 {"id", "status": "scheduled", "scheduled_at"}   a time at or before now moves the send to now, even past
#       the cap, and the status stays "scheduled" until the outcome
#   400 on scheduled_at, by the same rules as the send, with the cap counted from the first request (Q2)
#   404; 409 {"code": "already_sending" | "canceled"}

# --- API access policy (added module; both views import it) ---------------------------------------------
def require_transactional_email_api(team: Team) -> None: ...  # moved from message_templates.py, unchanged
def require_email_from_code(team: Team) -> None: ...  # moved, unchanged
def require_email_status_read(team: Team) -> None: ...  # moved, unchanged
def require_scheduled_sends(team: Team) -> None: ...  # added; raises a 400 on scheduled_at
def transactional_email_throttles() -> list[BaseThrottle]: ...  # moved, unchanged; the send routes use it
def transactional_email_read_throttles() -> list[BaseThrottle]: ...  # added; the four read throttles that

# MessagingEmailsViewSet.get_throttles builds today, for retrieve and list

# --- Facade: products/messaging/backend/facade ------------------------------------------------------------
class EmailDeliveryStatus(LabeledStrEnum):
    SCHEDULED = "scheduled", "Scheduled"  # added
    QUEUED = "queued", "Queued"
    CANCELED = "canceled", "Canceled"  # added
    FAILED = "failed", "Failed"
    SENT = "sent", "Sent"
    DELIVERED = "delivered", "Delivered"
    BOUNCED = "bounced", "Bounced"
    COMPLAINED = "complained", "Complained"

@frozen
class QueuedEmail:
    message_id: str
    replayed: bool = False
    scheduled_at: datetime | None = None  # added; None for a send now

@frozen
class ScheduledEmail:  # added
    message_id: str
    to: str
    scheduled_at: datetime
    created_at: datetime

@frozen
class ScheduledEmailPage:  # added
    results: tuple[ScheduledEmail, ...]
    next_cursor: str | None  # opaque; encodes (scheduled_at, message_id)

class InvalidScheduledAt(TransactionalEmailError):  # added; the view answers 400 on scheduled_at
    code = "invalid_scheduled_at"

class AlreadySending(TransactionalEmailError):  # added; 409
    code = "already_sending"

class EmailCanceled(TransactionalEmailError):  # added; 409 on a reschedule
    code = "canceled"

def send_code_email(
    team, email, *, to, distinct_id, idempotency_key=None, scheduled_at: datetime | None = None
) -> QueuedEmail: ...  # changed
def send_transactional_email(
    team,
    template_id,
    *,
    to,
    distinct_id,
    message_data,
    idempotency_key=None,
    scheduled_at: datetime | None = None,
    timeout=10,
) -> QueuedEmail: ...  # changed
def get_email_status(team_id: int, message_id: UUID) -> EmailStatus | None: ...  # gate 30 -> 60 days
def list_scheduled(team_id: int, *, cursor: str | None, limit: int = 100) -> ScheduledEmailPage: ...  # added
def cancel_email(team_id: int, message_id: UUID) -> EmailStatus | None: ...  # added; None -> 404
def reschedule_email(team_id: int, message_id: UUID, scheduled_at: datetime) -> QueuedEmail | None: ...  # added

# Invariants
# - Django parses scheduled_at (aware datetime, sent on as UTC ISO 8601) and checks only the flag.
#   cdp-api owns the time rules and answers invalid_scheduled_at, which the facade raises as InvalidScheduledAt.
# - require_scheduled_sends turns on only after every cdp-api instance runs this change. An older instance drops
#   scheduled_at and sends at once. A cdp-api rollback past this change needs the flag off and no waiting sends.
# - limit is 1..100. Django never reads cyclotron directly; every job operation goes through plugin_server_api.
# - cancel_email: when cdp-api answers not_found, it reads get_email_status once and returns it when the
#   latest status is canceled (Q3). Otherwise None. The status rows travel through Kafka into ClickHouse
#   without a delivery guarantee, so this repeat answer is best effort.

# --- plugin_server_api (added wrappers, team-only token) -------------------------------------------------
def _mint_transactional_email_team_jwt(team_id: int) -> str: ...  # claims {"team_id"}; own purpose and audience
def list_scheduled_emails(
    team_id: int, *, cursor: str | None, limit: int, timeout: float = 10
) -> requests.Response: ...
def cancel_scheduled_email(team_id: int, message_id: str, *, timeout: float = 10) -> requests.Response: ...
def reschedule_scheduled_email(
    team_id: int, message_id: str, scheduled_at: str, *, timeout: float = 10
) -> requests.Response: ...
