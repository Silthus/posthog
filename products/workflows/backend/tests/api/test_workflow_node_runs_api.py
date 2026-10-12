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
from products.approvals.backend.exceptions import ApprovalDetectionFailed, PolicyConflict
from products.approvals.backend.models import ApprovalPolicy, ChangeRequest
from products.feature_flags.backend.api.feature_flag import REQUIRE_TAGS_ON_CREATE_ERROR
from products.feature_flags.backend.facade.api import create_flag, user_can_edit_flag
from products.feature_flags.backend.models.feature_flag import FeatureFlag
from products.feature_flags.backend.models.team_feature_flag_policy_config import TeamFeatureFlagPolicyConfig
from products.workflows.backend.models import HogFlow
from products.workflows.backend.models.hog_flow_revision import HogFlowRevision

SECRET = "test-workflow-nodes-run-jwt"
ACTION_ID = "action_set_rollout"
DISPATCH_KEY = "invocation-1:action_set_rollout:3:0"
_CAN_EDIT_FLAG = "products.workflows.backend.nodes.feature_flag.user_can_edit_flag"
_SET_ROLLOUT = "products.workflows.backend.nodes.feature_flag.set_release_condition_rollout"
_CREATE_FLAG = "products.workflows.backend.nodes.feature_flag.create_gated_flag"


@override_settings(WORKFLOW_NODES_RUN_JWT_SECRETS=[SECRET])
class WorkflowNodeRunTestBase(APIBaseTest):
    operation = "set_rollout_percentage"
    default_inputs: dict[str, Any] = {}

    def setUp(self) -> None:
        super().setUp()
        self.client.logout()
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
                        "operation": self.operation,
                        "inputs": {key: {"value": value} for key, value in self.default_inputs.items()},
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
            {"node": "feature_flag", "operation": self.operation, "inputs": {**self.default_inputs, **(inputs or {})}},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token or self._token()}",
        )

    def _require_approval_for(self, action_key: str) -> None:
        self.organization.available_product_features = [
            {"key": AvailableFeature.APPROVALS, "name": AvailableFeature.APPROVALS}
        ]
        self.organization.save()
        ApprovalPolicy.objects.create(
            organization=self.organization,
            team=self.team,
            action_key=action_key,
            conditions={},
            approver_config={"quorum": 1, "users": [self.user.id]},
            created_by=self.user,
        )

    def _limit_publisher_to_flag_viewer(self, resource_id: str | None = None) -> None:
        self.organization.available_product_features = [
            {"key": AvailableFeature.ACCESS_CONTROL, "name": AvailableFeature.ACCESS_CONTROL}
        ]
        self.organization.save()
        self.organization_membership.level = OrganizationMembership.Level.MEMBER
        self.organization_membership.save()
        AccessControl.objects.create(
            team=self.team,
            resource="feature_flag",
            resource_id=resource_id,
            access_level="viewer",
            organization_member=self.organization_membership,
        )


class TestWorkflowNodeRunsAPI(WorkflowNodeRunTestBase):
    default_inputs = {"flag_key": "new-checkout", "rollout_percentage": 25, "expected_version": ""}

    def setUp(self) -> None:
        super().setUp()
        self.flag = FeatureFlag.objects.create(
            team=self.team,
            created_by=self.user,
            key="new-checkout",
            name="New checkout",
            active=True,
            filters={"groups": [{"properties": [], "rollout_percentage": 10}]},
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

    @parameterized.expand(
        [
            ("retry_reached_the_target", [{"properties": [], "rollout_percentage": 25}], "done"),
            (
                "condition_added",
                [{"properties": [], "rollout_percentage": 10}, {"properties": [], "rollout_percentage": 5}],
                "failed",
            ),
        ]
    )
    def test_a_concurrent_write_after_the_read_decides_the_outcome(
        self, _name: str, concurrent_groups: list[dict[str, Any]], expected_outcome: str
    ) -> None:
        def concurrent_write_lands_after_the_read(flag: FeatureFlag, **kwargs: Any) -> bool:
            FeatureFlag.objects.filter(id=flag.id).update(
                filters={"groups": concurrent_groups}, version=(flag.version or 0) + 1
            )
            return user_can_edit_flag(flag, **kwargs)

        with patch(_CAN_EDIT_FLAG, side_effect=concurrent_write_lands_after_the_read):
            response = self._run()

        assert response.json()["outcome"] == expected_outcome, response.content
        self.flag.refresh_from_db()
        assert self.flag.get_filters()["groups"] == concurrent_groups

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
        self._require_approval_for("feature_flag.update")

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
            (
                "deny_policy",
                PermissionDenied("This action is not allowed by approval policy."),
                "not_permitted",
                "approval_policy",
            ),
            (
                "policy_conflict",
                PolicyConflict([], "This change matches multiple approval policies", ""),
                "failed",
                None,
            ),
            (
                "undetectable_approval",
                ApprovalDetectionFailed("Could not determine whether this change needs approval."),
                "failed",
                None,
            ),
            ("gate_error", APIException("Failed to create approval request"), "failed", None),
        ]
    )
    def test_an_approval_gate_refusal_answers_with_an_outcome(
        self, _name: str, refusal: Exception, expected_outcome: str, missing_permission: str | None
    ) -> None:
        with patch(_SET_ROLLOUT, side_effect=refusal):
            response = self._run()

        assert response.status_code == status.HTTP_200_OK, response.content
        assert response.json()["outcome"] == expected_outcome
        assert response.json()["result"]["reason"]
        assert response.json()["result"].get("missing_permission") == missing_permission

    def test_a_publisher_without_editor_access_to_the_flag_is_not_permitted(self) -> None:
        self.flag.created_by = self._create_user("flag-owner@example.com")
        self.flag.save()
        self._limit_publisher_to_flag_viewer(str(self.flag.id))

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
            ("malformed_release_condition", {}, {"groups": [None]}),
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
            FeatureFlag.objects.filter(id=self.flag.id).update(filters=filters)
        stored_filters = FeatureFlag.objects.get(id=self.flag.id).get_filters()

        response = self._run(inputs)

        assert response.json()["outcome"] == "failed", response.content
        assert response.json()["result"]["reason"]
        assert FeatureFlag.objects.get(id=self.flag.id).get_filters() == stored_filters

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


class TestCreateFeatureFlagNodeRunAPI(WorkflowNodeRunTestBase):
    operation = "create_flag"
    default_inputs = {"flag_key": "new-checkout", "name": "New checkout", "tags": "rollout, checkout"}

    def test_creates_an_active_flag_at_zero_percent_as_the_workflow_publisher(self) -> None:
        response = self._run()

        assert response.status_code == status.HTTP_200_OK, response.content
        flag = FeatureFlag.objects.get(team=self.team, key="new-checkout")
        assert response.json() == {
            "status": "outcome",
            "outcome": "done",
            "result": {"flag_id": flag.id, "flag_key": "new-checkout", "rollout_percentage": 0, "version": 1},
        }
        assert flag.active is True
        assert flag.name == "New checkout"
        assert [(condition["properties"], condition["rollout_percentage"]) for condition in flag.conditions] == [
            ([], 0)
        ]
        assert sorted(tag.tag.name for tag in flag.tagged_items.all()) == ["checkout", "rollout"]
        assert flag.created_by == self.user
        log = ActivityLog.objects.get(scope="FeatureFlag", item_id=str(flag.id), activity="created")
        assert log.detail is not None
        assert log.detail["trigger"] == {
            "job_type": "hog_flow",
            "job_id": str(self.hog_flow.id),
            "payload": {"run": DISPATCH_KEY, "action": ACTION_ID},
        }

    def _create_existing_flag(self) -> FeatureFlag:
        return FeatureFlag.objects.create(
            team=self.team,
            created_by=self.user,
            key="new-checkout",
            filters={"groups": [{"properties": [], "rollout_percentage": 40}]},
            version=3,
        )

    def _make_the_flow_team_an_environment(self) -> None:
        root_team = Team.objects.create(organization=self.organization, project=self.project, name="Production")
        self.team.parent_team = root_team
        self.team.save()
        HogFlowRevision.objects.unscoped().filter(hog_flow=self.hog_flow).update(team=root_team)

    @parameterized.expand(
        [
            ("retry", "new-checkout", "before_the_run", False),
            ("retry_with_a_padded_key", " new-checkout ", "before_the_run", False),
            ("retry_in_an_environment", "new-checkout", "before_the_run", True),
            ("concurrent_create", "new-checkout", "after_the_lookup", False),
        ]
    )
    def test_an_existing_key_is_already_exists_with_that_flags_result_and_creates_nothing(
        self, _name: str, flag_key: str, created: str, in_environment: bool
    ) -> None:
        if in_environment:
            self._make_the_flow_team_an_environment()
        existing: list[FeatureFlag] = []
        if created == "before_the_run":
            existing.append(self._create_existing_flag())

        def flag_lands_after_the_lookup(*args: Any, **kwargs: Any) -> FeatureFlag:
            existing.append(self._create_existing_flag())
            return create_flag(*args, **kwargs)

        with patch(
            _CREATE_FLAG, side_effect=flag_lands_after_the_lookup if created == "after_the_lookup" else create_flag
        ):
            response = self._run({"flag_key": flag_key})

        assert response.json() == {
            "status": "outcome",
            "outcome": "already_exists",
            "result": {"flag_id": existing[0].id, "flag_key": "new-checkout", "rollout_percentage": 40, "version": 3},
        }
        assert FeatureFlag.objects.filter(key__contains="new-checkout").count() == 1

    @patch("products.approvals.backend.decorators._is_approvals_enabled", return_value=True)
    def test_an_approval_policy_on_enabling_answers_needs_approval_without_a_flag(self, _approvals_enabled) -> None:
        self._require_approval_for("feature_flag.enable")

        response = self._run()

        change_request = ChangeRequest.objects.get(team=self.team)
        assert response.json() == {
            "status": "outcome",
            "outcome": "needs_approval",
            "result": {
                "flag_id": None,
                "flag_key": "new-checkout",
                "rollout_percentage": 0,
                "version": None,
                "change_request_id": str(change_request.id),
            },
        }
        assert not FeatureFlag.objects.filter(team=self.team).exists()

    def test_a_publisher_who_cannot_create_flags_is_not_permitted(self) -> None:
        self._limit_publisher_to_flag_viewer()

        response = self._run()

        assert response.json()["outcome"] == "not_permitted", response.content
        assert response.json()["result"]["missing_permission"] == "feature_flag:editor"
        assert not FeatureFlag.objects.filter(team=self.team).exists()

    @parameterized.expand(
        [
            ("untagged_where_tags_are_required", "", True, REQUIRE_TAGS_ON_CREATE_ERROR),
            ("tag_longer_than_a_tag_can_be", "x" * 256, False, "The step inputs are not valid"),
        ]
    )
    def test_a_create_the_flag_cannot_take_fails_with_a_reason_and_creates_nothing(
        self, _name: str, tags: str, require_tags: bool, reason: str
    ) -> None:
        TeamFeatureFlagPolicyConfig.objects.create(team=self.team, require_tags=require_tags)

        response = self._run({"tags": tags})

        assert response.json()["outcome"] == "failed", response.content
        assert reason in response.json()["result"]["reason"]
        assert not FeatureFlag.objects.filter(team=self.team).exists()
