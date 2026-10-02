// PROTOTYPE (throwaway): clickable regions and source chips laid over the email preview.
import { IconWarning } from '@posthog/icons'
import { LemonTag } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { SourceTag } from '../shared/SourceTag'
import { BRAND_FIELD_LABELS, BrandFieldKey, BrandSimulation } from '../simulation'
import { FieldGlyph } from './FieldGlyph'
import { chipPlacement, REGION_STACK, regionPlacement } from './previewModel'

interface PreviewHotspotsProps {
    sim: BrandSimulation
    scale: number
    highlighted: BrandFieldKey | null
    onHover: (key: BrandFieldKey | null) => void
    onSelect: (key: BrandFieldKey) => void
}

export function PreviewHotspots({ sim, scale, highlighted, onHover, onSelect }: PreviewHotspotsProps): JSX.Element {
    const { state, derived } = sim
    return (
        <>
            {REGION_STACK.map((key) => (
                <button
                    key={key}
                    type="button"
                    aria-label={`Edit ${BRAND_FIELD_LABELS[key].toLowerCase()}`}
                    onMouseEnter={() => onHover(key)}
                    onMouseLeave={() => onHover(null)}
                    onClick={() => onSelect(key)}
                    className={cn(
                        'absolute rounded-md cursor-pointer bg-transparent transition-[outline-color] outline-2 outline-offset-2 outline-transparent',
                        highlighted === key && 'outline-dashed outline-accent'
                    )}
                    style={regionPlacement(key, scale)}
                />
            ))}
            {REGION_STACK.map((key) => {
                const conflict = state.conflicts.some((c) => c.key === key)
                const missing = derived.missingFields.includes(key)
                return (
                    <button
                        key={`chip-${key}`}
                        type="button"
                        title={BRAND_FIELD_LABELS[key]}
                        onMouseEnter={() => onHover(key)}
                        onMouseLeave={() => onHover(null)}
                        onClick={() => onSelect(key)}
                        className={cn(
                            'absolute z-10 flex items-center gap-1 rounded-full border bg-surface-primary pl-1.5 pr-0.5 py-0.5 shadow-sm whitespace-nowrap cursor-pointer transition-opacity',
                            highlighted && highlighted !== key ? 'opacity-50' : 'opacity-100',
                            (missing || conflict) && 'border-warning'
                        )}
                        style={chipPlacement(key, scale)}
                    >
                        <FieldGlyph fieldKey={key} brand={state.brand} />
                        {conflict ? (
                            <LemonTag size="small" type="warning" icon={<IconWarning />}>
                                Two values
                            </LemonTag>
                        ) : (
                            <SourceTag source={state.sources[key]} edited={state.edited.includes(key)} />
                        )}
                    </button>
                )
            })}
        </>
    )
}
