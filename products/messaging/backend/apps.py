"""Django app configuration for messaging."""

from django.apps import AppConfig


class MessagingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "products.messaging.backend"
    label = "messaging"

    def ready(self) -> None:
        from posthog.api.file_system.deletion import register_file_system_type

        register_file_system_type("message_template", "messaging", "MessageTemplate")
