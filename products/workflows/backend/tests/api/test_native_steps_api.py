from typing import Any

from posthog.test.base import APIBaseTest
from unittest.mock import patch

from django.test import SimpleTestCase

from parameterized import parameterized
from rest_framework import status

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


class TestNativeStepValidation(SimpleTestCase):
    def _errors(self, action: dict, *, flag_enabled: bool = True, is_draft: bool = False) -> str:
        serializer = HogFlowActionSerializer(data=action, context={"get_team": lambda: None, "is_draft": is_draft})
        with patch("products.workflows.backend.nodes.catalog.gated_template_enabled", return_value=flag_enabled):
            serializer.is_valid()
        return str(serializer.errors)

    def test_compiles_templated_inputs(self):
        serializer = HogFlowActionSerializer(
            data=_native_action(_VALID_INPUTS), context={"get_team": lambda: None, "is_draft": False}
        )
        with patch("products.workflows.backend.nodes.catalog.gated_template_enabled", return_value=True):
            assert serializer.is_valid(), serializer.errors

        inputs = serializer.validated_data["config"]["inputs"]
        assert inputs["expected_version"]["bytecode"][0] == "_H"
        assert inputs["flag_key"]["value"] == "new-checkout"

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
    def _flow(self) -> dict[str, Any]:
        return {
            "name": "Staged rollout",
            "actions": [
                {
                    "id": "trigger_node",
                    "name": "Trigger",
                    "type": "trigger",
                    "config": {"type": "event", "filters": {"events": [{"id": "$pageview", "type": "events"}]}},
                },
                _native_action(_VALID_INPUTS),
                {"id": "exit_node", "name": "Exit", "type": "exit", "config": {}},
            ],
            "edges": [
                {"from": "trigger_node", "to": "rollout_10", "type": "continue"},
                {"from": "rollout_10", "to": "exit_node", "type": "continue"},
                {"from": "rollout_10", "to": "exit_node", "type": "branch", "outcome": "changed_elsewhere"},
            ],
        }

    def _create(self, *, flag_enabled: bool):
        with patch(_FLAG_CHECK, return_value=flag_enabled):
            return self.client.post(
                f"/api/projects/{self.team.id}/hog_flows", self._flow(), format="json", HTTP_X_POSTHOG_CLIENT="mcp"
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
        flow_id = self._create(flag_enabled=True).json()["id"]
        with patch(_FLAG_CHECK, return_value=True):
            activate = self.client.patch(
                f"/api/projects/{self.team.id}/hog_flows/{flow_id}", {"status": "active"}, format="json"
            )
        assert activate.status_code == status.HTTP_200_OK, activate.json()

        with patch(_FLAG_CHECK, return_value=False):
            response = self.client.patch(
                f"/api/projects/{self.team.id}/hog_flows/{flow_id}",
                {"name": "Renamed rollout", "actions": HogFlow.objects.get(id=flow_id).actions},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK, response.json()

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
