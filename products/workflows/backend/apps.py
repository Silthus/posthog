from django.apps import AppConfig


class WorkflowsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "products.workflows.backend"
    label = "workflows"

    def ready(self) -> None:
        from posthog.api.file_system.deletion import (  # noqa: PLC0415 — the app registry must be ready first
            register_file_system_type,
        )

        # PROTOTYPE (prototype/workflows-list): lets the project tree delete workflow rows.
        register_file_system_type("hog_flow", "workflows", "HogFlow", hard_delete=True, allow_restore=False)
