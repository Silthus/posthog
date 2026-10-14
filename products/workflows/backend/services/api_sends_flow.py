"""The API sends workflow: the one hidden workflow per team that runs each email sent through the email API.

PostHog creates it on first use and owns its graph. Nobody edits it, so this module is the only place that
says what the graph is, and it rewrites a stored graph that no longer matches."""

from typing import Any

from django.db import IntegrityError, transaction

from posthog.models.team.team import Team

from products.workflows.backend.models.hog_flow.hog_flow import HogFlow

API_SENDS_FLOW_NAME = "API sends"
API_SEND_TRIGGER_TYPE = "api_send"

_TRIGGER_ID = "trigger_node"
_EMAIL_STEP_ID = "api_send_email"
_EXIT_ID = "exit_node"


def get_or_create_api_sends_flow(team: Team) -> HogFlow:
    flow = _get_or_create(team)
    if not _has_current_graph(flow):
        flow = _rewrite_graph(flow)
    return flow


def _get_or_create(team: Team) -> HogFlow:
    existing = HogFlow.objects.filter(team=team, origin_product=HogFlow.OriginProduct.API_SENDS).first()
    if existing is not None:
        return existing
    try:
        with transaction.atomic():
            return HogFlow.objects.create(
                team=team,
                name=API_SENDS_FLOW_NAME,
                origin_product=HogFlow.OriginProduct.API_SENDS,
                status=HogFlow.State.ACTIVE,
                **_graph(),
            )
    except IntegrityError:
        # A concurrent first call created it between our read and our insert.
        return HogFlow.objects.get(team=team, origin_product=HogFlow.OriginProduct.API_SENDS)


def _rewrite_graph(flow: HogFlow) -> HogFlow:
    with transaction.atomic():
        locked = HogFlow.objects.select_for_update().get(pk=flow.pk)
        if not _has_current_graph(locked):
            for field, value in _graph().items():
                setattr(locked, field, value)
            locked.version += 1
            locked.save(update_fields=[*_graph().keys(), "version", "updated_at"])
    return locked


def _has_current_graph(flow: HogFlow) -> bool:
    return all(getattr(flow, field) == value for field, value in _graph().items())


def _graph() -> dict[str, Any]:
    return {
        "trigger": {"type": API_SEND_TRIGGER_TYPE},
        "actions": [_trigger_step(), _email_step(), _exit_step()],
        "edges": [
            {"from": _TRIGGER_ID, "to": _EMAIL_STEP_ID, "type": "continue"},
            {"from": _EMAIL_STEP_ID, "to": _EXIT_ID, "type": "continue"},
        ],
        "billable_action_types": ["function_email"],
    }


def _trigger_step() -> dict[str, Any]:
    return _step(
        _TRIGGER_ID,
        "trigger",
        name="Email API send",
        description="Starts once for each email sent through the email API.",
        config={"type": API_SEND_TRIGGER_TYPE},
    )


def _email_step() -> dict[str, Any]:
    return _step(
        _EMAIL_STEP_ID,
        "function_email",
        name="Send email",
        description="Sends the email from the API request.",
        config={
            "template_id": "template-email",
            "message_category_type": "transactional",
            "inputs": {"email": {"value": _email_from_send_variables(), "templating": "liquid", "order": 0}},
        },
    )


def _exit_step() -> dict[str, Any]:
    return _step(_EXIT_ID, "exit", name="Exit", description="", config={"reason": "Email queued"})


def _step(step_id: str, step_type: str, *, name: str, description: str, config: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": step_id,
        "type": step_type,
        "name": name,
        "description": description,
        "config": config,
        "created_at": 0,
        "updated_at": 0,
    }


def _email_from_send_variables() -> dict[str, Any]:
    # Liquid escapes output by default, so every field the caller wrote passes through `raw` to arrive as
    # written. The integration id is a number PostHog resolved, never caller text.
    return {
        "to": {"email": _raw_send_field("to")},
        "from": {
            "integrationId": "{{ variables.email.integration_id }}",
            "email": _raw_send_field("from_email"),
            "name": _raw_send_field("from_name"),
        },
        "replyTo": _raw_send_field("reply_to"),
        "cc": _raw_send_field("cc"),
        "bcc": _raw_send_field("bcc"),
        "subject": _raw_send_field("subject"),
        "text": _raw_send_field("text"),
        "html": _raw_send_field("html"),
    }


def _raw_send_field(field: str) -> str:
    return f"{{{{ variables.email.{field} | raw }}}}"
