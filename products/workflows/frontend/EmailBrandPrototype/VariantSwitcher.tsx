// PROTOTYPE (throwaway): floating bar to flip between click-through variants and scenarios.
// Deliberately not part of the design under review: warning-bordered pill, fixed bottom-centre.
import { useEffect } from 'react'

import { IconArrowLeft, IconArrowRight, IconRefresh } from '@posthog/icons'
import { LemonButton, LemonSelect } from '@posthog/lemon-ui'

import { BrandScenario, SCENARIO_LABELS, SpeedKey } from './simulation'
import { ClickThroughVariant } from './variants'

interface VariantSwitcherProps {
    variants: ClickThroughVariant[]
    current: ClickThroughVariant
    onVariantChange: (key: string) => void
    scenario: BrandScenario
    onScenarioChange: (scenario: BrandScenario) => void
    onReset: () => void
}

const isTypingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)

function knob<K extends keyof typeof SCENARIO_LABELS>(
    key: K
): Array<{ value: keyof (typeof SCENARIO_LABELS)[K]; label: string }> {
    return (Object.keys(SCENARIO_LABELS[key]) as Array<keyof (typeof SCENARIO_LABELS)[K]>).map((value) => ({
        value,
        label: SCENARIO_LABELS[key][value] as string,
    }))
}

export function VariantSwitcher({
    variants,
    current,
    onVariantChange,
    scenario,
    onScenarioChange,
    onReset,
}: VariantSwitcherProps): JSX.Element {
    const index = variants.findIndex((variant) => variant.key === current.key)
    const cycle = (delta: number): void =>
        onVariantChange(variants[(index + delta + variants.length) % variants.length].key)

    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (isTypingTarget(event.target)) {
                return
            }
            if (event.key === 'ArrowLeft') {
                cycle(-1)
            } else if (event.key === 'ArrowRight') {
                cycle(1)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    })

    return (
        <div
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1200] flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-2xl bg-surface-primary shadow-xl border-2 border-warning max-w-[calc(100vw-2rem)]"
            data-attr="email-brand-variant-switcher"
        >
            <div className="flex items-center gap-2">
                <LemonButton
                    size="small"
                    type="secondary"
                    icon={<IconArrowLeft />}
                    onClick={() => cycle(-1)}
                    tooltip="Previous variant (←)"
                />
                <div className="flex flex-col items-center leading-tight min-w-36">
                    <span className="font-semibold text-sm">
                        {String.fromCharCode(65 + index)} · {current.label}
                    </span>
                    <span className="text-[11px] text-secondary">{current.description}</span>
                </div>
                <LemonButton
                    size="small"
                    type="secondary"
                    icon={<IconArrowRight />}
                    onClick={() => cycle(1)}
                    tooltip="Next variant (→)"
                />
            </div>
            <span className="w-px h-6 bg-border-primary mx-1" />
            <div className="flex flex-wrap items-center gap-1">
                <LemonSelect
                    size="xsmall"
                    value={scenario.entry}
                    onChange={(entry) => onScenarioChange({ ...scenario, entry })}
                    options={knob('entry')}
                />
                <LemonSelect
                    size="xsmall"
                    value={scenario.github}
                    onChange={(github) => onScenarioChange({ ...scenario, github })}
                    options={knob('github')}
                />
                <LemonSelect
                    size="xsmall"
                    value={scenario.repos}
                    onChange={(repos) => onScenarioChange({ ...scenario, repos })}
                    options={knob('repos')}
                />
                <LemonSelect
                    size="xsmall"
                    value={scenario.outcome}
                    onChange={(outcome) => onScenarioChange({ ...scenario, outcome })}
                    options={knob('outcome')}
                />
                <LemonSelect
                    size="xsmall"
                    value={scenario.redetect}
                    onChange={(redetect) => onScenarioChange({ ...scenario, redetect })}
                    options={knob('redetect')}
                />
                <LemonSelect<SpeedKey>
                    size="xsmall"
                    value={scenario.speed}
                    onChange={(speed) => onScenarioChange({ ...scenario, speed })}
                    options={[
                        { value: 1, label: 'Real-ish timing' },
                        { value: 4, label: 'Fast forward' },
                    ]}
                />
            </div>
            <LemonButton size="xsmall" icon={<IconRefresh />} onClick={onReset} tooltip="Start over">
                Reset
            </LemonButton>
        </div>
    )
}
