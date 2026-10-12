from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, serializers, viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from posthog.api.routing import TeamAndOrgViewSetMixin
from posthog.cdp.validation import InputsSchemaItemSerializer

from products.workflows.backend.facade.nodes import list_nodes, native_steps_enabled


class WorkflowNodeOperationSerializer(serializers.Serializer):
    key = serializers.CharField(help_text="Operation key. Use it as config.operation on a native step.")
    name = serializers.CharField(help_text="Display name of the operation.")
    description = serializers.CharField(help_text="What the operation does and what each of its outcomes means.")
    inputs_schema = InputsSchemaItemSerializer(
        many=True,
        help_text="The step's inputs. Set each one as config.inputs.<key> = {value: <hog template string>}.",
    )
    outcomes = serializers.ListField(
        child=serializers.CharField(),
        help_text=(
            "Every outcome the step can end with, primary first. The primary outcome follows the step's continue "
            "edge; any other outcome follows a 'branch' edge with a matching 'outcome'."
        ),
    )


class WorkflowNodeSerializer(serializers.Serializer):
    key = serializers.CharField(help_text="Node key. Use it as config.node on a native step.")
    name = serializers.CharField(help_text="Display name of the node.")
    operations = WorkflowNodeOperationSerializer(many=True, help_text="The operations this node can run.")


class WorkflowNodeViewSet(TeamAndOrgViewSetMixin, viewsets.ViewSet):
    scope_object = "hog_flow"

    @extend_schema(
        responses={200: WorkflowNodeSerializer(many=True)},
        summary="List the nodes a native workflow step can run",
    )
    def list(self, request: Request, **kwargs: Any) -> Response:
        if not native_steps_enabled(self.team):
            raise exceptions.NotFound()
        return Response(WorkflowNodeSerializer(list_nodes(), many=True).data)
