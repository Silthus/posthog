import { FeatureFlagHealthVerdict } from '~/queries/schema/schema-general'

export const FEATURE_FLAG_HEALTH_VERDICT_LABELS: Record<FeatureFlagHealthVerdict, string> = {
    [FeatureFlagHealthVerdict.Pass]: 'Healthy',
    [FeatureFlagHealthVerdict.Harm]: 'More errors with flag on',
    [FeatureFlagHealthVerdict.InsufficientData]: 'Not enough data',
    [FeatureFlagHealthVerdict.TelemetryFailure]: "Can't measure",
}
