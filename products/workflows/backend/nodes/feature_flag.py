from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator
from rest_framework.exceptions import APIException, PermissionDenied

from products.feature_flags.backend.facade.api import set_release_condition_rollout, user_can_edit_flag
from products.feature_flags.backend.facade.config import ConfigFormatError
from products.feature_flags.backend.facade.contracts import (
    ApprovalDetectionFailed,
    ApprovalRequired,
    FlagRolloutConditionNotFound,
    FlagRolloutDeletedFlag,
    FlagRolloutUnsupportedConfig,
    FlagRolloutVersionConflict,
    PolicyConflict,
)
from products.feature_flags.backend.models.feature_flag import FeatureFlag
from products.workflows.backend.facade.contracts import NodeOutcome
from products.workflows.backend.nodes.manifest import NodeManifest, NodeOperation, NodeRunContext

DONE = "done"
CHANGED_ELSEWHERE = "changed_elsewhere"
NEEDS_APPROVAL = "needs_approval"

EDITOR_ACCESS = "feature_flag:editor"
APPROVAL_POLICY = "approval_policy"


class SetRolloutPercentageInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    flag_key: str = Field(min_length=1, title="Flag key", description="Key of the feature flag to change.")
    rollout_percentage: float = Field(
        ge=0,
        le=100,
        title="Rollout percentage",
        description="Target percentage from 0 to 100, for example 25. Fractions are allowed.",
    )
    expected_version: int | None = Field(
        default=None,
        title="Expected flag version",
        description=(
            "The flag version this step expects, usually {variables.<output>.version} from an earlier step. "
            "A different version means someone else changed the flag, and the step answers changed_elsewhere. "
            "Leave empty to change the current version."
        ),
    )

    @field_validator("expected_version", mode="before")
    @classmethod
    def empty_means_current(cls, value: Any) -> Any:
        return None if value == "" else value


class _UnsupportedFlag(Exception):
    pass


def set_rollout_percentage(context: NodeRunContext, inputs: SetRolloutPercentageInputs) -> NodeOutcome:
    flag = FeatureFlag.objects.filter(team=context.team, key=inputs.flag_key).first()
    if flag is None:
        return NodeOutcome.failed(f"No feature flag with the key {inputs.flag_key} exists in this project.")
    if not user_can_edit_flag(flag, team=context.team, user=context.actor):
        return NodeOutcome.not_permitted(
            missing_permission=EDITOR_ACCESS,
            reason=f"The workflow's publisher needs editor access to the feature flag {flag.key}.",
        )
    try:
        current_percentage = _only_condition_rollout(flag)
    except _UnsupportedFlag as error:
        return NodeOutcome.failed(str(error))
    if current_percentage == inputs.rollout_percentage:
        return NodeOutcome(outcome=DONE, result=_flag_result(flag, current_percentage))

    expected_version = flag.version if inputs.expected_version is None else inputs.expected_version
    flag._activity_trigger = context.trigger
    try:
        updated = set_release_condition_rollout(
            flag, 0, inputs.rollout_percentage, expected_version, team=context.team, user=context.actor
        )
    except FlagRolloutVersionConflict:
        return _outcome_after_concurrent_change(flag, inputs.rollout_percentage)
    except ApprovalRequired as approval:
        return NodeOutcome(
            outcome=NEEDS_APPROVAL,
            result={**_flag_result(flag, current_percentage), "change_request_id": str(approval.change_request.id)},
        )
    except PermissionDenied as error:
        return NodeOutcome.not_permitted(missing_permission=APPROVAL_POLICY, reason=str(error.detail))
    except (
        FlagRolloutUnsupportedConfig,
        FlagRolloutConditionNotFound,
        FlagRolloutDeletedFlag,
        PolicyConflict,
        ApprovalDetectionFailed,
    ) as error:
        return NodeOutcome.failed(str(error))
    except APIException as error:
        return NodeOutcome.failed(f"The feature flag rejected the change: {error.detail}")
    return NodeOutcome(outcome=DONE, result=_flag_result(updated, inputs.rollout_percentage))


def _only_condition_rollout(flag: FeatureFlag) -> float:
    try:
        conditions = flag.conditions
    except ConfigFormatError:
        raise _UnsupportedFlag(
            f"The feature flag {flag.key} uses a configuration format this step cannot change yet."
        ) from None
    if not isinstance(conditions, list) or len(conditions) != 1 or not isinstance(conditions[0], dict):
        raise _UnsupportedFlag(
            f"The feature flag {flag.key} does not have exactly one release condition. "
            "This step only changes flags with exactly one."
        )
    percentage = conditions[0].get("rollout_percentage")
    return 100 if percentage is None else percentage


def _outcome_after_concurrent_change(flag: FeatureFlag, target_percentage: float) -> NodeOutcome:
    flag.refresh_from_db()
    try:
        current_percentage = _only_condition_rollout(flag)
    except _UnsupportedFlag as error:
        return NodeOutcome.failed(str(error))
    outcome = DONE if current_percentage == target_percentage else CHANGED_ELSEWHERE
    return NodeOutcome(outcome=outcome, result=_flag_result(flag, current_percentage))


def _flag_result(flag: FeatureFlag, rollout_percentage: float) -> dict[str, Any]:
    return {
        "flag_id": flag.id,
        "flag_key": flag.key,
        "rollout_percentage": rollout_percentage,
        "version": flag.version,
    }


SET_ROLLOUT_PERCENTAGE = NodeOperation(
    key="set_rollout_percentage",
    name="Set rollout percentage",
    description=(
        "Sets the rollout percentage of a flag with exactly one release condition. done: the flag is at the "
        "target. changed_elsewhere: the flag is not at expected_version. needs_approval: a change request "
        "is open, and the flag is unchanged. The result is {flag_id, flag_key, rollout_percentage, version}."
    ),
    inputs=SetRolloutPercentageInputs,
    outcomes=(DONE, CHANGED_ELSEWHERE, NEEDS_APPROVAL),
    run=set_rollout_percentage,
)

FEATURE_FLAG_NODE = NodeManifest(key="feature_flag", name="Feature flag", operations=(SET_ROLLOUT_PERCENTAGE,))
