// PROTOTYPE (throwaway): what a workflow sends, one row per dispatch step with its key detail.
import { getHogFlowStep } from '../../hogflows/steps/HogFlowSteps'
import type { WorkflowListItem } from '../shared/workflowListItems'
import type { DispatchDetail } from './workflowSummaries'

export function DispatchList({
    item,
    dispatches,
    limit,
}: {
    item: WorkflowListItem
    dispatches: DispatchDetail[]
    limit?: number
}): JSX.Element {
    if (dispatches.length === 0) {
        return <div className="text-xs text-tertiary">Sends nothing. Runs actions only.</div>
    }
    const shown = limit ? dispatches.slice(0, limit) : dispatches
    const hidden = dispatches.length - shown.length
    const actionsById = new Map(item.actions.map((action) => [action.id, action]))

    return (
        <ul className="flex flex-col gap-1 min-w-0">
            {shown.map((dispatch) => {
                const action = actionsById.get(dispatch.actionId)
                const step = action ? getHogFlowStep(action as any, {}) : undefined
                return (
                    <li key={dispatch.actionId} className="flex items-start gap-1.5 min-w-0">
                        <span
                            className="flex shrink-0 rounded p-0.5 text-xs mt-px"
                            // eslint-disable-next-line react/forbid-dom-props
                            style={{ backgroundColor: `${step?.color}20`, color: step?.color }}
                        >
                            {step?.icon}
                        </span>
                        <div className="flex flex-col min-w-0 leading-tight">
                            <span className="truncate text-sm" title={dispatch.primary}>
                                {dispatch.primary}
                            </span>
                            {dispatch.secondary ? (
                                <span className="truncate text-xs text-secondary" title={dispatch.secondary}>
                                    {dispatch.secondary}
                                </span>
                            ) : null}
                        </div>
                    </li>
                )
            })}
            {hidden > 0 ? <li className="text-xs text-secondary pl-6">{`+${hidden} more`}</li> : null}
        </ul>
    )
}
