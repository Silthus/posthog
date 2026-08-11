import os
from itertools import count
from typing import Any

from posthog.test.base import BaseTest
from unittest.mock import MagicMock, patch

import httpx
from celery.exceptions import SoftTimeLimitExceeded
from openai import BadRequestError
from parameterized import parameterized

from posthog.tasks.usage_report import POSTHOG_AI_PRODUCTS

from products.workflows.backend.services.llm_generation import (
    GenerationRecord,
    GenerationRequest,
    read_record,
    write_record,
)
from products.workflows.backend.services.llm_models import WORKFLOW_LLM_EXTRACTION_MODEL
from products.workflows.backend.tasks.llm_generate import (
    WALL_CLOCK_BUDGET_SECONDS,
    build_llm_client,
    run_workflow_llm_generation,
)

TASK = "products.workflows.backend.tasks.llm_generate"


def _completion(content: str | None, refusal: str | None = None) -> MagicMock:
    choice = MagicMock()
    choice.message.content = content
    choice.message.refusal = refusal
    return MagicMock(choices=[choice])


class TestRunWorkflowLLMGeneration(BaseTest):
    def test_the_client_leaves_every_retry_and_deadline_decision_to_the_task(self):
        with patch(f"{TASK}.posthoganalytics.setup"), patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            client = build_llm_client()

        # The SDK retries transport twice by default, which bills a call that completed server-side
        # but lost its response a second and third time, behind the task's own no-retry rule.
        assert client.max_retries == 0
        # Its default read timeout is ten minutes, long enough for the worker's hard limit to kill
        # the task before the call ever returns.
        assert client.timeout == WALL_CLOCK_BUDGET_SECONDS

    def _pending(self, **overrides: Any) -> GenerationRecord:
        request = GenerationRequest(
            **{
                "invocation_id": "0195f0a0-0000-7000-8000-000000000001",
                "hog_flow_id": None,
                "prompt": "Write a subject line for Ada",
                "model": "gpt-5-mini",
                "output_fields": {},
                **overrides,
            }
        )
        return write_record(self.team.id, GenerationRecord(id="gen-1", status="pending", request=request))

    def _run(self, record: GenerationRecord) -> GenerationRecord:
        run_workflow_llm_generation.apply(kwargs={"team_id": self.team.id, "generation_id": record.id}).get()
        stored = read_record(self.team.id, record.id)
        assert stored is not None
        return stored

    def test_a_step_without_output_fields_runs_one_pass(self):
        record = self._pending()
        client = MagicMock()
        client.chat.completions.create.return_value = _completion("Hello Ada")

        with patch(f"{TASK}.build_llm_client", return_value=client):
            stored = self._run(record)

        assert stored.status == "succeeded"
        assert stored.text == "Hello Ada"
        assert stored.fields == {}
        assert client.chat.completions.create.call_count == 1

    def test_declared_fields_are_extracted_and_unusable_values_become_empty_strings(self):
        record = self._pending(
            output_fields={"subject": "A short subject line", "cta": "A call to action", "score": "A rating"}
        )
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _completion("Ada, your report is ready."),
            # null is how the model says "the text does not support this"; a number means the route
            # did not honor the strict schema, and neither belongs in a workflow variable.
            _completion('{"subject": "Your report is ready", "cta": null, "score": 7}'),
        ]

        with patch(f"{TASK}.build_llm_client", return_value=client):
            stored = self._run(record)

        assert stored.status == "succeeded"
        assert stored.text == "Ada, your report is ready."
        assert stored.fields == {"subject": "Your report is ready", "cta": "", "score": ""}

    def test_extraction_runs_on_the_pinned_model_under_a_strict_schema_without_the_prompt(self):
        record = self._pending(output_fields={"subject": "A short subject line"})
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _completion("Ada, your report is ready."),
            _completion('{"subject": "Your report is ready"}'),
        ]

        with patch(f"{TASK}.build_llm_client", return_value=client):
            self._run(record)

        assert client.chat.completions.create.call_args_list[0].kwargs["model"] == "gpt-5-mini"
        second = client.chat.completions.create.call_args_list[1].kwargs
        assert second["model"] == WORKFLOW_LLM_EXTRACTION_MODEL
        json_schema = second["response_format"]["json_schema"]
        assert json_schema["strict"] is True
        assert json_schema["schema"]["additionalProperties"] is False
        assert json_schema["schema"]["required"] == ["subject"]
        assert json_schema["schema"]["properties"]["subject"]["type"] == ["string", "null"]

        roles = {message["role"]: message["content"] for message in second["messages"]}
        # The rules only outrank an instruction smuggled through pass 1's text if they arrive with
        # system-role authority, so the untrusted text has to stay in its own turn.
        assert "A short subject line" in roles["system"]
        assert "Ada, your report is ready." not in roles["system"]
        assert "Ada, your report is ready." in roles["user"]
        assert record.request.prompt not in " ".join(roles.values())

    @parameterized.expand(
        [
            ("answer too big for a workflow variable", _completion("x" * 5000), "output_too_large", 2),
            ("model declined the prompt", _completion(None, refusal="I cannot help with that"), "model_refused", 2),
            ("gateway unreachable", RuntimeError("connection reset"), "gateway_unavailable", 1),
            ("worker deadline reached mid-pass", SoftTimeLimitExceeded(), "deadline_exceeded", 1),
        ]
    )
    def test_terminal_failures_retry_only_what_the_model_can_fix(self, _name, outcome, code, calls):
        record = self._pending()
        client = MagicMock()
        if isinstance(outcome, Exception):
            client.chat.completions.create.side_effect = outcome
        else:
            client.chat.completions.create.return_value = outcome

        with patch(f"{TASK}.build_llm_client", return_value=client):
            stored = self._run(record)

        assert stored.status == "failed"
        assert stored.error_code == code
        assert stored.error_message
        assert client.chat.completions.create.call_count == calls

    def test_extraction_degrades_to_low_reasoning_when_minimal_is_rejected(self):
        record = self._pending(output_fields={"subject": "A short subject line"})
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _completion("Ada, your report is ready."),
            BadRequestError(
                "unsupported value for reasoning_effort",
                response=httpx.Response(400, request=httpx.Request("POST", "https://gateway.test")),
                body=None,
            ),
            _completion('{"subject": "Your report is ready"}'),
        ]

        with patch(f"{TASK}.build_llm_client", return_value=client):
            stored = self._run(record)

        assert stored.status == "succeeded"
        efforts = [call.kwargs.get("reasoning_effort") for call in client.chat.completions.create.call_args_list]
        assert efforts == [None, "minimal", "low"]

    def test_both_passes_bill_the_team_and_share_one_trace(self):
        record = self._pending(output_fields={"subject": "A short subject line"})
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _completion("Ada, your report is ready."),
            _completion('{"subject": "Your report is ready"}'),
        ]

        with patch(f"{TASK}.build_llm_client", return_value=client):
            self._run(record)

        assert client.chat.completions.create.call_count == 2
        for call in client.chat.completions.create.call_args_list:
            assert call.kwargs["posthog_trace_id"] == record.request.invocation_id
            assert call.kwargs["posthog_properties"] == {
                "ai_product": "workflows",
                "feature": "llm_action",
                "$ai_billable": True,
                "team_id": self.team.id,
            }
            assert call.kwargs["posthog_properties"]["ai_product"] in POSTHOG_AI_PRODUCTS

    def test_an_exhausted_budget_stops_before_the_extraction_pass(self):
        record = self._pending(output_fields={"subject": "A short subject line"})
        client = MagicMock()
        client.chat.completions.create.return_value = _completion("Ada, your report is ready.")

        with (
            patch(f"{TASK}.build_llm_client", return_value=client),
            patch(f"{TASK}.WALL_CLOCK_BUDGET_SECONDS", -1),
        ):
            stored = self._run(record)

        assert stored.status == "failed"
        assert stored.error_code == "deadline_exceeded"
        assert client.chat.completions.create.call_count == 1

    def test_the_budget_covers_the_retry_as_well_as_the_first_attempt(self):
        record = self._pending()
        client = MagicMock()
        client.chat.completions.create.return_value = _completion("x" * 5000)
        # 40 seconds pass per clock read, so neither attempt blows the budget on its own but the
        # two together do.
        clock = count(start=0, step=40)

        with (
            patch(f"{TASK}.build_llm_client", return_value=client),
            patch(f"{TASK}.time.monotonic", side_effect=lambda: next(clock)),
        ):
            stored = self._run(record)

        # A per-attempt budget would let the retry run a second full 60 seconds, overshoot the
        # task's hard time limit, and get killed before it could write anything.
        assert stored.error_code == "deadline_exceeded"

    @parameterized.expand([("not json at all", "sorry, here you go"), ("json that is not an object", "[]")])
    def test_a_malformed_extraction_is_retried_once_and_the_retry_wins(self, _name, malformed):
        record = self._pending(output_fields={"subject": "A short subject line"})
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _completion("Ada, your report is ready."),
            _completion(malformed),
            _completion("Ada, your report is ready."),
            _completion('{"subject": "Your report is ready"}'),
        ]

        with patch(f"{TASK}.build_llm_client", return_value=client):
            stored = self._run(record)

        assert stored.status == "succeeded"
        assert stored.fields == {"subject": "Your report is ready"}
        assert client.chat.completions.create.call_count == 4
