from typing import Any

from posthog.test.base import APIBaseTest
from unittest.mock import MagicMock, patch

from django.test import override_settings

import requests
from parameterized import parameterized
from rest_framework import status

from posthog.models.integration import Integration
from posthog.models.project_secret_api_key import ProjectSecretAPIKey
from posthog.models.team import Team
from posthog.models.utils import hash_key_value

from products.workflows.backend.models import HogFlow
from products.workflows.backend.models.team_workflows_config import TeamWorkflowsConfig

FLAG_PATH = "posthoganalytics.feature_enabled"
CAPTURE_PATH = "posthoganalytics.capture"
CDP_POST_PATH = "posthog.plugins.plugin_server_api.internal_requests.post"
EMAIL_API_FLAG = "workflows-email-api"
DOCS_URL = "https://posthog.com/docs/workflows/email-api"


def _flag_on(flag: str, *args: Any, **kwargs: Any) -> bool:
    return flag == EMAIL_API_FLAG


def _flag_off(flag: str, *args: Any, **kwargs: Any) -> bool:
    return False


def _flag_fails(flag: str, *args: Any, **kwargs: Any) -> bool:
    if flag == EMAIL_API_FLAG:
        raise RuntimeError("flag service unreachable")
    return False


def _cdp_response(status_code: int = 200) -> MagicMock:
    response = MagicMock()
    response.status_code = status_code
    return response


MINIMAL_EMAIL: dict[str, Any] = {
    "from": "hello@example.com",
    "to": "jane@example.com",
    "subject": "Welcome",
    "html": "<p>Hi Jane</p>",
}


class TestEmailSendsAPI(APIBaseTest):
    def setUp(self) -> None:
        super().setUp()
        self.client.logout()
        self.sender = self._create_sender("hello@example.com", verified=True)
        self.token = self._create_project_secret_key(self.team, ["email_send:write"])
        self.url = "/api/projects/@current/emails/"

    def _create_sender(self, address: str, verified: bool, name: str = "Example") -> Integration:
        return Integration.objects.create(
            team=self.team,
            kind="email",
            integration_id=address,
            config={
                "email": address,
                "domain": address.split("@")[1],
                "name": name,
                "provider": "ses",
                "verified": verified,
            },
        )

    def _create_project_secret_key(self, team: Team, scopes: list[str], label: str = "sender") -> str:
        token = "phs_" + "a" * 35 + label
        ProjectSecretAPIKey.objects.create(
            team=team,
            label=label,
            mask_value=f"phs_...{label[:4]}",
            secure_value=hash_key_value(token),
            scopes=scopes,
        )
        return token

    def _set_default_sender(self, sender: Integration) -> None:
        TeamWorkflowsConfig.objects.update_or_create(
            team=self.team, defaults={"default_email_integration_id": sender.id}
        )

    def _send(self, payload: Any, token: str | None = None, url: str | None = None) -> Any:
        return self.client.post(
            url or self.url,
            payload,
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {token or self.token}",
        )

    @patch(CAPTURE_PATH)
    @patch(FLAG_PATH, side_effect=_flag_on)
    @patch(CDP_POST_PATH, return_value=_cdp_response())
    def test_sends_one_email_through_the_api_sends_workflow(
        self, cdp_post: MagicMock, _flag: MagicMock, capture: MagicMock
    ) -> None:
        response = self._send(
            {
                "from": "Tom & Jerry <hello@example.com>",
                "to": "jane@example.com",
                "subject": "Welcome <Jane> & friends",
                "html": "<p>Hi Jane</p>",
                "text": "Hi Jane",
                "replyTo": "support@example.com",
                "cc": ["ops@example.com", "Team <team@example.com>"],
                "bcc": "audit@example.com",
                "distinctId": "user_42",
            }
        )

        assert response.status_code == status.HTTP_200_OK, response.json()
        body = response.json()
        flow = HogFlow.objects.get(team=self.team, origin_product=HogFlow.OriginProduct.API_SENDS)
        assert body["url"] == f"http://localhost:8010/project/{self.team.id}/workflows/{flow.id}/invocations"
        sent = cdp_post.call_args.kwargs["json"]
        assert cdp_post.call_args.args[0].endswith(f"/api/projects/{self.team.id}/hog_flows/{flow.id}/api_sends")
        assert sent == {
            "invocation_id": body["id"],
            "distinct_id": "user_42",
            "email": {
                "to": "jane@example.com",
                "integration_id": self.sender.id,
                "from_email": "hello@example.com",
                "from_name": "Tom & Jerry",
                "reply_to": "support@example.com",
                "cc": "ops@example.com, team@example.com",
                "bcc": "audit@example.com",
                "subject": "Welcome <Jane> & friends",
                "text": "Hi Jane",
                "html": "<p>Hi Jane</p>",
            },
        }
        sends_captured = [call for call in capture.call_args_list if call.kwargs.get("event") == "email api send"]
        assert len(sends_captured) == 1
        assert sends_captured[0].kwargs["properties"]["auth_method"] == "project_secret_api_key"

    @parameterized.expand(
        [
            ("the exact sender", "hello@example.com", "hello@example.com", ""),
            ("another address on its domain", "Support <support@example.com>", "support@example.com", "Support"),
            ("a list-shaped to and no from", None, "", ""),
        ]
    )
    @patch(FLAG_PATH, side_effect=_flag_on)
    @patch(CDP_POST_PATH, return_value=_cdp_response())
    def test_resolves_the_sender(
        self,
        _name: str,
        from_address: str | None,
        expected_from_email: str,
        expected_from_name: str,
        cdp_post: MagicMock,
        _flag: MagicMock,
    ) -> None:
        self._create_sender("hello@other-example.com", verified=True)
        self._set_default_sender(self.sender)
        payload = {**MINIMAL_EMAIL, "to": ["jane@example.com"], "from": from_address}

        response = self._send(payload)

        assert response.status_code == status.HTTP_200_OK, response.json()
        email = cdp_post.call_args.kwargs["json"]["email"]
        assert (email["integration_id"], email["from_email"], email["from_name"]) == (
            self.sender.id,
            expected_from_email,
            expected_from_name,
        )

    @patch(FLAG_PATH, side_effect=_flag_on)
    @patch(CDP_POST_PATH, return_value=_cdp_response())
    def test_a_text_only_email_gets_its_html_from_the_text(self, cdp_post: MagicMock, _flag: MagicMock) -> None:
        response = self._send({**MINIMAL_EMAIL, "html": "", "text": "Hi <Jane> & Tom,\nwelcome aboard."})

        assert response.status_code == status.HTTP_200_OK, response.json()
        email = cdp_post.call_args.kwargs["json"]["email"]
        assert email["html"] == "Hi &lt;Jane&gt; &amp; Tom,<br>\nwelcome aboard."
        assert email["text"] == "Hi <Jane> & Tom,\nwelcome aboard."

    @parameterized.expand(
        [
            ("personal api key with the scope", "personal_key", 403, "permission_denied"),
            ("logged-in session", "session", 403, "permission_denied"),
            ("project token", "project_token", 401, "authentication_failed"),
            ("no credentials", "none", 401, "not_authenticated"),
            ("project secret key without the scope", "unscoped_key", 403, "permission_denied"),
            ("project secret key of another project", "other_project_key", 403, "permission_denied"),
        ]
    )
    @patch(FLAG_PATH, side_effect=_flag_on)
    @patch(CDP_POST_PATH, return_value=_cdp_response())
    def test_only_a_project_secret_key_with_the_scope_sends(
        self,
        _name: str,
        credential: str,
        expected_status: int,
        expected_code: str,
        cdp_post: MagicMock,
        _flag: MagicMock,
    ) -> None:
        url = f"/api/projects/{self.team.id}/emails/"
        headers: dict[str, Any] = {}
        match credential:
            case "personal_key":
                headers["HTTP_AUTHORIZATION"] = (
                    f"Bearer {self.create_personal_api_key_with_scopes(['email_send:write'])}"
                )
            case "session":
                self.client.force_login(self.user)
            case "project_token":
                headers["HTTP_AUTHORIZATION"] = f"Bearer {self.team.api_token}"
            case "unscoped_key":
                headers["HTTP_AUTHORIZATION"] = (
                    f"Bearer {self._create_project_secret_key(self.team, ['endpoint:read'], 'unscoped')}"
                )
            case "other_project_key":
                other_team = Team.objects.create(organization=self.organization, name="Other")
                headers["HTTP_AUTHORIZATION"] = (
                    f"Bearer {self._create_project_secret_key(other_team, ['email_send:write'], 'other')}"
                )

        response = self.client.post(url, MINIMAL_EMAIL, content_type="application/json", **headers)

        assert response.status_code == expected_status, response.json()
        assert response.json()["code"] == expected_code
        cdp_post.assert_not_called()

    @parameterized.expand(
        [
            ("flag off", {}, _flag_off, None, 403, "email_api_not_enabled", None),
            ("flag evaluation fails", {}, _flag_fails, None, 403, "email_api_not_enabled", None),
            ("no subject", {"subject": None}, _flag_on, None, 400, "invalid_request", "subject"),
            ("multi-line subject", {"subject": "Hi\nthere"}, _flag_on, None, 400, "invalid_request", "subject"),
            ("cc of the wrong type", {"cc": 42}, _flag_on, None, 400, "invalid_request", "cc"),
            ("no body", {"html": " ", "text": ""}, _flag_on, None, 400, "missing_body", None),
            ("malformed to", {"to": "jane"}, _flag_on, None, 400, "invalid_address", "to"),
            (
                "malformed cc",
                {"cc": ["ops@example.com", "not an address"]},
                _flag_on,
                None,
                400,
                "invalid_address",
                "cc",
            ),
            (
                "two addresses in one to",
                {"to": "a@example.com, b@example.com"},
                _flag_on,
                None,
                400,
                "invalid_address",
                "to",
            ),
            (
                "two to recipients",
                {"to": ["a@example.com", "b@example.com"]},
                _flag_on,
                None,
                400,
                "too_many_recipients",
                "to",
            ),
            (
                "cc plus bcc over the limit",
                {"cc": ["a@example.com"], "bcc": ["b@example.com", "c@example.com"]},
                _flag_on,
                None,
                400,
                "too_many_recipients",
                None,
            ),
            (
                "from on an unknown domain",
                {"from": "hi@unknown.example.com"},
                _flag_on,
                None,
                422,
                "sender_not_found",
                "from",
            ),
            (
                "from on an unverified domain",
                {"from": "hi@unverified.example.com"},
                _flag_on,
                None,
                422,
                "sender_not_verified",
                "from",
            ),
            ("no from and no default sender", {"from": None}, _flag_on, None, 422, "no_default_sender", "from"),
            ("over the billing quota", {}, _flag_on, _cdp_response(402), 402, "quota_limit_exceeded", None),
            ("sending paused", {}, _flag_on, _cdp_response(423), 423, "sending_paused", None),
            ("flow not active", {}, _flag_on, _cdp_response(409), 503, "send_service_unavailable", None),
            ("plugin server error", {}, _flag_on, _cdp_response(500), 503, "send_service_unavailable", None),
            (
                "plugin server timeout",
                {},
                _flag_on,
                requests.ReadTimeout("timed out"),
                503,
                "send_service_unavailable",
                None,
            ),
            (
                "plugin server unreachable",
                {},
                _flag_on,
                requests.ConnectionError("refused"),
                503,
                "send_service_unavailable",
                None,
            ),
        ]
    )
    @override_settings(EMAIL_API_MAX_CC_BCC_RECIPIENTS=2)
    def test_error_catalog(
        self,
        _name: str,
        payload_changes: dict[str, Any],
        flag: Any,
        cdp_outcome: MagicMock | Exception | None,
        expected_status: int,
        expected_code: str,
        expected_attr: str | None,
    ) -> None:
        self._create_sender("hi@unverified.example.com", verified=False)
        payload = {key: value for key, value in {**MINIMAL_EMAIL, **payload_changes}.items() if value is not None}
        cdp_kwargs = (
            {"side_effect": cdp_outcome} if isinstance(cdp_outcome, Exception) else {"return_value": cdp_outcome}
        )

        with patch(FLAG_PATH, side_effect=flag), patch(CDP_POST_PATH, **cdp_kwargs) as cdp_post:
            response = self._send(payload)

        assert response.status_code == expected_status, response.json()
        body = response.json()
        assert {key: body[key] for key in ("code", "attr", "docs_url")} == {
            "code": expected_code,
            "attr": expected_attr,
            "docs_url": f"{DOCS_URL}#{expected_code}",
        }
        assert body["type"] in {"validation_error", "authentication_error", "server_error"}
        assert body["detail"]
        if cdp_outcome is None:
            cdp_post.assert_not_called()
