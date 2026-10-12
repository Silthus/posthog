from typing import Any

from rest_framework import serializers

from posthog.cdp.validation import InputsSchemaSerializer, InputsSerializer

from products.workflows.backend.facade.nodes import find_operation_spec, native_steps_enabled

NATIVE_STEPS_UNAVAILABLE = "Native steps are not available in this project yet."


class NativeStepInputsSerializer(serializers.Serializer):
    inputs_schema = InputsSchemaSerializer(help_text="The operation's input definitions from the node catalog.")
    inputs = InputsSerializer(help_text="The step's input values, keyed by input key.")

    def to_internal_value(self, data: Any) -> Any:
        self.initial_data = data
        return super().to_internal_value(data)


def _flag_admits_step(data: dict, context: dict) -> bool:
    get_team = context.get("get_team")
    if get_team is None:
        return True
    already_stored = data.get("id") in (context.get("stored_gated_action_ids") or set())
    return already_stored or native_steps_enabled(get_team())


def validate_native_step(data: dict, *, strict: bool, context: dict) -> None:
    if not _flag_admits_step(data, context):
        if strict:
            raise serializers.ValidationError({"type": NATIVE_STEPS_UNAVAILABLE})
        return

    config = data["config"]
    operation = find_operation_spec(config.get("node"), config.get("operation"))
    if operation is None:
        if strict:
            raise serializers.ValidationError(
                {
                    "config": (
                        f"The node catalog has no operation {config.get('node')}.{config.get('operation')}. "
                        "List the available ones with GET /api/projects/<project_id>/workflow_nodes/ "
                        "or the workflows-list-nodes MCP tool."
                    )
                }
            )
        return

    inputs = NativeStepInputsSerializer(
        data={"inputs_schema": list(operation.inputs_schema), "inputs": config.get("inputs") or {}},
        context={"function_type": "destination", "get_team": context.get("get_team")},
    )
    if inputs.is_valid():
        config["inputs"] = inputs.validated_data["inputs"]
    elif strict:
        raise serializers.ValidationError(inputs.errors)
