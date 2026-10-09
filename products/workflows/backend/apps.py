from django.apps import AppConfig


class WorkflowsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "products.workflows.backend"
    label = "workflows"

    def ready(self) -> None:
        from posthog.api.file_system.deletion import (  # noqa: PLC0415
            register_file_system_type,
            register_pre_delete_hook,
        )

        from products.workflows.backend.services import hog_flow_activity  # noqa: PLC0415

        register_file_system_type("hog_flow", "workflows", "HogFlow", soft_delete_field=None)
        register_pre_delete_hook("hog_flow", hog_flow_activity.log_file_system_workflow_deletion)
