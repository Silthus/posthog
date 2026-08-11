import time

import pytest
from posthog.test.base import BaseTest
from unittest.mock import MagicMock, patch

from django.conf import settings

import fakeredis
from celery.app.task import Context
from celery.exceptions import Retry
from celery.signals import task_revoked
from parameterized import parameterized

from posthog.clickhouse.client.limit import ConcurrencyLimitExceeded

from products.workflows.backend.services.llm_generation import (
    GenerationRecord,
    GenerationRequest,
    read_record,
    write_record,
)
from products.workflows.backend.tasks.llm_generate import CONCURRENCY_SLOT_TTL, run_workflow_llm_generation

TASK = "products.workflows.backend.tasks.llm_generate"


@pytest.fixture
def limiter_redis():
    # The process-wide fakeredis server is memoized and never flushed, so a leftover
    # celery_running_tasks member would reject a later generation for no visible reason.
    client = fakeredis.FakeRedis()
    with patch("posthog.clickhouse.client.limit.redis.get_client", return_value=client):
        yield client


class TestWorkflowLLMGenerationConcurrency(BaseTest):
    limiter_redis: fakeredis.FakeRedis

    @pytest.fixture(autouse=True)
    def _bind(self, limiter_redis):
        self.limiter_redis = limiter_redis

    def _pending(self) -> GenerationRecord:
        request = GenerationRequest(
            invocation_id="0195f0a0-0000-7000-8000-000000000001",
            hog_flow_id=None,
            prompt="Write a subject line for Ada",
            model="gpt-5-mini",
            output_fields={},
        )
        return write_record(self.team.id, GenerationRecord(id="gen-1", status="pending", request=request))

    def _occupy(self, key_suffix: str, slots: int) -> None:
        # The limiter scores a slot by when it expires, and evicts everything scored at or before
        # now, so a live slot has to sit in the future.
        key = f"celery_running_tasks:{run_workflow_llm_generation.name}{key_suffix}"
        expires_at = int(time.time()) + CONCURRENCY_SLOT_TTL
        self.limiter_redis.zadd(key, {f"busy-{index}": expires_at for index in range(slots)})

    @parameterized.expand(
        [
            ("team at its own cap", True, settings.WORKFLOW_LLM_MAX_CONCURRENT_GENERATIONS_PER_TEAM, False),
            ("fleet at the global cap", False, settings.WORKFLOW_LLM_MAX_CONCURRENT_GENERATIONS, False),
            ("fleet busy but the team has room", False, settings.WORKFLOW_LLM_MAX_CONCURRENT_GENERATIONS - 1, True),
        ]
    )
    def test_concurrency_caps_hold_a_generation_back(self, _name, per_team, occupied, runs):
        record = self._pending()
        self._occupy(f":{self.team.id}" if per_team else "", occupied)
        client = MagicMock()
        completion = MagicMock()
        completion.choices[0].message.content = "Hello Ada"
        completion.choices[0].message.refusal = None
        client.chat.completions.create.return_value = completion

        with patch(f"{TASK}.build_llm_client", return_value=client):
            try:
                run_workflow_llm_generation.apply(kwargs={"team_id": self.team.id, "generation_id": record.id})
                rescheduled = False
            except Retry:
                rescheduled = True

        stored = read_record(self.team.id, record.id)
        assert stored is not None
        assert rescheduled is not runs
        # A held-back generation stays pending, so the caller keeps polling instead of reading a
        # terminal answer it never got.
        assert stored.status == ("succeeded" if runs else "pending")

    def test_a_generation_that_expired_in_the_queue_records_capacity_unavailable(self):
        record = self._pending()

        # Celery discards an expired task without running it, so the on_failure hook below never
        # fires and only this signal is left to release the caller.
        task_revoked.send(
            sender=run_workflow_llm_generation,
            request=Context(kwargs={"team_id": self.team.id, "generation_id": record.id}),
            terminated=False,
            signum=None,
            expired=True,
        )

        stored = read_record(self.team.id, record.id)
        assert stored is not None
        assert stored.status == "failed"
        assert stored.error_code == "capacity_unavailable"

    def test_an_exhausted_retry_budget_records_capacity_unavailable(self):
        record = self._pending()

        run_workflow_llm_generation.on_failure(
            ConcurrencyLimitExceeded("no slots"),
            "task-1",
            (),
            {"team_id": self.team.id, "generation_id": record.id},
            None,
        )

        stored = read_record(self.team.id, record.id)
        assert stored is not None
        assert stored.status == "failed"
        assert stored.error_code == "capacity_unavailable"
