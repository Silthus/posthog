from typing import Any

from posthog.cdp.flag_gated_templates import gated_template_enabled
from posthog.models.team.team import Team

from products.workflows.backend.facade.contracts import NodeOperationSpec, NodeSpec
from products.workflows.backend.nodes.feature_flag import FEATURE_FLAG_NODE
from products.workflows.backend.nodes.manifest import NodeManifest, NodeOperation

NATIVE_ACTION_TYPE = "native"
NATIVE_STEPS_FLAG = "workflows-native-steps"

NODES: dict[str, NodeManifest] = {manifest.key: manifest for manifest in (FEATURE_FLAG_NODE,)}


def find_operation(node_key: Any, operation_key: Any) -> NodeOperation[Any] | None:
    manifest = NODES.get(node_key) if isinstance(node_key, str) else None
    return manifest.operation(operation_key) if manifest and isinstance(operation_key, str) else None


def find_operation_spec(node_key: Any, operation_key: Any) -> NodeOperationSpec | None:
    operation = find_operation(node_key, operation_key)
    return operation.spec() if operation else None


def list_nodes() -> list[NodeSpec]:
    return [manifest.spec() for manifest in NODES.values()]


def native_steps_enabled(team: Team) -> bool:
    return gated_template_enabled(NATIVE_STEPS_FLAG, team)
