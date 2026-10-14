from datetime import UTC, datetime, timedelta

import time_machine
from posthog.test.base import APIBaseTest, ClickhouseTestMixin, _create_event, _create_person, flush_persons_and_events

from parameterized import parameterized

from posthog.schema import FeatureFlagHealthResult

from posthog.constants import AvailableFeature
from posthog.hogql_queries.query_runner import get_query_runner
from posthog.models import OrganizationMembership, PropertyDefinition, Team
from posthog.models.personal_api_key import PersonalAPIKey
from posthog.models.utils import generate_random_token_personal, hash_key_value

from products.access_control.backend.models.access_control import AccessControl
from products.access_control.backend.models.property_access_control import PropertyAccessControl
from products.feature_flags.backend.models import FeatureFlag

NOW = datetime(2026, 1, 15, 12, tzinfo=UTC)


@time_machine.travel(NOW, tick=False)
class TestFlagHealthQuery(ClickhouseTestMixin, APIBaseTest):
    def setUp(self) -> None:
        super().setUp()
        self.flag = FeatureFlag.objects.create(team=self.team, key="health-test", filters={"groups": []})
        self.team.autocapture_exceptions_opt_in = True
        self.team.save()

    def emit(
        self, person: str, value: bool | str | None, event: str = "$pageview", minutes: int = 60, lib: str = "web"
    ) -> None:
        properties: dict[str, str | bool] = {"$lib": lib}
        if value is not None:
            properties["$feature/health-test"] = value
        _create_event(
            team=self.team,
            distinct_id=person,
            event=event,
            timestamp=NOW - timedelta(minutes=minutes),
            properties=properties,
        )

    def run_health(self, **overrides: object) -> FeatureFlagHealthResult:
        flush_persons_and_events()
        runner = get_query_runner(
            {
                "kind": "FeatureFlagHealthQuery",
                "flagKey": "health-test",
                "minExposedPerArm": 5,
                "toleratedExcess": 0.5,
                **overrides,
            },
            self.team,
        )
        return runner.calculate().results[0]

    @parameterized.expand(
        [
            ("pass", 10, 10, False, "pass"),
            ("harm", 10, 10, True, "harm"),
            ("low_n", 1, 1, False, "insufficient_data"),
            ("missing_off", 10, 0, False, "insufficient_data"),
        ]
    )
    def test_observed_verdict(self, _name: str, on_n: int, off_n: int, errors: bool, expected: str) -> None:
        for arm, size in [(True, on_n), (False, off_n)]:
            for i in range(size):
                person = f"{arm}-{i}"
                _create_person(team=self.team, distinct_ids=[person])
                self.emit(person, arm)
                if errors and arm:
                    self.emit(person, arm, "$exception", 30)
        result = self.run_health(toleratedExcess=0.01 if errors else 0.5)
        assert result.verdict == expected
        assert result.on.exposed == on_n
        assert result.off.exposed == off_n
        assert result.on.affected == (on_n if errors else 0)
        assert result.off.affected == 0

    def test_exposure_identity_and_exception_ordering(self) -> None:
        for person in ["on", "off", "cross", "variant", "backend"]:
            _create_person(team=self.team, distinct_ids=[person])
        self.emit("on", True)
        self.emit("on", None, "$exception", 30)
        self.emit("on", True, "$exception", 20)
        self.emit("off", False)
        self.emit("off", None, "$exception", 90)
        self.emit("cross", True)
        self.emit("cross", False)
        self.emit("cross", False, "$exception", 30)
        self.emit("variant", "false")
        self.emit("variant", "false", "$exception", 30)
        self.emit("backend", False, lib="python")
        self.emit("off", False, "$exception", 2)
        result = self.run_health()
        assert (result.on.exposed, result.on.affected) == (1, 1)
        assert (result.off.exposed, result.off.affected) == (1, 0)
        assert result.crossovers == 1
        assert result.exceptionsWithoutFlagState == 3
        assert result.window.date_to == (NOW - timedelta(minutes=5)).isoformat()

    @parameterized.expand(["missing_flag", "multivariate", "group", "no_flag_events", "capture_off"])
    def test_structural_telemetry_failure(self, cause: str) -> None:
        if cause == "missing_flag":
            self.flag.delete()
        elif cause == "multivariate":
            self.flag.filters = {"groups": [], "multivariate": {"variants": [{"key": "a", "rollout_percentage": 100}]}}
            self.flag.save()
        elif cause == "group":
            self.flag.filters = {"groups": [], "aggregation_group_type_index": 0}
            self.flag.save()
        elif cause == "capture_off":
            self.team.autocapture_exceptions_opt_in = False
            self.team.save()
            _create_person(team=self.team, distinct_ids=["on"])
            self.emit("on", True)
        result = self.run_health()
        assert result.verdict == "telemetry_failure"
        assert result.reason

    def test_exception_events_establish_capture_when_opt_in_is_off(self) -> None:
        self.team.autocapture_exceptions_opt_in = False
        self.team.save()
        _create_person(team=self.team, distinct_ids=["on"])
        self.emit("on", True)
        self.emit("on", None, "$exception", 30)
        assert self.run_health().verdict == "insufficient_data"

    @parameterized.expand(
        [
            (["query:read"], 403),
            (["feature_flag:read"], 403),
            (["query:read", "feature_flag:read"], 200),
        ]
    )
    def test_query_endpoint_scopes(self, scopes: list[str], expected: int) -> None:
        value = generate_random_token_personal()
        PersonalAPIKey.objects.create(label="test", user=self.user, secure_value=hash_key_value(value), scopes=scopes)
        response = self.client.post(
            f"/api/projects/{self.team.pk}/query/",
            {"query": {"kind": "FeatureFlagHealthQuery", "flagKey": "health-test"}},
            HTTP_AUTHORIZATION=f"Bearer {value}",
        )
        assert response.status_code == expected, response.json()
        if expected == 200:
            assert response.json()["results"][0]["verdict"] == "telemetry_failure"

    @parameterized.expand(
        [
            ("default", {}, "2026-01-14T12:00:00+00:00", "2026-01-15T11:55:00+00:00"),
            ("capped", {"date_from": "-30d"}, "2026-01-08T11:55:00+00:00", "2026-01-15T11:55:00+00:00"),
            (
                "historical",
                {"date_from": "2026-01-01T12:00:00Z", "date_to": "2026-01-02T12:00:00Z"},
                "2026-01-01T12:00:00+00:00",
                "2026-01-02T12:00:00+00:00",
            ),
            (
                "historical_end_only",
                {"date_to": "2026-01-02T12:00:00Z"},
                "2026-01-01T12:00:00+00:00",
                "2026-01-02T12:00:00+00:00",
            ),
        ]
    )
    def test_window(self, _name: str, date_range: dict[str, str], start: str, end: str) -> None:
        result = self.run_health(dateRange=date_range)
        assert result.window.date_from == start
        assert result.window.date_to == end
        assert result.thresholds.alpha == 0.05

    def test_flag_is_shared_between_environments_but_events_are_not(self) -> None:
        other_environment = Team.objects.create(organization=self.organization, project=self.team.project)
        self.flag.team = other_environment
        self.flag.save()
        _create_person(team=self.team, distinct_ids=["on"])
        self.emit("on", True)
        result = self.run_health()
        assert result.verdict == "insufficient_data"
        assert result.on.exposed == 1

    @parameterized.expand(
        [
            ("alpha", {"alpha": 0}),
            ("window", {"dateRange": {"date_from": "2026-01-16T12:00:00Z"}}),
        ]
    )
    def test_invalid_health_input_is_a_client_error(self, _name: str, overrides: dict[str, object]) -> None:
        response = self.client.post(
            f"/api/projects/{self.team.id}/query/",
            {"query": {"kind": "FeatureFlagHealthQuery", "flagKey": "health-test", **overrides}},
        )
        assert response.status_code == 400, response.json()

    @parameterized.expand([(False, 400), (True, 200)])
    def test_flag_object_access_overrides_resource_default(self, grant: bool, expected: int) -> None:
        features = [AvailableFeature.ACCESS_CONTROL, AvailableFeature.ROLE_BASED_ACCESS]
        self.organization.available_product_features = [{"key": feature, "name": feature} for feature in features]
        self.organization.save()
        member = self._create_user("health-viewer@example.com", level=OrganizationMembership.Level.MEMBER)
        membership = member.organization_memberships.get(organization=self.organization)
        AccessControl.objects.create(resource="feature_flag", team=self.team, access_level="none")
        if grant:
            AccessControl.objects.create(
                resource="feature_flag",
                resource_id=self.flag.id,
                team=self.team,
                organization_member=membership,
                access_level="viewer",
            )
        self.client.force_login(member)
        response = self.client.post(
            f"/api/projects/{self.team.id}/query/",
            {"query": {"kind": "FeatureFlagHealthQuery", "flagKey": "health-test"}},
        )
        assert response.status_code == expected, response.json()

    def test_property_restrictions_apply_to_the_query_and_its_cache(self) -> None:
        features = [AvailableFeature.PROPERTY_ACCESS_CONTROL, AvailableFeature.ROLE_BASED_ACCESS]
        self.organization.available_product_features = [{"key": feature, "name": feature} for feature in features]
        self.organization.save()
        _create_person(team=self.team, distinct_ids=["on"])
        self.emit("on", True)
        flush_persons_and_events()
        payload = {"query": {"kind": "FeatureFlagHealthQuery", "flagKey": "health-test"}}
        unrestricted = self.client.post(f"/api/projects/{self.team.id}/query/", payload)
        assert unrestricted.status_code == 200, unrestricted.json()
        assert unrestricted.json()["results"][0]["on"]["exposed"] == 1
        member = self._create_user("health-restricted@example.com", level=OrganizationMembership.Level.MEMBER)
        definition = PropertyDefinition.objects.create(
            team=self.team, name="$feature/health-test", type=PropertyDefinition.Type.EVENT
        )
        PropertyAccessControl.objects.create(
            team=self.team,
            property_definition=definition,
            access_level="none",
            organization_member=member.organization_memberships.get(organization=self.organization),
        )
        self.client.force_login(member)
        restricted = self.client.post(f"/api/projects/{self.team.id}/query/", payload)
        assert restricted.status_code == 200, restricted.json()
        assert restricted.json()["results"][0]["on"]["exposed"] == 0

    def test_cached_health_is_invalidated_when_flag_kind_changes(self) -> None:
        _create_person(team=self.team, distinct_ids=["on"])
        self.emit("on", True)
        flush_persons_and_events()
        payload = {"query": {"kind": "FeatureFlagHealthQuery", "flagKey": "health-test"}}
        first = self.client.post(f"/api/projects/{self.team.id}/query/", payload)
        assert first.status_code == 200, first.json()
        assert first.json()["results"][0]["verdict"] == "insufficient_data"
        self.flag.filters = {"groups": [], "aggregation_group_type_index": 0}
        self.flag.save()
        second = self.client.post(f"/api/projects/{self.team.id}/query/", payload)
        assert second.status_code == 200, second.json()
        assert second.json()["results"][0]["verdict"] == "telemetry_failure"
