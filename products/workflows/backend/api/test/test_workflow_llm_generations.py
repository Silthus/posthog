from dataclasses import replace
from itertools import count

from posthog.test.base import APIBaseTest
from unittest.mock import patch

from django.test import SimpleTestCase

from parameterized import parameterized

from posthog.models.utils import generate_random_token_secret
from posthog.rate_limit import WorkflowLLMGenerationSubmitThrottle

from products.workflows.backend.api.workflow_llm_generation import (
    MAX_FIELD_INSTRUCTION_CHARS,
    MAX_FIELD_NAME_CHARS,
    MAX_OUTPUT_FIELDS,
    MAX_PROMPT_CHARS,
    WorkflowLLMGenerationSubmitSerializer,
)
from products.workflows.backend.services.llm_generation import read_record, write_record

MODULE = "products.workflows.backend.api.workflow_llm_generation"
SERVICE = "products.workflows.backend.services.llm_generation"


class TestWorkflowLLMGenerationSubmitValidation(SimpleTestCase):
    @parameterized.expand(
        [
            ("prompt past the cap", {"prompt": "x" * (MAX_PROMPT_CHARS + 1)}, "prompt"),
            (
                "more fields than a step declares",
                {"output_fields": {f"field_{index}": "An instruction" for index in range(MAX_OUTPUT_FIELDS + 1)}},
                "output_fields",
            ),
            (
                "instruction past the cap",
                {"output_fields": {"subject": "x" * (MAX_FIELD_INSTRUCTION_CHARS + 1)}},
                "output_fields",
            ),
            (
                "field name past the cap",
                {"output_fields": {"x" * (MAX_FIELD_NAME_CHARS + 1): "A subject"}},
                "output_fields",
            ),
        ]
    )
    def test_an_oversized_submission_is_rejected(self, _name, overrides, field):
        body = {
            "invocation_id": "0195f0a0-0000-7000-8000-000000000001",
            "prompt": "Write a subject line for Ada",
            "model": "gpt-5-mini",
            "output_fields": {},
            **overrides,
        }

        serializer = WorkflowLLMGenerationSubmitSerializer(data=body)

        assert not serializer.is_valid()
        assert field in serializer.errors


class TestWorkflowLLMGenerations(APIBaseTest):
    def setUp(self):
        super().setUp()
        self.team.secret_api_token = generate_random_token_secret()
        self.team.save()
        self.client.logout()
        flag = patch(f"{SERVICE}.posthoganalytics.feature_enabled", return_value=True)
        self.feature_enabled = flag.start()
        self.addCleanup(flag.stop)
        budget = patch(f"{MODULE}.is_team_over_ai_credit_budget", return_value=False)
        self.over_budget = budget.start()
        self.addCleanup(budget.stop)

    def _retrieve(self, generation_id):
        return self.client.get(
            f"/api/projects/{self.team.id}/workflow_llm_generations/{generation_id}/",
            headers={"authorization": f"Bearer {self.team.secret_api_token}"},
        )

    def _submit(self, **overrides):
        body = {
            "invocation_id": "0195f0a0-0000-7000-8000-000000000001",
            "prompt": "Write a subject line for Ada",
            "model": "gpt-5-mini",
            "output_fields": {},
        }
        body.update(overrides)
        return self.client.post(
            f"/api/projects/{self.team.id}/workflow_llm_generations/",
            body,
            format="json",
            headers={"authorization": f"Bearer {self.team.secret_api_token}"},
        )

    def test_submit_returns_pending_and_enqueues_one_task(self):
        with patch(f"{MODULE}.run_workflow_llm_generation") as task, self.captureOnCommitCallbacks(execute=True):
            response = self._submit()

        assert response.status_code == 202, response.json()
        body = response.json()
        assert body["status"] == "pending"
        assert body["id"]
        assert body["result"] is None
        assert body["error"] is None
        task.delay.assert_called_once_with(team_id=self.team.id, generation_id=body["id"])

    @parameterized.expand(
        [
            ("same payload", {}, True, 1),
            ("second step of the same run", {"prompt": "Write a greeting"}, False, 2),
        ]
    )
    def test_idempotency_is_keyed_by_invocation_and_payload(self, _name, second_body, same_id, task_calls):
        with patch(f"{MODULE}.run_workflow_llm_generation") as task, self.captureOnCommitCallbacks(execute=True):
            first = self._submit()
            second = self._submit(**second_body)

        assert (first.json()["id"] == second.json()["id"]) is same_id
        assert task.delay.call_count == task_calls

    def test_an_oversized_prompt_is_rejected_before_anything_is_stored(self):
        with patch(f"{MODULE}.run_workflow_llm_generation") as task, self.captureOnCommitCallbacks(execute=True):
            response = self._submit(prompt="x" * (MAX_PROMPT_CHARS + 1))

        assert response.status_code == 400, response.json()
        task.delay.assert_not_called()

    def test_a_submit_that_loses_the_dedupe_race_hands_back_the_winners_handle(self):
        reads = count()

        with patch(f"{MODULE}.run_workflow_llm_generation") as task, self.captureOnCommitCallbacks(execute=True):
            first = self._submit()
            # The resubmit read the dedupe store before the winner had written to it, which is what
            # the caller's own submit timeout produces.
            with patch(
                f"{MODULE}.read_record",
                side_effect=lambda *args: None if next(reads) == 0 else read_record(*args),
            ):
                second = self._submit()

        assert second.status_code == 202, second.json()
        assert second.json()["id"] == first.json()["id"]
        assert task.delay.call_count == 1

    def test_retrieve_polls_while_pending_and_returns_the_envelope_once_finished(self):
        with patch(f"{MODULE}.run_workflow_llm_generation"), self.captureOnCommitCallbacks(execute=True):
            generation_id = self._submit().json()["id"]

        pending = self._retrieve(generation_id)
        assert pending.status_code == 202, pending.json()
        assert pending.json()["status"] == "pending"

        record = read_record(self.team.id, generation_id)
        assert record is not None
        write_record(
            self.team.id,
            replace(record, status="succeeded", text="Hello Ada", fields={"subject": "Hello Ada"}),
        )

        finished = self._retrieve(generation_id)
        assert finished.status_code == 200, finished.json()
        assert finished.json()["result"] == {"text": "Hello Ada", "fields": {"subject": "Hello Ada"}}

    def test_retrieve_of_an_unknown_generation_is_not_found(self):
        assert self._retrieve("0" * 64).status_code == 404

    def test_submit_is_terminally_unavailable_when_the_flag_is_off(self):
        self.feature_enabled.return_value = False

        with patch(f"{MODULE}.run_workflow_llm_generation") as task, self.captureOnCommitCallbacks(execute=True):
            response = self._submit()

        assert response.status_code == 404, response.json()
        assert response.json()["error"]["code"] == "feature_unavailable"
        task.delay.assert_not_called()

    @parameterized.expand(
        [
            ("model the endpoint does not accept", {"model": "gpt-9-imaginary"}, False, "invalid_model"),
            ("team out of ai credits", {}, True, "quota_exceeded"),
        ]
    )
    def test_submit_fails_terminally_without_enqueuing(self, _name, body, over_budget, code):
        self.over_budget.return_value = over_budget

        with patch(f"{MODULE}.run_workflow_llm_generation") as task, self.captureOnCommitCallbacks(execute=True):
            response = self._submit(**body)

        assert response.status_code == 200, response.json()
        assert response.json()["status"] == "failed"
        assert response.json()["error"]["code"] == code
        task.delay.assert_not_called()

    def test_submit_throttle_is_bucketed_per_project(self):
        other_team = self.create_team_with_organization(self.organization)
        other_team.secret_api_token = generate_random_token_secret()
        other_team.save()

        with (
            patch("posthog.rate_limit.is_rate_limit_enabled", return_value=True),
            patch.object(WorkflowLLMGenerationSubmitThrottle, "rate", "1/minute"),
            patch(f"{MODULE}.run_workflow_llm_generation"),
            self.captureOnCommitCallbacks(execute=True),
        ):
            first = self._submit()
            second = self._submit(prompt="A different prompt")
            other = self.client.post(
                f"/api/projects/{other_team.id}/workflow_llm_generations/",
                {"invocation_id": "inv", "prompt": "Hi", "model": "gpt-5-mini", "output_fields": {}},
                format="json",
                headers={"authorization": f"Bearer {other_team.secret_api_token}"},
            )

        assert first.status_code == 202, first.json()
        assert second.status_code == 429, second.json()
        assert second.headers["Retry-After"]
        assert other.status_code == 202, other.json()

    def test_a_token_cannot_submit_for_another_project(self):
        other_team = self.create_team_with_organization(self.organization)

        response = self.client.post(
            f"/api/projects/{other_team.id}/workflow_llm_generations/",
            {"invocation_id": "inv", "prompt": "Hi", "model": "gpt-5-mini", "output_fields": {}},
            format="json",
            headers={"authorization": f"Bearer {self.team.secret_api_token}"},
        )

        assert response.status_code == 403, response.json()

    def test_retrieve_keeps_working_after_the_flag_is_rolled_back(self):
        with patch(f"{MODULE}.run_workflow_llm_generation"), self.captureOnCommitCallbacks(execute=True):
            generation_id = self._submit().json()["id"]
        self.feature_enabled.return_value = False

        assert self._retrieve(generation_id).status_code == 202
