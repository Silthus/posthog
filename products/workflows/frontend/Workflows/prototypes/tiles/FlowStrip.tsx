// PROTOTYPE (throwaway): the compact "trigger → steps → end" strip. Each step is its editor icon in the
// editor's color; waits show their duration, and a count line sums up the shape.
import { Tooltip } from '@posthog/lemon-ui'

import { getHogFlowStep } from '../../hogflows/steps/HogFlowSteps'
import { triggerIcon } from './TriggerLine'
import { FlowStep, TriggerKind, describeFlow } from './workflowSummaries'

const MAX_ICONS = 9

function plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function Arrow(): JSX.Element {
    return <span className="text-tertiary text-xs shrink-0">→</span>
}

export function FlowStrip({
    triggerKind,
    steps,
    showCounts = true,
}: {
    triggerKind: TriggerKind
    steps: FlowStep[]
    showCounts?: boolean
}): JSX.Element {
    const shape = describeFlow(steps)
    const shown = steps.slice(0, MAX_ICONS)
    const hidden = steps.length - shown.length

    return (
        <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap min-w-0">
                <span className="flex text-sm text-secondary shrink-0">{triggerIcon(triggerKind)}</span>
                {shown.map(({ action, branches }) => {
                    const step = getHogFlowStep(action as any, {})
                    const isDelay = action.type === 'delay'
                    const preview = step?.previews?.[0]?.label
                    return (
                        <span key={action.id} className="flex items-center gap-1 shrink-0">
                            <Arrow />
                            <Tooltip title={preview ? `${action.name}: ${preview}` : action.name}>
                                <span
                                    className="flex items-center gap-0.5 rounded px-1 py-0.5 text-xs"
                                    // eslint-disable-next-line react/forbid-dom-props
                                    style={{
                                        backgroundColor: `${step?.color ?? 'var(--color-text-secondary)'}20`,
                                        color: step?.color,
                                    }}
                                >
                                    {step?.icon}
                                    {isDelay && typeof preview === 'string' ? (
                                        <span className="whitespace-nowrap truncate max-w-24">
                                            {preview.replace(/^Wait (for )?/i, '')}
                                        </span>
                                    ) : null}
                                    {branches > 1 ? <span>{`×${branches}`}</span> : null}
                                </span>
                            </Tooltip>
                        </span>
                    )
                })}
                {hidden > 0 ? (
                    <span className="flex items-center gap-1 shrink-0">
                        <Arrow />
                        <span className="text-xs text-secondary">{`+${hidden}`}</span>
                    </span>
                ) : null}
                <Arrow />
                <span className="text-xs text-tertiary shrink-0">End</span>
            </div>
            {showCounts ? (
                <div className="text-xs text-secondary">
                    {[
                        plural(shape.steps, 'step'),
                        shape.waits ? plural(shape.waits, 'wait') : null,
                        shape.branches ? `${shape.branches} ${shape.branches === 1 ? 'branch' : 'branches'}` : null,
                        shape.dispatches
                            ? `${shape.dispatches} ${shape.dispatches === 1 ? 'dispatch' : 'dispatches'}`
                            : 'No dispatches',
                    ]
                        .filter(Boolean)
                        .join(' · ')}
                </div>
            ) : null}
        </div>
    )
}
