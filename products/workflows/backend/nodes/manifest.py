from collections.abc import Callable
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ValidationError

from posthog.dataclasses import frozen
from posthog.models.activity_logging.activity_log import Trigger
from posthog.models.team.team import Team
from posthog.models.user import User

from products.workflows.backend.facade.contracts import NodeOutcome

InputsT = TypeVar("InputsT", bound=BaseModel)


@frozen
class NodeRunContext:
    team: Team
    actor: User
    trigger: Trigger


@frozen
class NodeOperation(Generic[InputsT]):
    key: str
    name: str
    inputs: type[InputsT]
    outcomes: tuple[str, ...]
    run: Callable[[NodeRunContext, InputsT], NodeOutcome]

    def execute(self, context: NodeRunContext, raw_inputs: dict[str, Any]) -> NodeOutcome:
        try:
            inputs = self.inputs.model_validate(raw_inputs)
        except ValidationError as error:
            return NodeOutcome.failed(_describe_invalid_inputs(error))
        return self.run(context, inputs)


@frozen
class NodeManifest:
    key: str
    name: str
    operations: tuple[NodeOperation[Any], ...]

    def operation(self, key: str) -> NodeOperation[Any] | None:
        return next((operation for operation in self.operations if operation.key == key), None)


def _describe_invalid_inputs(error: ValidationError) -> str:
    problems = "; ".join(f"{'.'.join(str(part) for part in issue['loc'])}: {issue['msg']}" for issue in error.errors())
    return f"The step inputs are not valid. {problems}."
