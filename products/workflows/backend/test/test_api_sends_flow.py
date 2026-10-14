import time
import threading

from posthog.test.base import BaseTest, NonAtomicBaseTest

from django.db import connection, transaction

from products.workflows.backend.models.hog_flow.hog_flow import HogFlow
from products.workflows.backend.services.api_sends_flow import get_or_create_api_sends_flow

DEADLINE_SECONDS = 30


def wait_until_another_connection_waits_on_a_lock() -> bool:
    deadline = time.monotonic() + DEADLINE_SECONDS
    while time.monotonic() < deadline:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM pg_locks WHERE NOT granted AND pid <> pg_backend_pid() "
                "AND (database IS NULL OR database = (SELECT oid FROM pg_database WHERE datname = current_database()))"
            )
            if cursor.fetchone()[0] > 0:
                return True
        time.sleep(0.05)
    return False


class TestGetOrCreateApiSendsFlowConcurrently(NonAtomicBaseTest):
    def test_a_first_call_racing_another_converges_on_its_flow(self):
        created = threading.Event()
        release = threading.Event()
        flows: dict[str, HogFlow] = {}
        errors: list[BaseException] = []

        def call_on_own_connection(name: str, hold_until_released: bool) -> None:
            try:
                with transaction.atomic():
                    flows[name] = get_or_create_api_sends_flow(self.team)
                    if hold_until_released:
                        created.set()
                        release.wait(timeout=DEADLINE_SECONDS)
            except BaseException as error:
                errors.append(error)
            finally:
                connection.close()

        first = threading.Thread(target=call_on_own_connection, args=("first", True))
        second = threading.Thread(target=call_on_own_connection, args=("second", False))
        first.start()
        try:
            assert created.wait(timeout=DEADLINE_SECONDS)
            second.start()
            assert wait_until_another_connection_waits_on_a_lock(), "the second insert never waited on the first"
        finally:
            release.set()
            first.join(timeout=DEADLINE_SECONDS)
            second.join(timeout=DEADLINE_SECONDS)

        assert errors == []
        assert flows["second"].id == flows["first"].id
        assert HogFlow.objects.filter(team=self.team, origin_product=HogFlow.OriginProduct.API_SENDS).count() == 1


class TestGetOrCreateApiSendsFlow(BaseTest):
    def test_creates_one_transactional_email_flow_and_returns_it_on_later_calls(self):
        first = get_or_create_api_sends_flow(self.team)
        second = get_or_create_api_sends_flow(self.team)

        assert second.id == first.id
        assert second.version == first.version
        assert HogFlow.objects.filter(team=self.team, origin_product=HogFlow.OriginProduct.API_SENDS).count() == 1

        assert first.status == HogFlow.State.ACTIVE
        assert first.trigger == {"type": "api_send"}
        assert first.billable_action_types == ["function_email"]
        assert [action["type"] for action in first.actions] == ["trigger", "function_email", "exit"]
        email_step = first.actions[1]
        assert email_step["config"]["template_id"] == "template-email"
        assert email_step["config"]["message_category_type"] == "transactional"
        assert email_step["config"]["inputs"]["email"]["templating"] == "liquid"
        assert email_step["config"]["inputs"]["email"]["value"] == {
            "to": {"email": "{{ variables.email.to | raw }}"},
            "from": {
                "integrationId": "{{ variables.email.integration_id }}",
                "email": "{{ variables.email.from_email | raw }}",
                "name": "{{ variables.email.from_name | raw }}",
            },
            "replyTo": "{{ variables.email.reply_to | raw }}",
            "cc": "{{ variables.email.cc | raw }}",
            "bcc": "{{ variables.email.bcc | raw }}",
            "subject": "{{ variables.email.subject | raw }}",
            "text": "{{ variables.email.text | raw }}",
            "html": "{{ variables.email.html | raw }}",
        }

    def test_rewrites_an_outdated_graph_and_bumps_the_version(self):
        created = get_or_create_api_sends_flow(self.team)
        outdated_actions = [
            {**action, "config": {**action["config"], "message_category_type": "marketing"}}
            if action["type"] == "function_email"
            else action
            for action in created.actions
        ]
        HogFlow.objects.filter(pk=created.pk).update(actions=outdated_actions)

        rewritten = get_or_create_api_sends_flow(self.team)

        assert rewritten.id == created.id
        assert rewritten.actions == created.actions
        assert rewritten.version == created.version + 1
        assert HogFlow.objects.get(pk=created.pk).actions == created.actions
