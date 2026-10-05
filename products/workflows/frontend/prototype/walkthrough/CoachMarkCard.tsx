import { IconSparkles, IconX } from '@posthog/icons'
import { LemonButton, Spinner } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { WalkthroughState } from './useWalkthrough'
import { finishCopy } from './walkthroughStops'

interface CoachMarkCardProps {
    walkthrough: WalkthroughState
    chipsEnabled: boolean
}

export function CoachMarkCard({ walkthrough, chipsEnabled }: CoachMarkCardProps): JSX.Element | null {
    const { stop, stops, index, isFirst, hasDraft, workflowId, messages, pendingChip, appliedChips } = walkthrough
    if (!stop) {
        return null
    }
    const isFinish = stop.kind === 'finish'
    const copy = isFinish ? finishCopy(hasDraft) : { title: stop.title, body: stop.body }
    const chipTranscript = messages.filter((m) => m.stopIndex === index && m.text !== copy.body)
    const applied = appliedChips[stop.id] ?? []

    return (
        <div className="flex w-[20rem] max-w-full flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-secondary">
                    {index + 1} of {stops.length}
                </span>
                <LemonButton
                    size="xsmall"
                    icon={<IconX />}
                    onClick={walkthrough.skip}
                    tooltip="Skip the walkthrough"
                    aria-label="Skip the walkthrough"
                />
            </div>
            <div>
                <h4 className="mb-1">{copy.title}</h4>
                <p className="mb-0 text-sm">{copy.body}</p>
            </div>
            {chipsEnabled && stop.chips.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {stop.chips.map((chip) => (
                        <LemonButton
                            key={chip.label}
                            size="xsmall"
                            type="secondary"
                            icon={<IconSparkles className="text-ai" />}
                            loading={pendingChip === chip}
                            disabledReason={
                                applied.includes(chip.label)
                                    ? 'Already applied'
                                    : pendingChip
                                      ? 'PostHog AI is still working'
                                      : undefined
                            }
                            onClick={() => walkthrough.applyChip(chip)}
                        >
                            {chip.label}
                        </LemonButton>
                    ))}
                </div>
            )}
            {(chipTranscript.length > 0 || pendingChip) && (
                <div className="flex flex-col gap-1 rounded border bg-surface-secondary p-2 text-xs">
                    {chipTranscript.map((message) => (
                        <div key={message.id}>
                            <span className="font-medium">{message.role === 'human' ? 'You' : 'PostHog AI'}:</span>{' '}
                            {message.text}
                        </div>
                    ))}
                    {pendingChip && (
                        <div className="flex items-center gap-1 text-secondary">
                            <Spinner className="text-sm" /> PostHog AI is making the change
                        </div>
                    )}
                </div>
            )}
            <div className="flex items-center justify-between gap-2">
                {isFinish ? (
                    <>
                        <LemonButton size="small" onClick={walkthrough.skip}>
                            {hasDraft ? 'Later' : 'Done'}
                        </LemonButton>
                        {hasDraft ? (
                            <LemonButton size="small" type="primary" onClick={walkthrough.skip}>
                                Publish
                            </LemonButton>
                        ) : (
                            <LemonButton size="small" type="primary" to={urls.workflow(workflowId, 'metrics')}>
                                Open metrics
                            </LemonButton>
                        )}
                    </>
                ) : (
                    <>
                        <LemonButton size="small" onClick={walkthrough.skip}>
                            Skip
                        </LemonButton>
                        <div className="flex gap-1">
                            <LemonButton size="small" type="secondary" onClick={walkthrough.back} disabled={isFirst}>
                                Back
                            </LemonButton>
                            <LemonButton size="small" type="primary" onClick={walkthrough.next}>
                                Next
                            </LemonButton>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
