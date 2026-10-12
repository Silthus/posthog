from copy import deepcopy
from typing import Any

from posthog.test.base import APIBaseTest
from unittest.mock import patch

from django.test import SimpleTestCase

from parameterized import parameterized
from rest_framework import status

from posthog.cdp.templates.hog_function_template import sync_template_to_db

from products.cdp.backend.api.test.test_hog_function_templates import MOCK_NODE_TEMPLATES
from products.workflows.backend.models import HogFlow
from products.workflows.backend.presentation.views.hog_flow import HogFlowActionSerializer

_FLAG_CHECK = "posthog.cdp.flag_gated_templates.posthoganalytics.feature_enabled"


def _native_action(inputs: dict[str, Any], *, node: str = "feature_flag", operation: str = "set_rollout_percentage"):
    return {
        "id": "rollout_10",
        "name": "Roll out to 10%",
        "type": "native",
        "config": {"node": node, "operation": operation, "inputs": inputs},
    }


_VALID_INPUTS = {
    "flag_key": {"value": "new-checkout"},
    "rollout_percentage": {"value": "10"},
    "expected_version": {"value": "{variables.flag.version}"},
}

_CREATE_TASK_STEP = {
    "id": "rollout_10",
    "name": "Investigate",
    "type": "function",
    "config": {"template_id": "template-posthog-create-task", "inputs": {"prompt": {"value": "Investigate"}}},
}


class TestNativeStepValidation(SimpleTestCase):
    def _errors(self, action: dict, *, flag_enabled: bool = True, is_draft: bool = False) -> str:
        serializer = HogFlowActionSerializer(data=action, context={"get_team": lambda: None, "is_draft": is_draft})
        with patch("products.workflows.backend.nodes.catalog.gated_template_enabled", return_value=flag_enabled):
            serializer.is_valid()
        return str(serializer.errors)

    @parameterized.expand(
        [
            ("run_variable", False, {"value": "{variables.flag.version}"}),
            ("warehouse_row", True, {"value": "{record.version}"}),
        ]
    )
    def test_compiles_templated_inputs(self, _name, is_dwh_source, expected_version):
        serializer = HogFlowActionSerializer(
            data=_native_action({**_VALID_INPUTS, "expected_version": expected_version}),
            context={"get_team": lambda: None, "is_draft": False, "is_dwh_source": is_dwh_source},
        )
        with patch("products.workflows.backend.nodes.catalog.gated_template_enabled", return_value=True):
            assert serializer.is_valid(), serializer.errors

        inputs = serializer.validated_data["config"]["inputs"]
        assert inputs["expected_version"]["bytecode"][0] == "_H"
        assert inputs["flag_key"]["value"] == "new-checkout"

    def test_accepts_an_empty_optional_input(self):
        assert self._errors(_native_action({**_VALID_INPUTS, "expected_version": {"value": ""}})) == "{}"

    @parameterized.expand(
        [
            ("unknown_node", _native_action(_VALID_INPUTS, node="rocket"), "has no operation rocket.set_rollout"),
            ("unknown_operation", _native_action(_VALID_INPUTS, operation="launch"), "has no operation feature_flag"),
            ("missing_required_input", _native_action({"rollout_percentage": {"value": "10"}}), "flag_key"),
            (
                "non_string_input",
                _native_action({**_VALID_INPUTS, "rollout_percentage": {"value": 10}}),
                "Value must be a string",
            ),
            (
                "falsy_non_string_input",
                _native_action({**_VALID_INPUTS, "flag_key": {"value": 0}}),
                "Value must be a string",
            ),
            (
                "broken_template",
                _native_action({**_VALID_INPUTS, "flag_key": {"value": "{flag."}}),
                "Invalid template",
            ),
        ]
    )
    def test_rejects_config_the_manifest_does_not_describe(self, _name, action, message):
        assert message in self._errors(action)

    @parameterized.expand([("strict_save", False, True), ("web_builder_draft", True, False)])
    def test_flag_off_rejects_native_steps_only_in_strict_saves(self, _name, is_draft, rejected):
        errors = self._errors(_native_action(_VALID_INPUTS), flag_enabled=False, is_draft=is_draft)

        assert ("Native steps are not available" in errors) is rejected


class TestNativeStepsAPI(APIBaseTest):
    def setUp(self) -> None:
        super().setUp()
        sync_template_to_db(
            {
                **deepcopy(MOCK_NODE_TEMPLATES[0]),
                "id": "template-posthog-create-task",
                "inputs_schema": [{"key": "prompt", "type": "string", "label": "Instructions", "required": True}],
            }
        )

    def _flow(self, step: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "name": "Staged rollout",
            "actions": [
                {
                    "id": "trigger_node",
                    "name": "Trigger",
                    "type": "trigger",
                    "config": {"type": "event", "filters": {"events": [{"id": "$pageview", "type": "events"}]}},
                },
                step or _native_action(_VALID_INPUTS),
                {"id": "exit_node", "name": "Exit", "type": "exit", "config": {}},
            ],
            "edges": [
                {"from": "trigger_node", "to": "rollout_10", "type": "continue"},
                {"from": "rollout_10", "to": "exit_node", "type": "continue"},
                {"from": "rollout_10", "to": "exit_node", "type": "branch", "outcome": "changed_elsewhere"},
            ],
        }

    def _create(self, *, flag_enabled: bool, step: dict[str, Any] | None = None):
        with patch(_FLAG_CHECK, return_value=flag_enabled):
            return self.client.post(
                f"/api/projects/{self.team.id}/hog_flows", self._flow(step), format="json", HTTP_X_POSTHOG_CLIENT="mcp"
            )

    def _create_active(self, step: dict[str, Any] | None = None) -> str:
        flow_id = self._create(flag_enabled=True, step=step).json()["id"]
        with patch(_FLAG_CHECK, return_value=True):
            activate = self.client.patch(
                f"/api/projects/{self.team.id}/hog_flows/{flow_id}", {"status": "active"}, format="json"
            )
        assert activate.status_code == status.HTTP_200_OK, activate.json()
        return flow_id

    def _resave_with_flags_off(self, flow_id: str, actions: list[dict[str, Any]]):
        with patch(_FLAG_CHECK, return_value=False):
            return self.client.patch(
                f"/api/projects/{self.team.id}/hog_flows/{flow_id}",
                {"name": "Renamed rollout", "actions": actions},
                format="json",
            )

    def test_saves_a_native_step_with_its_outcome_edge(self):
        response = self._create(flag_enabled=True)

        assert response.status_code == status.HTTP_201_CREATED, response.json()
        flow = HogFlow.objects.get(id=response.json()["id"])
        assert {"from": "rollout_10", "to": "exit_node", "type": "branch", "outcome": "changed_elsewhere"} in flow.edges
        native = next(action for action in flow.actions if action["type"] == "native")
        assert native["config"]["inputs"]["expected_version"]["bytecode"][0] == "_H"

    def test_rejects_a_native_step_while_the_flag_is_off(self):
        response = self._create(flag_enabled=False)

        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.json()
        assert "Native steps are not available" in response.json()["detail"]

    def test_stored_native_step_survives_the_flag_turning_off(self):
        flow_id = self._create_active()

        response = self._resave_with_flags_off(flow_id, HogFlow.objects.get(id=flow_id).actions)

        assert response.status_code == status.HTTP_200_OK, response.json()

    @parameterized.expand(
        [
            ("native_step_to_gated_template", None, _CREATE_TASK_STEP, "Template not found"),
            ("gated_template_to_native_step", _CREATE_TASK_STEP, None, "Native steps are not available"),
            (
                "exit_carrying_a_gated_template_id",
                {**_CREATE_TASK_STEP, "type": "exit"},
                _CREATE_TASK_STEP,
                "Template not found",
            ),
        ]
    )
    def test_a_stored_step_does_not_admit_a_different_gated_step_at_its_id(self, _name, stored, replacement, message):
        flow_id = self._create_active(stored)
        actions = [
            replacement or _native_action(_VALID_INPUTS) if action["id"] == "rollout_10" else action
            for action in HogFlow.objects.get(id=flow_id).actions
        ]

        response = self._resave_with_flags_off(flow_id, actions)

        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.json()
        assert message in response.json()["detail"]

    def test_catalog_lists_operations_with_inputs_and_every_outcome(self):
        with patch(_FLAG_CHECK, return_value=True):
            response = self.client.get(f"/api/projects/{self.team.id}/workflow_nodes/")

        assert response.status_code == status.HTTP_200_OK, response.json()
        [node] = response.json()
        [operation] = node["operations"]
        assert (node["key"], operation["key"]) == ("feature_flag", "set_rollout_percentage")
        assert operation["outcomes"] == ["done", "changed_elsewhere", "needs_approval", "failed", "not_permitted"]
        assert [(item["key"], item["required"], item["templating"]) for item in operation["inputs_schema"]] == [
            ("flag_key", True, "hog"),
            ("rollout_percentage", True, "hog"),
            ("expected_version", False, "hog"),
        ]

    def test_catalog_is_hidden_while_the_flag_is_off(self):
        with patch(_FLAG_CHECK, return_value=False):
            response = self.client.get(f"/api/projects/{self.team.id}/workflow_nodes/")

        assert response.status_code == status.HTTP_404_NOT_FOUND
