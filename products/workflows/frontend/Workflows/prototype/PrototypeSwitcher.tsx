import { useEffect } from 'react'

import { IconArrowLeft, IconArrowRight } from '@posthog/icons'
import { LemonButton, LemonSegmentedButton } from '@posthog/lemon-ui'

export type MoveVariant = 'A' | 'B' | 'C'
export type MoveStep = 'entry' | 'preview' | 'save' | 'moved' | 'ai'
export type AiDraftOutcome = 'plain' | 'offer' | 'block'

export const VARIANT_NAMES: Record<MoveVariant, string> = {
    A: 'Banner and confirm dialog',
    B: 'Move rail beside the canvas',
    C: 'Edit to commit, in-canvas',
}

const VARIANTS: MoveVariant[] = ['A', 'B', 'C']

const STEPS: { key: MoveStep; label: string }[] = [
    { key: 'entry', label: '1 Entry points' },
    { key: 'preview', label: '2 Preview' },
    { key: 'save', label: '3 Save' },
    { key: 'moved', label: '4 Moved' },
    { key: 'ai', label: '5 AI draft' },
]

const AI_OUTCOMES: { value: AiDraftOutcome; label: string }[] = [
    { value: 'plain', label: 'Plain new workflow' },
    { value: 'offer', label: 'Offer the move on enable' },
    { value: 'block', label: 'Block enable until disabled' },
]

function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null
    return !!element && (['INPUT', 'TEXTAREA'].includes(element.tagName) || element.isContentEditable)
}

export function PrototypeSwitcher({
    variant,
    step,
    aiOutcome,
    onVariantChange,
    onStepChange,
    onAiOutcomeChange,
}: {
    variant: MoveVariant
    step: MoveStep
    aiOutcome: AiDraftOutcome
    onVariantChange: (variant: MoveVariant) => void
    onStepChange: (step: MoveStep) => void
    onAiOutcomeChange: (outcome: AiDraftOutcome) => void
}): JSX.Element {
    const cycle = (delta: number): void => {
        const index = (VARIANTS.indexOf(variant) + delta + VARIANTS.length) % VARIANTS.length
        onVariantChange(VARIANTS[index])
    }

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (isTypingTarget(event.target)) {
                return
            }
            if (event.key === 'ArrowLeft') {
                cycle(-1)
            } else if (event.key === 'ArrowRight') {
                cycle(1)
            } else if (/^[1-5]$/.test(event.key)) {
                onStepChange(STEPS[Number(event.key) - 1].key)
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    })

    return (
        <div className="fixed bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 flex-col items-center gap-2 rounded-lg border border-accent bg-surface-primary px-3 py-2 shadow-xl">
            <div className="flex items-center gap-2">
                <LemonButton
                    size="small"
                    icon={<IconArrowLeft />}
                    onClick={() => cycle(-1)}
                    tooltip="Previous variant (←)"
                />
                <span className="font-mono text-xs font-semibold">
                    Variant {variant}: {VARIANT_NAMES[variant]}
                </span>
                <LemonButton
                    size="small"
                    icon={<IconArrowRight />}
                    onClick={() => cycle(1)}
                    tooltip="Next variant (→)"
                />
            </div>
            <LemonSegmentedButton
                size="xsmall"
                value={step}
                onChange={(value) => onStepChange(value as MoveStep)}
                options={STEPS.map(({ key, label }) => ({ value: key, label }))}
            />
            {step === 'ai' && (
                <LemonSegmentedButton
                    size="xsmall"
                    value={aiOutcome}
                    onChange={(value) => onAiOutcomeChange(value as AiDraftOutcome)}
                    options={AI_OUTCOMES}
                />
            )}
        </div>
    )
}
