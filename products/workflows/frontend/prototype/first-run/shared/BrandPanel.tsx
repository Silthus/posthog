// PROTOTYPE ONLY (silthus/posthog#212). The Email brand, value by value: what was detected, the file it came
// from, and a control to change it. Mirrors the review screen of the in-flight Email brand flow
// (silthus/posthog#201), which owns the full connect and detect steps.
import { useActions, useValues } from 'kea'

import { IconGithub, IconRefresh } from '@posthog/icons'
import { LemonButton, LemonInput, LemonSelect, LemonTag, Spinner, Tooltip } from '@posthog/lemon-ui'

import { LemonColorPicker } from 'lib/lemon-ui/LemonColor/LemonColorPicker'

import {
    BRAND_REPO,
    BrandField,
    FIELD_SOURCES,
    FILES_READ,
    FONT_OPTIONS,
    LOGO_OPTIONS,
    REPO_REASONS,
} from '../emailBrand'
import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'

const COLOR_FIELDS: { field: 'primary' | 'accent' | 'text' | 'background'; label: string }[] = [
    { field: 'primary', label: 'Primary' },
    { field: 'accent', label: 'Accent' },
    { field: 'text', label: 'Text' },
    { field: 'background', label: 'Background' },
]

const COLOR_CHOICES = ['#6d28d9', '#2563eb', '#0f766e', '#dc2626', '#f59e0b', '#18181b', '#ffffff', '#f4f4f5']

export function BrandDetecting(): JSX.Element {
    const { filesRead } = useValues(firstRunPrototypeLogic)
    return (
        <div className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-2">
                <Spinner /> Reading your brand from <code>{BRAND_REPO}</code>
            </span>
            <span className="text-xs text-secondary pl-6">
                {FILES_READ.slice(0, filesRead).join(' · ') || 'Looking for your theme, logo and fonts'}
            </span>
        </div>
    )
}

export function BrandPanel({ compact }: { compact?: boolean }): JSX.Element {
    const { brand, brandStatus } = useValues(firstRunPrototypeLogic)
    const { setBrandValue, detectBrand } = useActions(firstRunPrototypeLogic)

    if (brandStatus !== 'found') {
        return <BrandDetecting />
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm">
                        <IconGithub /> {compact ? 'From' : 'Detected from'} <code>{BRAND_REPO}</code>
                    </span>
                    {!compact && <span className="text-xs text-secondary">{REPO_REASONS}</span>}
                </div>
                {!compact && (
                    <LemonTag type="completion" size="small">
                        Email brand, in flight
                    </LemonTag>
                )}
            </div>
            <BrandRow field="logo" label="Logo">
                <div className="flex gap-2 flex-wrap">
                    {LOGO_OPTIONS.map((logo) => (
                        <button
                            key={logo.key}
                            type="button"
                            onClick={() => setBrandValue('logo', logo)}
                            className={`h-10 px-2 rounded border bg-white flex items-center ${
                                brand.logo?.key === logo.key ? 'border-2 border-accent' : 'border-primary'
                            }`}
                        >
                            <img src={logo.url} alt={logo.label} className="h-6" />
                        </button>
                    ))}
                    <LemonButton
                        size="small"
                        type={brand.logo ? 'secondary' : 'primary'}
                        onClick={() => setBrandValue('logo', null)}
                    >
                        No logo
                    </LemonButton>
                    {!compact && (
                        <LemonButton
                            size="small"
                            type="secondary"
                            disabledReason="Upload is part of the Email brand flow"
                        >
                            Upload
                        </LemonButton>
                    )}
                </div>
            </BrandRow>
            {!compact && (
                <BrandRow field="name" label="Name">
                    <LemonInput size="small" value={brand.name} onChange={(name) => setBrandValue('name', name)} />
                </BrandRow>
            )}
            <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-4'}`}>
                {COLOR_FIELDS.map(({ field, label }) => (
                    <BrandRow key={field} field={field} label={label}>
                        <LemonColorPicker
                            colors={COLOR_CHOICES}
                            selectedColor={brand[field]}
                            onSelectColor={(color) => setBrandValue(field, color)}
                            showCustomColor
                        />
                    </BrandRow>
                ))}
            </div>
            <BrandRow field="font" label="Font">
                <LemonSelect
                    size="small"
                    value={brand.font.label}
                    onChange={(label) =>
                        setBrandValue('font', FONT_OPTIONS.find((font) => font.label === label) ?? brand.font)
                    }
                    options={FONT_OPTIONS.map((font) => ({ value: font.label, label: font.label }))}
                />
            </BrandRow>
            <div className="flex items-center gap-2 flex-wrap">
                <LemonButton size="small" type="secondary" icon={<IconRefresh />} onClick={detectBrand}>
                    Detect again
                </LemonButton>
                {!compact && (
                    <LemonButton
                        size="small"
                        type="tertiary"
                        disabledReason="Picking another repo is part of the Email brand flow"
                    >
                        Use another repo
                    </LemonButton>
                )}
            </div>
        </div>
    )
}

function BrandRow({
    field,
    label,
    children,
}: {
    field: BrandField
    label: string
    children: React.ReactNode
}): JSX.Element {
    const { editedFields } = useValues(firstRunPrototypeLogic)
    const { revertToDetected } = useActions(firstRunPrototypeLogic)
    const source = FIELD_SOURCES[field]
    const edited = editedFields.includes(field)

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold">{label}</span>
                {edited ? (
                    <span className="flex items-center gap-1">
                        <LemonTag type="highlight" size="small">
                            Edited by you
                        </LemonTag>
                        <LemonButton size="xsmall" type="tertiary" onClick={() => revertToDetected(field)}>
                            Use detected
                        </LemonButton>
                    </span>
                ) : (
                    <Tooltip title={`${source.file}${source.line ? `, line ${source.line}` : ''}: ${source.detail}`}>
                        <span className="text-secondary truncate">{source.file}</span>
                    </Tooltip>
                )}
            </div>
            {children}
        </div>
    )
}
