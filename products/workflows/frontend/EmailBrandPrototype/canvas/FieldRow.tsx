import { useEffect, useRef } from 'react'

// PROTOTYPE (throwaway): one brand value in the review panel: editor, where it came from, and any conflict.
import { LemonButton, LemonInput, LemonSelect } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { ColorField } from '../shared/ColorField'
import { SourceTag } from '../shared/SourceTag'
import { BRAND_FIELD_LABELS, BrandFieldKey, BrandSimulation, FieldConflict, FONT_OPTIONS } from '../simulation'
import { LogoPicker } from './LogoPicker'

export interface FocusRequest {
    key: BrandFieldKey
    nonce: number
}

interface FieldRowProps {
    sim: BrandSimulation
    fieldKey: BrandFieldKey
    highlighted: boolean
    focusRequest: FocusRequest | null
    onHover: (key: BrandFieldKey | null) => void
}

const MISSING_HINT: Record<BrandFieldKey, string> = {
    name: 'Not in your repo. Type it in.',
    logo: 'Not in your repo. Upload one, or send without a logo.',
    primaryColor: 'Not in your repo. Keep this default or pick your own.',
    accentColor: 'Not in your repo. Keep this default or pick your own.',
    textColor: 'Not in your repo. Keep this default or pick your own.',
    backgroundColor: 'Not in your repo. Keep this default or pick your own.',
    fontFamily: 'Not in your repo. Keep this default or pick your own.',
}

const COLOR_KEYS = ['primaryColor', 'accentColor', 'textColor', 'backgroundColor'] as const
type ColorKey = (typeof COLOR_KEYS)[number]
const isColorKey = (key: BrandFieldKey): key is ColorKey => (COLOR_KEYS as readonly BrandFieldKey[]).includes(key)

export function FieldRow({ sim, fieldKey, highlighted, focusRequest, onHover }: FieldRowProps): JSX.Element {
    const rowRef = useRef<HTMLDivElement>(null)
    const { state, derived } = sim
    const missing = derived.missingFields.includes(fieldKey)
    const conflict = state.conflicts.find((c) => c.key === fieldKey)

    useEffect(() => {
        if (focusRequest?.key !== fieldKey || !rowRef.current) {
            return
        }
        rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        rowRef.current.querySelector<HTMLElement>('input:not([type="color"]), button')?.focus({ preventScroll: true })
    }, [focusRequest, fieldKey])

    return (
        <div
            ref={rowRef}
            onMouseEnter={() => onHover(fieldKey)}
            onMouseLeave={() => onHover(null)}
            className={cn(
                'flex flex-col gap-1.5 rounded-lg border px-2.5 py-2 transition-colors scroll-m-3',
                highlighted
                    ? 'border-accent bg-accent-highlight-secondary'
                    : missing || conflict
                      ? 'border-dashed border-warning'
                      : 'border-transparent'
            )}
            data-attr={`email-brand-canvas-field-${fieldKey}`}
        >
            {isColorKey(fieldKey) ? (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex flex-col items-start gap-0.5">
                        <span className="text-sm font-semibold">{BRAND_FIELD_LABELS[fieldKey]}</span>
                        <SourceTag source={state.sources[fieldKey]} edited={state.edited.includes(fieldKey)} />
                    </div>
                    <FieldEditor sim={sim} fieldKey={fieldKey} />
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{BRAND_FIELD_LABELS[fieldKey]}</span>
                        <SourceTag source={state.sources[fieldKey]} edited={state.edited.includes(fieldKey)} />
                    </div>
                    <FieldEditor sim={sim} fieldKey={fieldKey} />
                </>
            )}
            {missing && <div className="text-xs text-secondary">{MISSING_HINT[fieldKey]}</div>}
            {conflict && <ConflictChoice sim={sim} conflict={conflict} />}
        </div>
    )
}

function FieldEditor({ sim, fieldKey }: { sim: BrandSimulation; fieldKey: BrandFieldKey }): JSX.Element {
    const { brand } = sim.state
    if (fieldKey === 'logo') {
        return <LogoPicker sim={sim} />
    }
    if (fieldKey === 'name') {
        return (
            <LemonInput
                size="small"
                value={brand.name}
                placeholder="Acme"
                onChange={(name) => sim.actions.setField('name', name)}
            />
        )
    }
    if (fieldKey === 'fontFamily') {
        return (
            <LemonSelect
                size="small"
                fullWidth
                value={brand.fontFamily}
                onChange={(font) => sim.actions.setField('fontFamily', font)}
                options={FONT_OPTIONS.map((font) => ({
                    value: font,
                    label: <span style={{ fontFamily: font }}>{font.split(',')[0]}</span>,
                }))}
            />
        )
    }
    if (isColorKey(fieldKey)) {
        return <ColorField value={brand[fieldKey]} onChange={(color) => sim.actions.setField(fieldKey, color)} />
    }
    return <></>
}

function ConflictChoice({ sim, conflict }: { sim: BrandSimulation; conflict: FieldConflict }): JSX.Element {
    return (
        <div className="flex flex-col gap-1.5 rounded bg-warning-highlight p-2 text-xs">
            <div className="flex items-center gap-1 flex-wrap">
                Detected <DetectedValue conflict={conflict} /> in{' '}
                <span className="font-mono">{conflict.file.split('/').pop()}</span>
            </div>
            <div className="flex gap-1">
                <LemonButton
                    size="xsmall"
                    type="secondary"
                    onClick={() => sim.actions.resolveConflict(conflict.key, 'keep')}
                >
                    Keep mine
                </LemonButton>
                <LemonButton
                    size="xsmall"
                    type="secondary"
                    onClick={() => sim.actions.resolveConflict(conflict.key, 'detected')}
                >
                    Use detected
                </LemonButton>
            </div>
        </div>
    )
}

function DetectedValue({ conflict }: { conflict: FieldConflict }): JSX.Element {
    const { detected } = conflict
    if (detected === null) {
        return <strong>no logo</strong>
    }
    if (typeof detected !== 'string') {
        return <strong>{detected.label}</strong>
    }
    if (isColorKey(conflict.key)) {
        return (
            <span className="flex items-center gap-1 font-mono font-semibold">
                <span className="w-3 h-3 rounded-full border" style={{ background: detected }} />
                {detected}
            </span>
        )
    }
    return <strong>{conflict.key === 'fontFamily' ? detected.split(',')[0] : detected}</strong>
}
