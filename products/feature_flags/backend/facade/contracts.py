class FlagRolloutVersionConflict(ValueError):
    def __init__(
        self, message: str, *, expected_version: int | None = None, current_version: int | None = None
    ) -> None:
        super().__init__(message)
        self.expected_version = expected_version
        self.current_version = current_version


class FlagRolloutUnsupportedConfig(ValueError):
    pass


class FlagRolloutConditionNotFound(ValueError):
    pass


class FlagRolloutDeletedFlag(ValueError):
    pass
