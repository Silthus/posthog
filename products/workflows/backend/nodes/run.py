from typing import Any

from posthog.models.activity_logging.activity_log import Trigger
from posthog.models.user import User

from products.workflows.backend.facade.contracts import NodeOutcome, NodeRunCall, NodeRunClaims
from products.workflows.backend.models import HogFlow
from products.workflows.backend.models.hog_flow_revision import HogFlowRevision
from products.workflows.backend.nodes.feature_flag import FEATURE_FLAG_NODE
from products.workflows.backend.nodes.manifest import NodeManifest, NodeOperation, NodeRunContext

NATIVE_ACTION_TYPE = "native"
ACTIVE_PUBLISHER = "workflow:active_publisher"

NODES: dict[str, NodeManifest] = {manifest.key: manifest for manifest in (FEATURE_FLAG_NODE,)}


def run_workflow_node(*, team_id: int, claims: NodeRunClaims, call: NodeRunCall) -> NodeOutcome:
    flow = HogFlow.objects.select_related("team").filter(team_id=team_id, id=claims.hog_flow_id).first()
    if flow is None:
        return NodeOutcome.failed("This workflow no longer exists.")
    if flow.version != claims.hog_flow_version:
        return NodeOutcome.failed("This workflow was published again after the run reached this step.")
    if not _published_flow_has_step(flow, claims.action_id, call):
        return NodeOutcome.failed("This step is not part of the published workflow.")
    operation = _find_operation(call)
    if operation is None:
        return NodeOutcome.failed(f"The step operation {call.node}.{call.operation} does not exist.")
    publisher = _active_publisher(team_id, flow)
    if publisher is None:
        return NodeOutcome.not_permitted(
            missing_permission=ACTIVE_PUBLISHER,
            reason="This workflow version has no active publisher. Publish the workflow again to run this step.",
        )
    context = NodeRunContext(
        team=flow.team,
        actor=publisher,
        trigger=Trigger(
            job_type="hog_flow",
            job_id=str(flow.id),
            payload={"run": claims.dispatch_key, "action": claims.action_id},
        ),
    )
    return operation.execute(context, call.inputs)


def _published_flow_has_step(flow: HogFlow, action_id: str, call: NodeRunCall) -> bool:
    actions = flow.actions if isinstance(flow.actions, list) else []
    action = next((action for action in actions if action.get("id") == action_id), None)
    if action is None or action.get("type") != NATIVE_ACTION_TYPE:
        return False
    config = action.get("config") or {}
    return config.get("node") == call.node and config.get("operation") == call.operation


def _find_operation(call: NodeRunCall) -> NodeOperation[Any] | None:
    manifest = NODES.get(call.node)
    return manifest.operation(call.operation) if manifest else None


def _active_publisher(team_id: int, flow: HogFlow) -> User | None:
    revision = (
        HogFlowRevision.objects.for_team(team_id)
        .filter(hog_flow_id=flow.id, version=flow.version)
        .select_related("created_by")
        .first()
    )
    publisher = revision.created_by if revision else None
    return publisher if publisher is not None and publisher.is_active else None
