from datetime import UTC, timedelta
from functools import cached_property
from typing import TYPE_CHECKING

from django.utils import timezone

from rest_framework.exceptions import ValidationError

from posthog.schema import (
    CachedFeatureFlagHealthQueryResponse,
    DateRange,
    FeatureFlagHealthQuery,
    FeatureFlagHealthQueryResponse,
    FeatureFlagHealthResult,
    FeatureFlagHealthThresholds,
    FeatureFlagHealthVerdict,
    FeatureFlagHealthWindow,
)

from posthog.hogql import ast
from posthog.hogql.parser import parse_select
from posthog.hogql.query import execute_hogql_query

from posthog.hogql_queries.query_runner import AnalyticsQueryRunner
from posthog.hogql_queries.utils.query_date_range import QueryDateRange

from products.access_control.backend.facade.user_access_control import UserAccessControl, UserAccessControlError
from products.feature_flags.backend.flag_health_verdict import evaluate_flag_health
from products.feature_flags.backend.models import FeatureFlag

if TYPE_CHECKING:
    from posthog.models import User


class FeatureFlagHealthQueryRunner(AnalyticsQueryRunner[FeatureFlagHealthQueryResponse]):
    query: FeatureFlagHealthQuery
    cached_response: CachedFeatureFlagHealthQueryResponse

    @cached_property
    def flag(self) -> FeatureFlag | None:
        return FeatureFlag.objects.filter(
            team__project_id=self.team.project_id, key=self.query.flagKey, deleted=False
        ).first()

    def validate_query_runner_access(self, user: "User") -> bool:
        access = UserAccessControl(user=user, team=self.team)
        if self.flag is None:
            return access.assert_access_level_for_resource("feature_flag", "viewer")
        if not access.check_access_level_for_object(self.flag, "viewer"):
            raise UserAccessControlError("feature_flag", "viewer")
        return True

    def get_cache_payload(self) -> dict[str, object]:
        payload = super().get_cache_payload()
        flag = self.flag
        payload["flag_state"] = (
            (flag.id, flag.version, flag.aggregation_group_type_index, bool(flag.variants)) if flag else None
        )
        payload["exception_capture_opt_in"] = self.team.autocapture_exceptions_opt_in
        return payload

    @cached_property
    def thresholds(self) -> FeatureFlagHealthThresholds:
        thresholds = FeatureFlagHealthThresholds(
            toleratedExcess=self.query.toleratedExcess if self.query.toleratedExcess is not None else 0.01,
            minExposedPerArm=self.query.minExposedPerArm if self.query.minExposedPerArm is not None else 300,
            alpha=self.query.alpha if self.query.alpha is not None else 0.05,
        )
        if not 0 <= thresholds.toleratedExcess <= 1 or not 0 < thresholds.alpha < 1:
            raise ValidationError(
                "toleratedExcess must be between 0 and 1, and alpha must be between 0 and 1 exclusive"
            )
        return thresholds

    @cached_property
    def window(self) -> FeatureFlagHealthWindow:
        now = timezone.now()
        date_range = self.query.dateRange or DateRange(date_from="-24h")
        date_range = date_range.model_copy(update={"explicitDate": True, "date_from": date_range.date_from or "-24h"})
        parsed = QueryDateRange(
            date_range, self.team, None, now, exact_timerange=True, earliest_timestamp_fallback=now - timedelta(days=7)
        )
        try:
            end = min(parsed.date_to(), now - timedelta(minutes=5)).astimezone(UTC)
            if self.query.dateRange and self.query.dateRange.date_to and not self.query.dateRange.date_from:
                start = end - timedelta(hours=24)
            else:
                start = max(parsed.date_from(), end - timedelta(days=7)).astimezone(UTC)
        except ValueError as error:
            raise ValidationError("dateRange must contain valid dates") from error
        if start >= end:
            raise ValidationError("The health window must start before its mature end")
        return FeatureFlagHealthWindow(date_from=start.isoformat(), date_to=end.isoformat())

    def to_query(self) -> ast.SelectQuery | ast.SelectSetQuery:
        return parse_select(
            """
            SELECT
                countIf(on_events > 0 AND off_events = 0),
                countIf(on_events > 0 AND off_events = 0 AND exception_events > 0 AND last_exception >= first_on),
                countIf(off_events > 0 AND on_events = 0),
                countIf(off_events > 0 AND on_events = 0 AND exception_events > 0 AND last_exception >= first_off),
                countIf(on_events > 0 AND off_events > 0),
                sum(unknown_exceptions),
                sum(exception_events),
                sum(on_events + off_events)
            FROM (
                SELECT
                    person_id,
                    countIf(flag_value = 'true') AS on_events,
                    countIf(flag_value = 'false') AS off_events,
                    minIf(timestamp, flag_value = 'true') AS first_on,
                    minIf(timestamp, flag_value = 'false') AS first_off,
                    countIf(event = '$exception') AS exception_events,
                    maxIf(timestamp, event = '$exception') AS last_exception,
                    countIf(event = '$exception' AND flag_value NOT IN ('true', 'false')) AS unknown_exceptions
                FROM (
                    SELECT person_id, timestamp, event, JSONExtractRaw(properties, {flag_property}) AS flag_value
                    FROM events
                    WHERE timestamp >= toDateTime({start}) AND timestamp <= toDateTime({end})
                        AND properties.$lib = 'web'
                )
                WHERE event = '$exception' OR flag_value IN ('true', 'false')
                GROUP BY person_id
            )
            """,
            placeholders={
                "flag_property": ast.Constant(value=f"$feature/{self.query.flagKey}"),
                "start": ast.Constant(value=self.window.date_from),
                "end": ast.Constant(value=self.window.date_to),
            },
        )

    def _calculate(self) -> FeatureFlagHealthQueryResponse:
        thresholds = self.thresholds
        window = self.window
        flag = self.flag
        reason = None
        if flag is None:
            reason = "The flag was not found in this project. Check the flag key."
        elif flag.aggregation_group_type_index is not None:
            reason = "Group-aggregated flags are not supported. Use a person-based boolean flag."
        elif flag.variants:
            reason = "Multivariate flags are not supported. Use a boolean flag."
        row = [0] * 8
        response = None
        if reason is None:
            response = execute_hogql_query(
                query=self.to_query(),
                team=self.team,
                user=self.user,
                query_type="feature_flag_health_query",
                timings=self.timings,
                modifiers=self.modifiers,
                limit_context=self.limit_context,
            )
            row = response.results[0]
            if not row[7]:
                reason = "No browser event carries a boolean value for this flag in the window. Check flag evaluation."
            elif not self.team.autocapture_exceptions_opt_in and not row[6]:
                reason = "Exception capture appears disabled. Enable browser exception capture and collect events."
        assessment = evaluate_flag_health(
            int(row[0]),
            int(row[1]),
            int(row[2]),
            int(row[3]),
            thresholds.toleratedExcess,
            thresholds.minExposedPerArm,
            thresholds.alpha,
        )
        if reason:
            assessment.verdict = FeatureFlagHealthVerdict.TELEMETRY_FAILURE
            assessment.reason = reason
        result = FeatureFlagHealthResult(
            **assessment.model_dump(),
            crossovers=int(row[4]),
            exceptionsWithoutFlagState=int(row[5]),
            window=window,
            thresholds=thresholds,
        )
        return FeatureFlagHealthQueryResponse(
            results=[result], timings=response.timings if response else None, hogql=response.hogql if response else None
        )
