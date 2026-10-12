import uuid
from typing import Any, cast

from drf_spectacular.utils import OpenApiResponse
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from posthog.api.mixins import ValidatedRequest, validated_request
from posthog.auth import InternalAPIUser, ScopedServiceJWTAuthentication

from products.workflows.backend.facade.contracts import NodeRunCall, NodeRunClaims
from products.workflows.backend.facade.nodes import run_workflow_node
from products.workflows.backend.facade.service_jwt import WORKFLOW_NODES_RUN_PURPOSE


class WorkflowNodeRunsJWTAuthentication(ScopedServiceJWTAuthentication):
    purpose = WORKFLOW_NODES_RUN_PURPOSE

    # nosemgrep: tuple-return-prefer-dataclass -- DRF's (user, auth) authentication contract
    def _authenticate_claims(self, request: Request, claims: dict[str, Any]) -> tuple[Any, Any]:
        user, _ = super()._authenticate_claims(request, claims)
        try:
            run_claims = NodeRunClaims(
                hog_flow_id=uuid.UUID(str(claims["hog_flow_id"])),
                hog_flow_version=int(claims["hog_flow_version"]),
                action_id=str(claims["action_id"]),
                dispatch_key=str(claims["dispatch_key"]),
            )
        except (KeyError, TypeError, ValueError):
            raise AuthenticationFailed("Service token is missing its workflow step claims.")
        return user, run_claims


class WorkflowNodeRunRequestSerializer(serializers.Serializer):
    node = serializers.CharField(max_length=100, help_text="Key of the node the step runs, for example feature_flag.")
    operation = serializers.CharField(
        max_length=100, help_text="Key of the node operation the step runs, for example set_rollout_percentage."
    )
    inputs = serializers.DictField(
        child=serializers.JSONField(),
        help_text="The step's inputs, already rendered by the workflow worker. The operation validates them.",
    )


class WorkflowNodeRunResponseSerializer(serializers.Serializer):
    status = serializers.CharField(help_text="outcome when the operation finished and chose an outcome.")
    outcome = serializers.CharField(
        help_text="The outcome the operation chose. The workflow follows the edge for this outcome."
    )
    result = serializers.DictField(
        child=serializers.JSONField(),
        help_text="Small result object for the step's output variable. failed carries reason; not_permitted also carries missing_permission.",
    )


class WorkflowNodeRunViewSet(viewsets.ViewSet):
    authentication_classes = [WorkflowNodeRunsJWTAuthentication]
    permission_classes = [IsAuthenticated]

    @validated_request(
        WorkflowNodeRunRequestSerializer,
        responses={
            200: OpenApiResponse(
                response=WorkflowNodeRunResponseSerializer, description="The outcome the step's operation chose"
            )
        },
        summary="Run a native workflow step",
    )
    @action(detail=False, methods=["post"])
    def run(self, request: ValidatedRequest, **kwargs: Any) -> Response:
        team_id = cast(int, cast(InternalAPIUser, request.user).current_team_id)
        outcome = run_workflow_node(
            team_id=team_id,
            claims=cast(NodeRunClaims, request.auth),
            call=NodeRunCall(
                node=request.validated_data["node"],
                operation=request.validated_data["operation"],
                inputs=request.validated_data["inputs"],
            ),
        )
        return Response({"status": "outcome", "outcome": outcome.outcome, "result": outcome.result})
