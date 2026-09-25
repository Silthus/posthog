// PROTOTYPE (throwaway): the step icons and counts from today's Dispatches column, for any list item.
import { useMemo } from 'react'

import { getHogFlowStep } from '../../hogflows/steps/HogFlowSteps'
import type { WorkflowListItem } from './workflowListItems'

export function WorkflowDispatchSummary({ item }: { item: WorkflowListItem }): JSX.Element {
    const byType = useMemo(() => {
        const result: Record<string, { count: number; icon: JSX.Element; color: string }> = {}
        for (const action of item.actions) {
            const step = getHogFlowStep(action, {})
            if (!step || !step.type.startsWith('function')) {
                continue
            }
            const key = 'template_id' in action.config ? String(action.config.template_id) : action.type
            result[key] = { count: (result[key]?.count ?? 0) + 1, icon: step.icon, color: step.color }
        }
        return result
    }, [item.actions])

    return (
        <div className="flex flex-row gap-2 items-center">
            {Object.entries(byType).map(([type, { count, icon, color }]) => (
                <div
                    key={type}
                    className="rounded px-1 flex items-center justify-center gap-1"
                    // eslint-disable-next-line react/forbid-dom-props
                    style={{ backgroundColor: `${color}20`, color }}
                >
                    {icon} <span translate="no">{count}</span>
                </div>
            ))}
        </div>
    )
}
