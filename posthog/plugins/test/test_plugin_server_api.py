from datetime import UTC, datetime

import time_machine
from unittest import TestCase
from unittest.mock import patch

import requests

from posthog.plugins.plugin_server_api import (
    WORKFLOWS_API_SEND_JWT_PURPOSE,
    ApiSendEmail,
    ApiSendInvocation,
    HogFlowApiSendTimeout,
    create_hog_flow_api_send,
)

POST_PATH = "posthog.plugins.plugin_server_api.internal_requests.post"

SEND = ApiSendInvocation(
    invocation_id="01920000-0000-0000-0000-000000000001",
    distinct_id="user_42",
    email=ApiSendEmail(
        to="jane@example.com",
        integration_id=42,
        from_email="hello@example.com",
        from_name="Tom & Jerry",
        reply_to="support@example.com",
        cc="",
        bcc="",
        subject="Welcome <Jane>",
        text="Hi Jane",
        html="<p>Hi Jane</p>",
    ),
)


class TestCreateHogFlowApiSend(TestCase):
    @time_machine.travel("2026-01-01T00:00:00Z", tick=False)
    @patch(POST_PATH)
    def test_posts_the_send_with_a_token_for_that_team_and_flow_only(self, mock_post):
        create_hog_flow_api_send(team_id=7, hog_flow_id="flow-uuid", send=SEND)

        url = mock_post.call_args.args[0]
        kwargs = mock_post.call_args.kwargs
        assert url.endswith("/api/projects/7/hog_flows/flow-uuid/api_sends")
        assert kwargs["json"] == {
            "invocation_id": "01920000-0000-0000-0000-000000000001",
            "distinct_id": "user_42",
            "email": {
                "to": "jane@example.com",
                "integration_id": 42,
                "from_email": "hello@example.com",
                "from_name": "Tom & Jerry",
                "reply_to": "support@example.com",
                "cc": "",
                "bcc": "",
                "subject": "Welcome <Jane>",
                "text": "Hi Jane",
                "html": "<p>Hi Jane</p>",
            },
        }
        assert "x-internal-api-secret" not in {key.lower() for key in kwargs["headers"]}
        token = kwargs["headers"]["Authorization"].removeprefix("Bearer ")
        claims = WORKFLOWS_API_SEND_JWT_PURPOSE.verify(token)
        assert (claims["team_id"], claims["hog_flow_id"]) == (7, "flow-uuid")
        assert claims["exp"] == datetime(2026, 1, 1, 0, 2, tzinfo=UTC).timestamp()

    @patch(POST_PATH, side_effect=requests.ReadTimeout("read timed out"))
    def test_a_timeout_surfaces_as_its_own_error(self, _mock_post):
        with self.assertRaises(HogFlowApiSendTimeout):
            create_hog_flow_api_send(team_id=7, hog_flow_id="flow-uuid", send=SEND)
