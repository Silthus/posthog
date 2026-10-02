// PROTOTYPE (throwaway): the editable Email brand fields on the review screen, each with where its value came from.
import { IconUpload, IconX } from '@posthog/icons'
import { LemonButton, LemonInput, LemonSelect } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { ColorField } from '../shared/ColorField'
import { logoDataUrl, PrototypeLogo } from '../shared/logos'
import { SourceTag } from '../shared/SourceTag'
import { BRAND_FIELD_LABELS, BrandFieldKey, BrandSimulation, FieldConflict, FONT_OPTIONS } from '../simulation'

const COLOR_KEYS = ['primaryColor', 'accentColor', 'textColor', 'backgroundColor'] as const

const isDarkLogo = (logo: PrototypeLogo): boolean => logo.detail.includes('dark')

function LogoTile({ logo, className }: { logo: PrototypeLogo; className?: string }): JSX.Element {
    return (
        <span
            className={cn(
                'flex items-center justify-center rounded p-2',
                isDarkLogo(logo) ? 'bg-[#111827]' : 'bg-white',
                className
            )}
        >
            <img src={logoDataUrl(logo)} alt={logo.label} className="max-h-full max-w-full object-contain" />
        </span>
    )
}

function ConflictValue({ conflict }: { conflict: FieldConflict }): JSX.Element {
    if (conflict.detected && typeof conflict.detected === 'object') {
        return <span className="font-mono">{conflict.detected.label}</span>
    }
    if (typeof conflict.detected === 'string' && conflict.detected.startsWith('#')) {
        return (
            <span className="inline-flex items-center gap-1 font-mono">
                <span className="w-3 h-3 rounded-sm border inline-block" style={{ background: conflict.detected }} />
                {conflict.detected}
            </span>
        )
    }
    return <span className="font-semibold">{conflict.detected ?? 'no logo'}</span>
}

function ConflictRow({ sim, conflict }: { sim: BrandSimulation; conflict: FieldConflict }): JSX.Element {
    return (
        <div
            className="rounded border border-warning bg-warning-highlight px-2.5 py-2 flex flex-wrap items-center gap-2 text-xs"
            data-attr="email-brand-steps-conflict"
        >
            <span className="grow">
                Detected <ConflictValue conflict={conflict} /> in{' '}
                <span className="font-mono">{conflict.file.split('/').pop()}</span>
            </span>
            <span className="flex gap-1">
                <LemonButton
                    size="xsmall"
                    type="secondary"
                    onClick={() => sim.actions.resolveConflict(conflict.key, 'keep')}
                >
                    Keep mine
                </LemonButton>
                <LemonButton
                    size="xsmall"
                    type="primary"
                    onClick={() => sim.actions.resolveConflict(conflict.key, 'detected')}
                >
                    Use detected
                </LemonButton>
            </span>
        </div>
    )
}

function FieldRow({
    sim,
    field,
    children,
}: {
    sim: BrandSimulation
    field: BrandFieldKey
    children: React.ReactNode
}): JSX.Element {
    const missing = sim.derived.detectedAnything && sim.derived.missingFields.includes(field)
    const conflict = sim.state.conflicts.find((c) => c.key === field)
    return (
        <div
            className={cn('flex flex-col gap-1.5', missing && 'border-l-2 border-warning pl-3')}
            data-attr={`email-brand-steps-field-${field}`}
        >
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-semibold">{BRAND_FIELD_LABELS[field]}</span>
                <SourceTag source={sim.state.sources[field]} edited={sim.state.edited.includes(field)} />
            </div>
            {children}
            {conflict && <ConflictRow sim={sim} conflict={conflict} />}
        </div>
    )
}

function LogoField({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { logo } = sim.state.brand
    const { logoCandidates } = sim.derived
    return (
        <FieldRow sim={sim} field="logo">
            <div className="flex flex-col gap-2">
                {logo ? (
                    <LogoTile logo={logo} className="h-16 border" />
                ) : (
                    <span className="h-16 rounded border border-dashed flex items-center justify-center text-sm text-secondary">
                        No logo, the email shows your brand name instead
                    </span>
                )}
                <div className="flex flex-wrap gap-1.5">
                    {logoCandidates.map((candidate) => (
                        <button
                            key={candidate.id}
                            type="button"
                            onClick={() => sim.actions.swapLogo(candidate)}
                            title={`${candidate.file} (${candidate.detail})`}
                            aria-pressed={logo?.id === candidate.id}
                            className={cn(
                                'rounded border-2 cursor-pointer',
                                logo?.id === candidate.id ? 'border-accent' : 'border-transparent hover:border-primary'
                            )}
                        >
                            <LogoTile logo={candidate} className="h-9 w-20" />
                        </button>
                    ))}
                    <LemonButton size="small" type="secondary" icon={<IconUpload />} onClick={sim.actions.uploadLogo}>
                        Upload a file
                    </LemonButton>
                    {logo && (
                        <LemonButton
                            size="small"
                            type="tertiary"
                            icon={<IconX />}
                            onClick={() => sim.actions.swapLogo(null)}
                        >
                            No logo
                        </LemonButton>
                    )}
                </div>
            </div>
        </FieldRow>
    )
}

export function BrandFields({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { brand } = sim.state
    const { setField } = sim.actions
    return (
        <div className="flex flex-col gap-5">
            <FieldRow sim={sim} field="name">
                <LemonInput
                    value={brand.name}
                    onChange={(value) => setField('name', value)}
                    placeholder="Acme"
                    size="large"
                />
            </FieldRow>
            <LogoField sim={sim} />
            <div className="grid grid-cols-1 @md:grid-cols-2 gap-5">
                {COLOR_KEYS.map((key) => (
                    <FieldRow key={key} sim={sim} field={key}>
                        <ColorField value={brand[key]} onChange={(value) => setField(key, value)} size="medium" />
                    </FieldRow>
                ))}
            </div>
            <FieldRow sim={sim} field="fontFamily">
                <LemonSelect
                    fullWidth
                    value={brand.fontFamily}
                    onChange={(value) => setField('fontFamily', value)}
                    options={FONT_OPTIONS.map((font) => ({
                        value: font,
                        label: <span style={{ fontFamily: font }}>{font.split(',')[0]}</span>,
                    }))}
                />
            </FieldRow>
        </div>
    )
}
