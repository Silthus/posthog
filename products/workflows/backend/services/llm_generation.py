import json
import hashlib
import dataclasses
from dataclasses import dataclass, field
from typing import Any, Literal

import structlog
import posthoganalytics

from posthog.models.team.team import Team
from posthog.redis import get_client

logger = structlog.get_logger(__name__)

WORKFLOWS_LLM_ACTION_FLAG = "workflows-llm-action"

GenerationStatus = Literal["pending", "succeeded", "failed"]

# Every code here reaches a customer's run log, so the messages are product copy.
ERROR_MESSAGES: dict[str, str] = {
    "quota_exceeded": "This project has used all of its PostHog AI credits. Add credits in billing to run this step again.",
    "invalid_model": "This step names a model that is no longer available. Pick another model in the step settings.",
    "output_too_large": "The generated text was too long to store in a workflow variable. Ask for a shorter answer, or use fewer output fields.",
    "model_refused": "The model declined to answer this prompt. Rewrite the prompt and try again.",
    "malformed_output": "The model did not return the output fields in a usable form. Simplify the field instructions and try again.",
    "gateway_unavailable": "Could not reach the model provider. Try again later.",
    "deadline_exceeded": "Generation ran longer than 60 seconds and stopped. Try a shorter prompt or a faster model.",
    "capacity_unavailable": "Text generation is busy right now, so this step could not run. Try again in a few minutes.",
    "feature_unavailable": "Generate text is not available for this project. Contact support to request access.",
}

# A success is worth replaying for a whole flow run; a failure is cached only long enough to keep
# a retry storm off the gateway. Pending outlives the caller's own 90-second give-up so a poll
# never races the record away.
SUCCESS_TTL_SECONDS = 600
FAILURE_TTL_SECONDS = 30
PENDING_TTL_SECONDS = 300


@dataclass(frozen=True, kw_only=True)
class GenerationRequest:
    invocation_id: str
    hog_flow_id: str | None
    prompt: str
    model: str
    output_fields: dict[str, str]


@dataclass(frozen=True, kw_only=True)
class GenerationRecord:
    id: str
    status: GenerationStatus
    request: GenerationRequest
    text: str = ""
    fields: dict[str, str] = field(default_factory=dict)
    error_code: str | None = None
    error_message: str | None = None

    def envelope(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status,
            "result": {"text": self.text, "fields": self.fields} if self.status == "succeeded" else None,
            "error": {"code": self.error_code, "message": self.error_message} if self.error_code else None,
        }


def generation_id(request: GenerationRequest) -> str:
    """One invocation id spans a whole flow run, so the payload hash is what separates two
    Generate text steps of the same run."""
    payload = json.dumps(
        [request.invocation_id, request.hog_flow_id, request.prompt, request.model, request.output_fields],
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _redis_key(team_id: int, record_id: str) -> str:
    return f"workflow_llm_generation:{team_id}:{record_id}"


def read_record(team_id: int, record_id: str) -> GenerationRecord | None:
    raw = get_client().get(_redis_key(team_id, record_id))
    if raw is None:
        return None
    stored = json.loads(raw)
    return GenerationRecord(**{**stored, "request": GenerationRequest(**stored["request"])})


def _serialize(record: GenerationRecord) -> str:
    return json.dumps(dataclasses.asdict(record))


def write_record(team_id: int, record: GenerationRecord) -> GenerationRecord:
    ttl = {"pending": PENDING_TTL_SECONDS, "succeeded": SUCCESS_TTL_SECONDS}.get(record.status, FAILURE_TTL_SECONDS)
    get_client().setex(_redis_key(team_id, record.id), ttl, _serialize(record))
    return record


def claim_pending(team_id: int, record: GenerationRecord) -> bool:
    """Takes the dedupe slot in one round trip. False means a concurrent submit of the same payload
    already holds it, so this request must not enqueue a second generation."""
    claimed = get_client().set(_redis_key(team_id, record.id), _serialize(record), ex=PENDING_TTL_SECONDS, nx=True)
    return bool(claimed)


def failed_record(record_id: str, request: GenerationRequest, code: str) -> GenerationRecord:
    return GenerationRecord(
        id=record_id, status="failed", request=request, error_code=code, error_message=ERROR_MESSAGES[code]
    )


def is_llm_action_enabled(team: Team) -> bool:
    """Aggregated on organization: the only group whose key is byte-identical between the browser
    and Django, and the same scope as the AI credit balance. Fails closed."""
    try:
        return bool(
            posthoganalytics.feature_enabled(
                WORKFLOWS_LLM_ACTION_FLAG,
                str(team.uuid),
                groups={"organization": str(team.organization_id)},
                group_properties={"organization": {"id": str(team.organization_id)}},
                send_feature_flag_events=False,
            )
        )
    except Exception:
        logger.warning(
            "workflows.llm_generation.feature_flag_check_failed_defaulting_off",
            team_id=team.id,
            exc_info=True,
        )
        return False
