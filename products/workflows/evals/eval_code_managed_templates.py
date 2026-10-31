from __future__ import annotations

from pathlib import Path
from typing import Any, Final

from products.posthog_ai.eval_harness.base import SandboxedEval
from products.posthog_ai.eval_harness.config import SandboxedEvalCase
from products.posthog_ai.eval_harness.harness.context import EvalContext
from products.posthog_ai.eval_harness.scorers import RequiredToolCall
from products.workflows.evals.scorers import (
    DidNotRequestChangeFromPostHogCode,
    EditedGuiTemplate,
    LeftCodeManagedTemplateAlone,
    SharedTemplateLink,
)
from products.workflows.evals.seeders import CODE_MANAGED_TEMPLATE_NAME, GUI_TEMPLATE_NAME, seed_email_templates

CHANGE_REQUEST: Final = "Make the button green."

SIDEBAR_PROMPT: Final = Path(__file__).parent / "fixtures" / "sidebar_on_code_managed_page.txt"
TEMPLATE_ID_PLACEHOLDER: Final = "{code_managed_template_id}"


def sidebar_prompt_on_code_managed_page(seed: dict[str, Any]) -> str:
    return SIDEBAR_PROMPT.read_text().rstrip("\n").replace(TEMPLATE_ID_PLACEHOLDER, seed["code_managed_template_id"])


async def eval_code_managed_templates(ctx: EvalContext) -> None:
    cases = [
        SandboxedEvalCase(
            name="sidebar_on_code_managed_page",
            prompt=f"<sidebar context for the {CODE_MANAGED_TEMPLATE_NAME} page>\n\n{CHANGE_REQUEST}",
            prompt_from_seed=sidebar_prompt_on_code_managed_page,
            setup=seed_email_templates,
            expected={"shared_template_link": True},
        ),
        SandboxedEvalCase(
            name="slack_message_names_code_managed_template",
            prompt=f'Can you make the button in our "{CODE_MANAGED_TEMPLATE_NAME}" email template green?',
            interaction_origin="slack",
            setup=seed_email_templates,
            expected={"shared_template_link": True},
        ),
        SandboxedEvalCase(
            name="gui_template_still_patched",
            prompt=f'Can you make the button in our "{GUI_TEMPLATE_NAME}" email template green?',
            setup=seed_email_templates,
            expected={"edited_gui_template": True},
        ),
    ]

    await SandboxedEval(
        experiment_name="sandboxed-workflows-code-managed-templates-cli",
        cases=cases,
        scorers=[
            RequiredToolCall({"workflows-get-email-template"}, name="read_the_template"),
            LeftCodeManagedTemplateAlone(),
            DidNotRequestChangeFromPostHogCode(),
            SharedTemplateLink(),
            EditedGuiTemplate(),
        ],
        ctx=ctx,
    )
