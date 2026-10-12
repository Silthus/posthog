import { percentage } from 'lib/utils/numbers'
import { urls } from 'scenes/urls'

import { FeatureFlagHealthArm, FeatureFlagHealthResult } from '~/queries/schema/schema-general'
import { FilterLogicalOperator, PropertyFilterType, PropertyOperator } from '~/types'

import type { FeatureFlagHealthPeriod } from './featureFlagHealthLogic'
import { FEATURE_FLAG_HEALTH_VERDICT_LABELS } from './featureFlagHealthVerdictLabels'

const PERIOD_DESCRIPTIONS: Record<FeatureFlagHealthPeriod, string> = {
    '24h': 'last 24 hours',
    '7d': 'last 7 days',
}

export function featureFlagHealthErrorTrackingUrl(flagKey: string, period: FeatureFlagHealthPeriod): string {
    return urls.errorTracking({
        dateRange: { date_from: `-${period}`, date_to: null },
        filterGroup: {
            type: FilterLogicalOperator.And,
            values: [
                {
                    type: FilterLogicalOperator.And,
                    values: [
                        {
                            key: `$feature/${flagKey}`,
                            value: ['true'],
                            operator: PropertyOperator.Exact,
                            type: PropertyFilterType.Event,
                        },
                    ],
                },
            ],
        },
    })
}

function describeArm(arm: FeatureFlagHealthArm): string {
    const rate = arm.rate === null ? 'no users' : percentage(arm.rate, 1)
    return `${arm.affected} of ${arm.exposed} users had a browser exception (${rate})`
}

export function featureFlagHealthInvestigationPrompt(
    flagKey: string,
    period: FeatureFlagHealthPeriod,
    health: FeatureFlagHealthResult
): string {
    return [
        `Investigate the health of the feature flag "${flagKey}" over the ${PERIOD_DESCRIPTIONS[period]}`,
        `(${health.window.date_from} to ${health.window.date_to}).`,
        `The health verdict is "${FEATURE_FLAG_HEALTH_VERDICT_LABELS[health.verdict]}".`,
        `With the flag on, ${describeArm(health.on)}.`,
        `With the flag off, ${describeArm(health.off)}.`,
        `Compare $exception events where the "$feature/${flagKey}" property is true with those where it is false.`,
        'Which exceptions are new or more frequent with the flag on, and what likely caused them?',
    ].join(' ')
}
