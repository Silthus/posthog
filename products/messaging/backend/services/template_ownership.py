from typing import Final, Protocol

from products.messaging.backend.facade.contracts import (
    TemplateChangeRefused,
    TemplateManagedBy,
    TemplateManagedByCode,
    TemplateWriteIntent,
)

FILE_ACTIONS: Final = frozenset({"request_change"})
CONTENT_NEUTRAL_ACTIONS: Final = frozenset({"upload", "send", "make_transactional", *FILE_ACTIONS})
OPERATIONAL_FIELDS: Final = ("sensitive", "tags")


class OwnedTemplate(Protocol):
    @property
    def managed_by(self) -> str | None: ...

    @property
    def source_repository(self) -> str | None: ...

    @property
    def source_path(self) -> str | None: ...


def patches_only(intent: TemplateWriteIntent, field: str) -> bool:
    return intent.action == "partial_update" and set(intent.payload.keys()) == {field}


def is_release(intent: TemplateWriteIntent) -> bool:
    return patches_only(intent, "managed_by") and intent.payload["managed_by"] == TemplateManagedBy.GUI


def check_write(template: OwnedTemplate, intent: TemplateWriteIntent) -> None:
    if template.managed_by != TemplateManagedBy.CODE:
        if intent.action in FILE_ACTIONS:
            raise not_managed_by_code()
        return
    if (
        intent.action in CONTENT_NEUTRAL_ACTIONS
        or is_release(intent)
        or any(patches_only(intent, f) for f in OPERATIONAL_FIELDS)
    ):
        return
    raise TemplateManagedByCode(
        detail="This template is managed by code, so it can't be changed in PostHog.",
        why="Its content comes from a file in a repository. The next upload of that file replaces changes made here.",
        fix=f"When you can reach the repository, edit {_template_file(template)} yourself. The next send uploads it. "
        "Otherwise, ask PostHog Code to open a pull request with the change: call the "
        "`workflows-request-email-template-change` tool, or POST an `instruction` to this template's "
        "`request_change/` route. To edit the template in PostHog instead, stop managing it in code first: send a "
        "PATCH whose only field is `managed_by` set to `gui`.",
    )


def not_managed_by_code() -> TemplateChangeRefused:
    return TemplateChangeRefused(
        code="template_not_managed_by_code",
        detail="This template is not managed by code, so it has no file for PostHog Code to change.",
        why="Only a template uploaded from a file in a repository has a file to change.",
        fix="Edit the template in PostHog instead: in the template editor, or with a PATCH to the template.",
    )


def _template_file(template: OwnedTemplate) -> str:
    path, repository = template.source_path, template.source_repository
    if path and repository:
        return f"`{path}` in `{repository}`"
    if path:
        return f"`{path}`"
    if repository:
        return f"the template's file in `{repository}`"
    return "the template's file"
