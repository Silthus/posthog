// PROTOTYPE ONLY: floating bar to flip variants, turn scenario knobs and watch the simulated state.
import { forwardRef, useEffect, useState } from 'react'

import { IconChevronLeft, IconChevronRight } from '@posthog/icons'
import { LemonSegmentedButton, LemonSwitch } from '@posthog/lemon-ui'

import { EmailCoverage, EventCoverage, useBackend } from './prototypeBackend'

export interface VariantMeta {
    key: string
    name: string
    oneLiner: string
}

export function PrototypeSwitcher({
    variants,
    current,
    onChange,
}: {
    variants: VariantMeta[]
    current: VariantMeta
    onChange: (key: string) => void
}): JSX.Element {
    const [knobsOpen, setKnobsOpen] = useState(false)
    const [stateOpen, setStateOpen] = useState(false)
    const backend = useBackend()

    const index = variants.findIndex((v) => v.key === current.key)
    const step = (delta: number): void => onChange(variants[(index + delta + variants.length) % variants.length].key)

    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            const target = event.target as HTMLElement | null
            if (target && (target.closest('input, textarea, [contenteditable]') || target.isContentEditable)) {
                return
            }
            if (event.key === 'ArrowLeft') {
                step(-1)
            } else if (event.key === 'ArrowRight') {
                step(1)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    })

    return (
        <>
            {knobsOpen && (
                <div className="fixed left-1/2 -translate-x-1/2 bottom-20 z-[1000] rounded border border-primary bg-surface-primary shadow-xl">
                    <ScenarioKnobs />
                </div>
            )}
            {stateOpen && (
                <pre className="fixed right-4 bottom-20 z-[1000] max-h-[60vh] w-96 overflow-auto rounded bg-zinc-900 text-zinc-100 text-xs p-3 shadow-xl m-0">
                    {JSON.stringify(
                        {
                            variant: current.key,
                            minute: backend.state.minute,
                            sender: backend.sender,
                            senderLabel: backend.senderLabel,
                            people: { total: backend.peopleTotal, withEmail: backend.peopleWithEmail },
                            projectEvents: backend.projectEvents,
                            scenario: backend.scenario,
                            created: backend.state.created,
                            sentLog: backend.state.sentLog,
                        },
                        null,
                        2
                    )}
                </pre>
            )}
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1 rounded-full bg-zinc-900 text-zinc-100 pl-1 pr-2 py-1 shadow-xl text-sm">
                <button
                    className="size-8 rounded-full hover:bg-zinc-700 flex items-center justify-center"
                    onClick={() => step(-1)}
                    aria-label="Previous variant"
                >
                    <IconChevronLeft />
                </button>
                <div className="px-2 min-w-72 text-center leading-tight">
                    <div className="font-semibold">
                        {current.key} · {current.name}
                    </div>
                    <div className="text-[11px] text-zinc-400">{current.oneLiner}</div>
                </div>
                <button
                    className="size-8 rounded-full hover:bg-zinc-700 flex items-center justify-center"
                    onClick={() => step(1)}
                    aria-label="Next variant"
                >
                    <IconChevronRight />
                </button>
                <span className="mx-2 h-5 w-px bg-zinc-600" />
                <span className="tabular-nums text-xs text-zinc-300 mr-1 whitespace-nowrap">
                    minute {backend.state.minute} of 10
                </span>
                <PillButton onClick={() => setKnobsOpen((open) => !open)}>Scenario</PillButton>
                <PillButton onClick={() => setStateOpen((open) => !open)}>State</PillButton>
                <PillButton onClick={backend.reset}>Reset</PillButton>
            </div>
        </>
    )
}

const PillButton = forwardRef<HTMLButtonElement, { onClick: () => void; children: string }>(function PillButton(
    { onClick, children },
    ref
): JSX.Element {
    return (
        <button
            ref={ref}
            className="rounded-full border border-zinc-600 px-2.5 py-1 text-xs text-zinc-100 hover:bg-zinc-700 whitespace-nowrap"
            onClick={onClick}
        >
            {children}
        </button>
    )
})

function ScenarioKnobs(): JSX.Element {
    const { scenario, setScenario } = useBackend()
    return (
        <div className="p-3 flex flex-col gap-3 w-96">
            <div className="text-xs font-semibold uppercase text-secondary">Scenario knobs</div>
            <LemonSwitch
                label="DNS verifies the moment the domain is added"
                checked={scenario.domainVerifiesInstantly}
                onChange={(checked) => setScenario({ domainVerifiesInstantly: checked })}
                bordered
                fullWidth
            />
            <div className="flex flex-col gap-1">
                <span className="text-sm">People with an email</span>
                <LemonSegmentedButton<EmailCoverage>
                    size="small"
                    fullWidth
                    value={scenario.emailCoverage}
                    onChange={(value) => setScenario({ emailCoverage: value })}
                    options={[
                        { value: 'all', label: 'All' },
                        { value: 'some', label: 'Most' },
                        { value: 'none', label: 'None' },
                    ]}
                />
            </div>
            <div className="flex flex-col gap-1">
                <span className="text-sm">Events the project sends</span>
                <LemonSegmentedButton<EventCoverage>
                    size="small"
                    fullWidth
                    value={scenario.eventCoverage}
                    onChange={(value) => setScenario({ eventCoverage: value })}
                    options={[
                        { value: 'rich', label: 'Signup, trial…' },
                        { value: 'pageviews-only', label: 'Pageviews only' },
                        { value: 'none', label: 'No SDK yet' },
                    ]}
                />
            </div>
        </div>
    )
}
