import { useEffect, useRef } from 'react'

import { IconArrowRight, IconSparkles, IconX } from '@posthog/icons'
import { LemonButton, Spinner } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { WalkthroughMessage, WalkthroughState } from './useWalkthrough'
import { finishCopy } from './walkthroughStops'

interface PostHogAiLeadsPanelProps {
    walkthrough: WalkthroughState
    chipsEnabled: boolean
}

function Bubble({ message }: { message: WalkthroughMessage }): JSX.Element {
    const human = message.role === 'human'
    return (
        <div className={`flex w-full flex-col ${human ? 'items-end' : 'items-start'}`}>
            <div
                className={`rounded-lg border bg-surface-primary px-3 py-2 text-sm ${human ? 'max-w-4/5 font-medium' : 'max-w-full'}`}
            >
                {message.text}
            </div>
        </div>
    )
}

export function PostHogAiLeadsPanel({ walkthrough, chipsEnabled }: PostHogAiLeadsPanelProps): JSX.Element {
    const { stop, stops, index, active, isFirst, hasDraft, workflowId, messages, pendingChip, appliedChips } =
        walkthrough
    const threadRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
    }, [messages, pendingChip, active])

    const isFinish = stop?.kind === 'finish'
    const nextStop = stops[index + 1]
    const nextLabel = nextStop ? (nextStop.kind === 'finish' ? 'Finish' : `Next: ${nextStop.title}`) : 'Finish'
    const applied = stop ? (appliedChips[stop.id] ?? []) : []

    return (
        <aside className="flex h-full w-[512px] shrink-0 flex-col border-l bg-surface-secondary">
            <header className="flex h-[50px] shrink-0 items-center gap-2 border-b px-3">
                <IconSparkles className="size-4 text-ai" />
                <span className="font-medium">PostHog AI</span>
                {active && (
                    <span className="ml-auto text-xs text-secondary">
                        Walkthrough, stop {index + 1} of {stops.length}
                    </span>
                )}
                <LemonButton
                    size="small"
                    icon={<IconX />}
                    onClick={walkthrough.skip}
                    tooltip="Close"
                    aria-label="Close"
                    className={active ? '' : 'ml-auto'}
                />
            </header>
            <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                {messages.map((message) => (
                    <Bubble key={message.id} message={message} />
                ))}
                {pendingChip && (
                    <div className="flex items-center gap-2 text-sm text-secondary">
                        <Spinner className="text-base" /> Making the change
                    </div>
                )}
                {active && stop && !pendingChip && (
                    <div className="ml-1 flex flex-col gap-2">
                        {chipsEnabled && stop.chips.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {stop.chips.map((chip) => (
                                    <LemonButton
                                        key={chip.label}
                                        size="small"
                                        type="secondary"
                                        icon={<IconSparkles className="text-ai" />}
                                        disabledReason={applied.includes(chip.label) ? 'Already applied' : undefined}
                                        onClick={() => walkthrough.applyChip(chip)}
                                    >
                                        {chip.label}
                                    </LemonButton>
                                ))}
                            </div>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {isFinish ? (
                                <>
                                    {hasDraft ? (
                                        <LemonButton size="small" type="primary" onClick={walkthrough.skip}>
                                            Publish
                                        </LemonButton>
                                    ) : (
                                        <LemonButton
                                            size="small"
                                            type="primary"
                                            to={urls.workflow(workflowId, 'metrics')}
                                        >
                                            Open metrics
                                        </LemonButton>
                                    )}
                                    <LemonButton size="small" type="tertiary" onClick={walkthrough.skip}>
                                        {hasDraft ? 'Later' : 'Done'}
                                    </LemonButton>
                                </>
                            ) : (
                                <>
                                    <LemonButton size="small" type="primary" onClick={walkthrough.next}>
                                        {nextLabel}
                                    </LemonButton>
                                    <LemonButton
                                        size="small"
                                        type="secondary"
                                        onClick={walkthrough.back}
                                        disabled={isFirst}
                                    >
                                        Back
                                    </LemonButton>
                                    <LemonButton size="small" type="tertiary" onClick={walkthrough.skip}>
                                        Skip walkthrough
                                    </LemonButton>
                                </>
                            )}
                        </div>
                    </div>
                )}
                {!active && (
                    <div className="ml-1 flex flex-col gap-2">
                        <div className="text-sm text-secondary">
                            {hasDraft
                                ? finishCopy(true).body
                                : 'Ask me anything about this workflow, or start the walkthrough again.'}
                        </div>
                        <div>
                            <LemonButton size="small" type="secondary" onClick={walkthrough.start}>
                                Start the walkthrough again
                            </LemonButton>
                        </div>
                    </div>
                )}
            </div>
            <footer className="border-t p-3">
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-surface-primary px-3 py-2 text-sm text-secondary">
                    <span>Ask PostHog AI about this workflow</span>
                    <IconArrowRight className="size-4" />
                </div>
            </footer>
        </aside>
    )
}
