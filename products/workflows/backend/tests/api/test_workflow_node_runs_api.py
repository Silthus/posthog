from datetime import timedelta
from typing import Any

from posthog.test.base import APIBaseTest
from unittest.mock import patch

from django.test import override_settings

from parameterized import parameterized
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied

from posthog.constants import AvailableFeature
from posthog.jwt import PosthogJwtAudience, encode_jwt
from posthog.models.activity_logging.activity_log import ActivityLog
from posthog.models.organization import Organization, OrganizationMembership
from posthog.models.scoping import team_scope
from posthog.models.team.team import Team

from products.access_control.backend.models.access_control import AccessControl
from products.approvals.backend.exceptions import PolicyConflict
from products.approvals.backend.models import ApprovalPolicy, ChangeRequest
from products.feature_flags.backend.facade.api import user_can_edit_flag
from products.feature_flags.backend.models.feature_flag import FeatureFlag
from products.workflows.backend.models import HogFlow
from products.workflows.backend.models.hog_flow_revision import HogFlowRevision

SECRET = "test-workflow-nodes-run-jwt"
ACTION_ID = "action_set_rollout"
DISPATCH_KEY = "invocation-1:action_set_rollout:3:0"
_CAN_EDIT_FLAG = "products.workflows.backend.nodes.feature_flag.user_can_edit_flag"
_SET_ROLLOUT = "products.workflows.backend.nodes.feature_flag.set_release_condition_rollout"


@override_settings(WORKFLOW_NODES_RUN_JWT_SECRETS=[SECRET])
class TestWorkflowNodeRunsAPI(APIBaseTest):
    def setUp(self) -> None:
        super().setUp()
        self.client.logout()
        self.flag = FeatureFlag.objects.create(
            team=self.team,
            created_by=self.user,
            key="new-checkout",
            name="New checkout",
            active=True,
            filters={"groups": [{"properties": [], "rollout_percentage": 10}]},
        )
        self.hog_flow = HogFlow.objects.create(
            team=self.team,
            name="Staged rollout",
            created_by=self.user,
            status=HogFlow.State.ACTIVE,
            trigger={"type": "schedule"},
            actions=[
                {
                    "id": ACTION_ID,
                    "type": "native",
                    "config": {
                        "node": "feature_flag",
                        "operation": "set_rollout_percentage",
                        "inputs": {"flag_key": {"value": "new-checkout"}, "rollout_percentage": {"value": 25}},
                    },
                }
            ],
        )
        with team_scope(self.team.id):
            HogFlowRevision.objects.create(
                team=self.team, hog_flow=self.hog_flow, version=self.hog_flow.version, content={}, created_by=self.user
            )

    def _token(self, **claims: Any) -> str:
        return encode_jwt(
            {
                "team_id": self.team.id,
                "hog_flow_id": str(self.hog_flow.id),
                "hog_flow_version": self.hog_flow.version,
                "action_id": ACTION_ID,
                "dispatch_key": DISPATCH_KEY,
                **claims,
            },
            timedelta(minutes=5),
            PosthogJwtAudience.WORKFLOW_NODES_RUN,
            signing_key=SECRET,
        )

    def _run(self, inputs: dict[str, Any] | None = None, token: str | None = None) -> Any:
        return self.client.post(
            f"/api/projects/{self.team.id}/internal/workflow_nodes/run/",
            {
                "node": "feature_flag",
                "operation": "set_rollout_percentage",
                "inputs": {
                    "flag_key": "new-checkout",
                    "rollout_percentage": 25,
                    "expected_version": "",
                    **(inputs or {}),
                },
            },
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token or self._token()}",
        )

    def test_sets_the_rollout_percentage_as_the_workflow_publisher(self) -> None:
        response = self._run()

        assert response.status_code == status.HTTP_200_OK, response.content
        self.flag.refresh_from_db()
        assert response.json() == {
            "status": "outcome",
            "outcome": "done",
            "result": {
                "flag_id": self.flag.id,
                "flag_key": "new-checkout",
                "rollout_percentage": 25,
                "version": self.flag.version,
            },
        }
        assert self.flag.conditions[0]["rollout_percentage"] == 25
        assert self.flag.last_modified_by == self.user
        log = ActivityLog.objects.get(scope="FeatureFlag", item_id=str(self.flag.id), activity="updated")
        assert log.detail is not None
        assert log.detail["trigger"] == {
            "job_type": "hog_flow",
            "job_id": str(self.hog_flow.id),
            "payload": {"run": DISPATCH_KEY, "action": ACTION_ID},
        }

    def test_a_retry_already_at_the_target_is_done_without_writing(self) -> None:
        self._run()
        self.flag.refresh_from_db()
        version_after_first_write = self.flag.version or 0

        response = self._run({"expected_version": version_after_first_write - 1})

        assert response.json()["outcome"] == "done", response.content
        assert response.json()["result"]["version"] == version_after_first_write
        self.flag.refresh_from_db()
        assert self.flag.version == version_after_first_write

    def test_a_concurrent_retry_that_loses_the_race_to_the_target_is_done(self) -> None:
        def concurrent_write_lands_after_the_read(flag: FeatureFlag, **kwargs: Any) -> bool:
            FeatureFlag.objects.filter(id=flag.id).update(
                filters={"groups": [{"properties": [], "rollout_percentage": 25}]}, version=(flag.version or 0) + 1
            )
            return user_can_edit_flag(flag, **kwargs)

        with patch(_CAN_EDIT_FLAG, side_effect=concurrent_write_lands_after_the_read):
            response = self._run()

        assert response.json()["outcome"] == "done", response.content
        self.flag.refresh_from_db()
        assert response.json()["result"]["version"] == self.flag.version

    def test_a_stale_expected_version_is_changed_elsewhere_and_writes_nothing(self) -> None:
        stale_version = self.flag.version or 0
        self.flag.filters = {"groups": [{"properties": [], "rollout_percentage": 15}]}
        self.flag.version = stale_version + 1
        self.flag.save()

        response = self._run({"expected_version": stale_version})

        assert response.json() == {
            "status": "outcome",
            "outcome": "changed_elsewhere",
            "result": {
                "flag_id": self.flag.id,
                "flag_key": "new-checkout",
                "rollout_percentage": 15,
                "version": stale_version + 1,
            },
        }
        self.flag.refresh_from_db()
        assert self.flag.conditions[0]["rollout_percentage"] == 15

    @patch("products.approvals.backend.decorators._is_approvals_enabled", return_value=True)
    def test_an_approval_policy_answers_needs_approval_and_keeps_the_change_request(self, _approvals_enabled) -> None:
        self.organization.available_product_features = [
            {"key": AvailableFeature.APPROVALS, "name": AvailableFeature.APPROVALS}
        ]
        self.organization.save()
        ApprovalPolicy.objects.create(
            organization=self.organization,
            team=self.team,
            action_key="feature_flag.update",
            conditions={},
            approver_config={"quorum": 1, "users": [self.user.id]},
            created_by=self.user,
        )

        response = self._run()

        change_request = ChangeRequest.objects.get(team=self.team)
        assert response.json() == {
            "status": "outcome",
            "outcome": "needs_approval",
            "result": {
                "flag_id": self.flag.id,
                "flag_key": "new-checkout",
                "rollout_percentage": 10,
                "version": self.flag.version,
                "change_request_id": str(change_request.id),
            },
        }
        assert change_request.resource_id == str(self.flag.id)
        self.flag.refresh_from_db()
        assert self.flag.conditions[0]["rollout_percentage"] == 10

    @parameterized.expand(
        [
            ("deny_policy", PermissionDenied("This action is not allowed by approval policy."), "not_permitted"),
            ("policy_conflict", PolicyConflict([], "This change matches multiple approval policies", ""), "failed"),
            ("gate_error", APIException("Failed to create approval request"), "failed"),
        ]
    )
    def test_an_approval_gate_refusal_answers_with_an_outcome(
        self, _name: str, refusal: Exception, expected_outcome: str
    ) -> None:
        with patch(_SET_ROLLOUT, side_effect=refusal):
            response = self._run()

        assert response.status_code == status.HTTP_200_OK, response.content
        assert response.json()["outcome"] == expected_outcome
        assert response.json()["result"]["reason"]

    def test_a_publisher_without_editor_access_to_the_flag_is_not_permitted(self) -> None:
        self.organization.available_product_features = [
            {"key": AvailableFeature.ACCESS_CONTROL, "name": AvailableFeature.ACCESS_CONTROL}
        ]
        self.organization.save()
        self.organization_membership.level = OrganizationMembership.Level.MEMBER
        self.organization_membership.save()
        self.flag.created_by = self._create_user("flag-owner@example.com")
        self.flag.save()
        AccessControl.objects.create(
            team=self.team,
            resource="feature_flag",
            resource_id=str(self.flag.id),
            access_level="viewer",
            organization_member=self.organization_membership,
        )

        response = self._run()

        assert response.json()["outcome"] == "not_permitted", response.content
        assert response.json()["result"]["missing_permission"] == "feature_flag:editor"
        self.flag.refresh_from_db()
        assert self.flag.conditions[0]["rollout_percentage"] == 10

    def test_an_inactive_publisher_is_not_permitted(self) -> None:
        self.user.is_active = False
        self.user.save()

        response = self._run()

        assert response.json()["outcome"] == "not_permitted", response.content
        assert response.json()["result"]["missing_permission"] == "workflow:active_publisher"
        self.flag.refresh_from_db()
        assert self.flag.conditions[0]["rollout_percentage"] == 10

    @parameterized.expand(
        [
            ("unknown_flag", {"flag_key": "missing-flag"}, None),
            ("percentage_out_of_range", {"rollout_percentage": 150}, None),
            (
                "two_release_conditions",
                {},
                {"groups": [{"properties": [], "rollout_percentage": 10}, {"properties": [], "rollout_percentage": 5}]},
            ),
        ]
    )
    def test_a_step_the_flag_cannot_take_fails_with_a_reason(
        self, _name: str, inputs: dict[str, Any], filters: dict[str, Any] | None
    ) -> None:
        if filters is not None:
            self.flag.filters = filters
            self.flag.save()

        response = self._run(inputs)

        assert response.json()["outcome"] == "failed", response.content
        assert response.json()["result"]["reason"]
        self.flag.refresh_from_db()
        assert self.flag.conditions[0]["rollout_percentage"] == 10

    def test_a_token_for_an_older_flow_version_fails_without_writing(self) -> None:
        response = self._run(token=self._token(hog_flow_version=self.hog_flow.version - 1))

        assert response.json()["outcome"] == "failed", response.content
        self.flag.refresh_from_db()
        assert self.flag.conditions[0]["rollout_percentage"] == 10

    def test_a_token_naming_another_teams_flow_fails_without_writing(self) -> None:
        other_team = Team.objects.create(organization=Organization.objects.create(name="Other org"), name="Other")
        other_flow = HogFlow.objects.create(team=other_team, name="Other flow", actions=self.hog_flow.actions)

        response = self._run(token=self._token(hog_flow_id=str(other_flow.id), hog_flow_version=other_flow.version))

        assert response.json()["outcome"] == "failed", response.content
        self.flag.refresh_from_db()
        assert self.flag.conditions[0]["rollout_percentage"] == 10

    def test_a_step_that_is_not_the_claimed_action_fails_without_writing(self) -> None:
        self.hog_flow.actions = [{**self.hog_flow.actions[0], "config": {"node": "feature_flag", "operation": "other"}}]
        self.hog_flow.save()

        response = self._run(token=self._token(hog_flow_version=self.hog_flow.version))

        assert response.json()["outcome"] == "failed", response.content
        self.flag.refresh_from_db()
        assert self.flag.conditions[0]["rollout_percentage"] == 10

    @parameterized.expand([("unprovisioned_key", []), ("other_key", ["another-secret"])])
    def test_a_call_without_a_token_this_route_can_verify_is_rejected(self, _name: str, keys: list[str]) -> None:
        with override_settings(WORKFLOW_NODES_RUN_JWT_SECRETS=keys):
            response = self._run()

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        self.flag.refresh_from_db()
        assert self.flag.conditions[0]["rollout_percentage"] == 10
