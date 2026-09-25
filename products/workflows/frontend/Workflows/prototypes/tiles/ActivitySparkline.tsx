// PROTOTYPE (throwaway): a 7-day runs sparkline fed by the one batched query in tilesVariantLogic.
import { useValues } from 'kea'

import { LemonSkeleton } from '@posthog/lemon-ui'

import { Sparkline } from 'lib/components/Sparkline'
import { humanFriendlyNumber } from 'lib/utils/numbers'

import { tilesVariantLogic } from './tilesVariantLogic'

export function ActivitySparkline({ workflowId }: { workflowId: string }): JSX.Element {
    const { activity, activityLoading } = useValues(tilesVariantLogic)

    if (!activity && activityLoading) {
        return <LemonSkeleton className="h-6 w-24" />
    }
    const series = activity?.byWorkflow[workflowId]
    const total = series ? series.succeeded.reduce((a, b) => a + b, 0) + series.failed.reduce((a, b) => a + b, 0) : 0
    const failed = series ? series.failed.reduce((a, b) => a + b, 0) : 0

    if (!series || total === 0) {
        return <span className="text-xs text-tertiary">No runs in 7 days</span>
    }
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <Sparkline
                className="h-6 w-20 shrink-0"
                labels={activity!.days}
                data={[
                    { name: 'Completed', values: series.succeeded, color: 'success' },
                    { name: 'Failed', values: series.failed, color: 'danger' },
                ]}
            />
            <span className="text-xs text-secondary whitespace-nowrap" translate="no">
                {humanFriendlyNumber(total)} runs
                {failed ? <span className="text-danger">{` · ${humanFriendlyNumber(failed)} failed`}</span> : null}
            </span>
        </div>
    )
}
