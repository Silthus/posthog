from typing import Any, get_args

from django.db import transaction

from drf_spectacular.utils import OpenApiResponse
from rest_framework import request, response, serializers, status, viewsets
from rest_framework.throttling import BaseThrottle

from posthog.api.mixins import validated_request
from posthog.api.routing import TeamAndOrgViewSetMixin
from posthog.auth import SessionAuthentication, TeamSecretTokenAuthentication
from posthog.permissions import TeamSecretTokenPermission
from posthog.rate_limit import WorkflowLLMGenerationSubmitThrottle

from products.workflows.backend.services.llm_generation import (
    ERROR_MESSAGES,
    GenerationRecord,
    GenerationRequest,
    GenerationStatus,
    claim_pending,
    failed_record,
    generation_id,
    is_llm_action_enabled,
    read_record,
    write_record,
)
from products.workflows.backend.services.llm_models import WORKFLOW_LLM_SUPPORTED_MODELS
from products.workflows.backend.tasks.llm_generate import run_workflow_llm_generation

from ee.billing.quota_limiting import is_team_over_ai_credit_budget

# The whole submitted payload is held in Redis for the life of the record, and that Redis is also
# the Celery broker, so an unbounded body would let one project's token crowd out task delivery.
MAX_PROMPT_CHARS = 100_000
MAX_OUTPUT_FIELDS = 20
MAX_FIELD_NAME_CHARS = 200
MAX_FIELD_INSTRUCTION_CHARS = 1_000


class WorkflowLLMGenerationSubmitSerializer(serializers.Serializer):
    invocation_id = serializers.CharField(max_length=200, help_text="Id of the workflow run this step belongs to.")
    hog_flow_id = serializers.CharField(
        required=False,
        allow_null=True,
        default=None,
        max_length=200,
        help_text="Id of the saved workflow, absent in a preview.",
    )
    prompt = serializers.CharField(
        trim_whitespace=False, max_length=MAX_PROMPT_CHARS, help_text="The prompt, already rendered by the caller."
    )
    model = serializers.CharField(max_length=200, help_text="Model to run the prompt on.")
    output_fields = serializers.DictField(
        child=serializers.CharField(max_length=MAX_FIELD_INSTRUCTION_CHARS),
        help_text="Instruction per workflow variable key. Empty skips extraction.",
    )

    def validate_output_fields(self, value: dict[str, str]) -> dict[str, str]:
        if len(value) > MAX_OUTPUT_FIELDS:
            raise serializers.ValidationError(f"A step can declare at most {MAX_OUTPUT_FIELDS} output fields.")
        if any(len(name) > MAX_FIELD_NAME_CHARS for name in value):
            raise serializers.ValidationError(
                f"Output field names are workflow variable keys, so they must be under {MAX_FIELD_NAME_CHARS} characters."
            )
        return value


class WorkflowLLMGenerationResultSerializer(serializers.Serializer):
    text = serializers.CharField(help_text="The generated text.")
    # DRF's metaclass moves declared fields off the class, so this does not shadow Serializer.fields
    # at runtime, but the stubs still see the assignment.
    fields = serializers.DictField(  # type: ignore[assignment]
        child=serializers.CharField(),
        help_text="One extracted value per declared output field. Empty when no fields are declared.",
    )


class WorkflowLLMGenerationErrorSerializer(serializers.Serializer):
    code = serializers.CharField(help_text="Machine-readable failure reason, shown in the workflow run log.")
    message = serializers.CharField(help_text="What went wrong and what to do next.")


class WorkflowLLMGenerationSerializer(serializers.Serializer):
    id = serializers.CharField(
        allow_null=True, help_text="Handle to poll, absent when the request was rejected outright."
    )
    status = serializers.ChoiceField(
        choices=list(get_args(GenerationStatus)), help_text="Whether the generation is still running."
    )
    result = WorkflowLLMGenerationResultSerializer(allow_null=True, help_text="Present once the generation succeeded.")
    error = WorkflowLLMGenerationErrorSerializer(allow_null=True, help_text="Present when the generation failed.")


def _unavailable_envelope(code: str) -> dict[str, Any]:
    """A rejection that never reached a generation still answers in the envelope shape, because the
    caller only knows how to read `error.code` into the run log."""
    return {"id": None, "status": "failed", "result": None, "error": {"code": code, "message": ERROR_MESSAGES[code]}}


def _terminal_failure(
    team_id: int, record_id: str, generation_request: GenerationRequest, code: str
) -> response.Response:
    record = write_record(team_id, failed_record(record_id, generation_request, code))
    return response.Response(record.envelope(), status=status.HTTP_200_OK)


def _status_for(record: GenerationRecord) -> int:
    """Status codes are retry instructions: only a still-running generation asks to be polled
    again, so a terminal failure answers 200 alongside a success."""
    return status.HTTP_202_ACCEPTED if record.status == "pending" else status.HTTP_200_OK


class WorkflowLLMGenerationViewSet(TeamAndOrgViewSetMixin, viewsets.ViewSet):
    """Runs a workflow Generate text step. Submit returns a handle; retrieve polls it."""

    scope_object = "hog_flow"
    authentication_classes = [TeamSecretTokenAuthentication, SessionAuthentication]
    permission_classes = [TeamSecretTokenPermission]

    def get_throttles(self) -> list[BaseThrottle]:
        # The throttle bounds enqueue rate; occupancy is bounded by the task's concurrency cap.
        # Polling must stay free or a run in progress would throttle itself out of its own result.
        return [WorkflowLLMGenerationSubmitThrottle()] if self.action == "create" else []

    @validated_request(
        request_serializer=WorkflowLLMGenerationSubmitSerializer,
        responses={
            200: OpenApiResponse(response=WorkflowLLMGenerationSerializer, description="Terminal result"),
            202: OpenApiResponse(response=WorkflowLLMGenerationSerializer, description="Accepted, poll for a result"),
            404: OpenApiResponse(
                response=WorkflowLLMGenerationSerializer, description="Generate text is off for this project"
            ),
        },
        summary="Submit a workflow text generation",
    )
    def create(self, req: request.Request, **kwargs) -> response.Response:
        data = req.validated_data
        if not is_llm_action_enabled(self.team):
            # A saved workflow keeps the node on the canvas when the flag is rolled back, so this
            # is the terminal answer the run log shows rather than a reason to poll.
            return response.Response(_unavailable_envelope("feature_unavailable"), status=status.HTTP_404_NOT_FOUND)

        generation_request = GenerationRequest(
            invocation_id=data["invocation_id"],
            hog_flow_id=data["hog_flow_id"],
            prompt=data["prompt"],
            model=data["model"],
            output_fields=data["output_fields"],
        )
        record_id = generation_id(generation_request)

        # The record doubles as the dedupe store, so a resubmit hands back the running or finished
        # generation instead of paying for it twice.
        existing = read_record(self.team_id, record_id)
        if existing is not None:
            return response.Response(existing.envelope(), status=_status_for(existing))

        # Both gates run before enqueue, so their answer is the generation's terminal result rather
        # than a request-level fault the caller would have to translate.
        if generation_request.model not in WORKFLOW_LLM_SUPPORTED_MODELS:
            return _terminal_failure(self.team_id, record_id, generation_request, "invalid_model")
        if is_team_over_ai_credit_budget(self.team.api_token):
            return _terminal_failure(self.team_id, record_id, generation_request, "quota_exceeded")

        record = GenerationRecord(id=record_id, status="pending", request=generation_request)
        if not claim_pending(self.team_id, record):
            # The read above raced a concurrent submit of the same payload, which is what the
            # caller's own submit timeout produces. Hand back its handle rather than paying twice.
            claimed = read_record(self.team_id, record_id)
            if claimed is not None:
                return response.Response(claimed.envelope(), status=_status_for(claimed))

        transaction.on_commit(lambda: run_workflow_llm_generation.delay(team_id=self.team_id, generation_id=record_id))
        return response.Response(record.envelope(), status=status.HTTP_202_ACCEPTED)

    @validated_request(
        responses={
            200: OpenApiResponse(response=WorkflowLLMGenerationSerializer, description="Terminal result"),
            202: OpenApiResponse(response=WorkflowLLMGenerationSerializer, description="Still running"),
            404: OpenApiResponse(description="No such generation"),
        },
        summary="Read a workflow text generation",
    )
    def retrieve(self, req: request.Request, pk: str, **kwargs) -> response.Response:
        record = read_record(self.team_id, pk)
        if record is None:
            return response.Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return response.Response(record.envelope(), status=_status_for(record))
