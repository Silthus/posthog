from posthog.schema import (
    FeatureFlagHealthArm,
    FeatureFlagHealthAssessment,
    FeatureFlagHealthBounds,
    FeatureFlagHealthVerdict,
)


def affected_arm(exposed: int, affected: int, alpha: float) -> FeatureFlagHealthArm:
    from scipy.stats import beta  # noqa: PLC0415 - keeps SciPy off Django startup paths

    lower = float(beta.ppf(alpha / 4, affected, exposed - affected + 1)) if affected else 0.0
    upper = float(beta.ppf(1 - alpha / 4, affected + 1, exposed - affected)) if affected < exposed else 1.0
    return FeatureFlagHealthArm(
        exposed=exposed,
        affected=affected,
        rate=affected / exposed if exposed else None,
        bounds=FeatureFlagHealthBounds(lower=lower, upper=upper),
    )


def evaluate_flag_health(
    on_exposed: int,
    on_affected: int,
    off_exposed: int,
    off_affected: int,
    tolerated_excess: float,
    min_exposed_per_arm: int,
    alpha: float,
) -> FeatureFlagHealthAssessment:
    on = affected_arm(on_exposed, on_affected, alpha)
    off = affected_arm(off_exposed, off_affected, alpha)
    excess = FeatureFlagHealthBounds(lower=on.bounds.lower - off.bounds.upper, upper=on.bounds.upper - off.bounds.lower)
    if excess.lower > tolerated_excess:
        verdict = FeatureFlagHealthVerdict.HARM
        reason = "The flag-on affected-user rate exceeds the tolerated excess."
    elif min(on_exposed, off_exposed) >= min_exposed_per_arm and excess.upper <= tolerated_excess:
        verdict = FeatureFlagHealthVerdict.PASS_
        reason = "Both arms have enough exposed users and the excess is within tolerance."
    else:
        verdict = FeatureFlagHealthVerdict.INSUFFICIENT_DATA
        reason = "There is not enough evidence to establish harm or pass. Collect more exposures in both arms."
    return FeatureFlagHealthAssessment(verdict=verdict, reason=reason, on=on, off=off, excessBounds=excess)
