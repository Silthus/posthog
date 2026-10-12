from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from rest_framework.exceptions import APIException, PermissionDenied

from posthog.models.team.team import Team

from products.feature_flags.backend.facade.api import (
    create_flag as create_gated_flag,
    set_release_condition_rollout,
    user_can_create_flags,
    user_can_edit_flag,
)
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
ALREADY_EXISTS = "already_exists"

MAX_TAG_LENGTH = 255

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


class CreateFlagInputs(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    flag_key: str = Field(min_length=1, title="Flag key", description="Key of the feature flag to create.")
    name: str = Field(default="", title="Description", description="What the flag is for.")
    tags: list[Annotated[str, StringConstraints(max_length=MAX_TAG_LENGTH)]] = Field(
        default_factory=list,
        title="Tags",
        description="Comma-separated tags, for example rollout, checkout. Required when the project requires tags.",
    )

    @field_validator("tags", mode="before")
    @classmethod
    def split_comma_separated(cls, value: Any) -> Any:
        return [tag.strip() for tag in value.split(",") if tag.strip()] if isinstance(value, str) else value


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
        return _rejected(error)
    return NodeOutcome(outcome=DONE, result=_flag_result(updated, inputs.rollout_percentage))


def create_flag(context: NodeRunContext, inputs: CreateFlagInputs) -> NodeOutcome:
    if not user_can_create_flags(team=context.team, user=context.actor):
        return NodeOutcome.not_permitted(
            missing_permission=EDITOR_ACCESS,
            reason="The workflow's publisher needs editor access to feature flags to create one.",
        )
    existing = _flag_with_key(context.team, inputs.flag_key)
    if existing is not None:
        return _already_exists(existing)
    try:
        flag = create_gated_flag(
            {
                "key": inputs.flag_key,
                "name": inputs.name,
                "tags": inputs.tags,
                "active": True,
                "filters": {"groups": [{"properties": [], "rollout_percentage": 0}]},
            },
            team=context.team,
            user=context.actor,
            activity_trigger=context.trigger,
        )
    except ApprovalRequired as approval:
        return NodeOutcome(
            outcome=NEEDS_APPROVAL,
            result={
                "flag_id": None,
                "flag_key": inputs.flag_key,
                "rollout_percentage": 0,
                "version": None,
                "change_request_id": str(approval.change_request.id),
            },
        )
    except PermissionDenied as error:
        return NodeOutcome.not_permitted(missing_permission=APPROVAL_POLICY, reason=str(error.detail))
    except (PolicyConflict, ApprovalDetectionFailed) as error:
        return NodeOutcome.failed(str(error))
    except APIException as error:
        created_concurrently = _flag_with_key(context.team, inputs.flag_key)
        return _already_exists(created_concurrently) if created_concurrently else _rejected(error)
    return NodeOutcome(outcome=DONE, result=_flag_result(flag, 0))


def _flag_with_key(team: Team, key: str) -> FeatureFlag | None:
    return FeatureFlag.objects.filter(team_id=team.id, key=key).first()


def _already_exists(flag: FeatureFlag) -> NodeOutcome:
    return NodeOutcome(outcome=ALREADY_EXISTS, result=_existing_flag_result(flag))


def _rejected(error: APIException) -> NodeOutcome:
    return NodeOutcome.failed(f"The feature flag rejected the change: {_messages(error.detail)}")


def _messages(detail: Any) -> str:
    if isinstance(detail, dict):
        return " ".join(_messages(value) for value in detail.values())
    if isinstance(detail, list):
        return " ".join(_messages(value) for value in detail)
    return str(detail)


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


def _existing_flag_result(flag: FeatureFlag) -> dict[str, Any]:
    try:
        rollout_percentage: float | None = _only_condition_rollout(flag)
    except _UnsupportedFlag:
        rollout_percentage = None
    return _flag_result(flag, rollout_percentage)


def _flag_result(flag: FeatureFlag, rollout_percentage: float | None) -> dict[str, Any]:
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

CREATE_FLAG = NodeOperation(
    key="create_flag",
    name="Create flag",
    description=(
        "Creates an active flag with one release condition at 0% and no property filters. done: the flag "
        "exists. already_exists: a flag with this key exists, and the result describes it. needs_approval: "
        "a change request is open, and no flag exists yet. The result is {flag_id, flag_key, "
        "rollout_percentage, version}."
    ),
    inputs=CreateFlagInputs,
    outcomes=(DONE, ALREADY_EXISTS, NEEDS_APPROVAL),
    run=create_flag,
)

FEATURE_FLAG_NODE = NodeManifest(
    key="feature_flag", name="Feature flag", operations=(SET_ROLLOUT_PERCENTAGE, CREATE_FLAG)
)
