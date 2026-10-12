import { useActions, useValues } from 'kea'

import {
    LemonButton,
    LemonSegmentedButton,
    LemonSegmentedButtonOption,
    LemonSkeleton,
    LemonTag,
    LemonTagType,
} from '@posthog/lemon-ui'

import { percentage } from 'lib/utils/numbers'

import { FeatureFlagHealthArm, FeatureFlagHealthVerdict } from '~/queries/schema/schema-general'

import { FeatureFlagHealthPeriod, featureFlagHealthLogic } from './featureFlagHealthLogic'

const VERDICT_TAGS: Record<FeatureFlagHealthVerdict, { label: string; type: LemonTagType }> = {
    [FeatureFlagHealthVerdict.Pass]: { label: 'Healthy', type: 'success' },
    [FeatureFlagHealthVerdict.Harm]: { label: 'More errors with flag on', type: 'danger' },
    [FeatureFlagHealthVerdict.InsufficientData]: { label: 'Not enough data', type: 'muted' },
    [FeatureFlagHealthVerdict.TelemetryFailure]: { label: "Can't measure", type: 'warning' },
}

const PERIOD_OPTIONS: LemonSegmentedButtonOption<FeatureFlagHealthPeriod>[] = [
    // pinned: data-attr values, renaming breaks autocapture dashboards
    { value: '24h', label: '24h', 'data-attr': 'feature-flag-health-period-24h' },
    { value: '7d', label: '7d', 'data-attr': 'feature-flag-health-period-7d' },
]

function HealthArm({ label, arm }: { label: string; arm: FeatureFlagHealthArm }): JSX.Element {
    return (
        <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs text-secondary">{label}</span>
            <span className="text-lg font-semibold tabular-nums">
                {arm.rate === null ? 'No users' : percentage(arm.rate, 1)}
            </span>
            <span className="text-xs text-secondary tabular-nums">
                {arm.affected.toLocaleString()} of {arm.exposed.toLocaleString()} users had an error
            </span>
        </div>
    )
}

export interface FeatureFlagHealthCardProps {
    flagKey: string
}

export function FeatureFlagHealthCard({ flagKey }: FeatureFlagHealthCardProps): JSX.Element {
    const logic = featureFlagHealthLogic({ flagKey })
    const { period, healthResponse, healthResponseLoading, loadFailed, health } = useValues(logic)
    const { setPeriod, loadHealthResponse } = useActions(logic)

    return (
        <div className="rounded border p-4 bg-bg-light flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-semibold">Health</div>
                <LemonSegmentedButton
                    size="xsmall"
                    value={period}
                    onChange={(newPeriod) => newPeriod !== period && setPeriod(newPeriod)}
                    options={PERIOD_OPTIONS}
                />
            </div>
            {healthResponseLoading || (!healthResponse && !loadFailed) ? (
                <div className="flex flex-col gap-2">
                    <LemonSkeleton className="h-5 w-32" />
                    <LemonSkeleton className="h-10" />
                </div>
            ) : loadFailed ? (
                <div className="flex flex-col gap-2 items-start">
                    <span className="text-sm">Couldn't load flag health. Try again in a moment.</span>
                    <LemonButton
                        type="secondary"
                        size="small"
                        onClick={() => loadHealthResponse()}
                        data-attr="feature-flag-health-retry"
                    >
                        Try again
                    </LemonButton>
                </div>
            ) : !health ? (
                <span className="text-sm text-secondary">
                    No health result for this window yet. Check back once the flag has more traffic.
                </span>
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1 items-start">
                        <LemonTag type={VERDICT_TAGS[health.verdict].type}>
                            {VERDICT_TAGS[health.verdict].label}
                        </LemonTag>
                        <span className="text-sm">{health.reason}</span>
                    </div>
                    {health.verdict !== FeatureFlagHealthVerdict.TelemetryFailure && (
                        <div className="grid grid-cols-2 gap-3">
                            <HealthArm label="Flag on" arm={health.on} />
                            <HealthArm label="Flag off" arm={health.off} />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
