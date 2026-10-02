// PROTOTYPE (throwaway): brand name and logo, together because the email header falls back to the name.
import { IconUpload, IconX } from '@posthog/icons'
import { LemonButton, LemonInput } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { PrototypeLogo, logoDataUrl } from '../shared/logos'
import { BRAND_FIELD_LABELS, BrandSimulation } from '../simulation'
import { FieldStatus } from './FieldStatus'
import { Section } from './Section'

export function NameLogoSection({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { brand } = sim.state
    return (
        <Section
            title="Name and logo"
            description="The email header shows your logo. With no logo, it shows your brand name."
        >
            <div className="flex flex-col gap-1.5">
                <label htmlFor="email-brand-page-name" className="text-sm font-medium">
                    {BRAND_FIELD_LABELS.name}
                </label>
                <LemonInput
                    id="email-brand-page-name"
                    value={brand.name}
                    onChange={(value) => sim.actions.setField('name', value)}
                    placeholder="Acme"
                    className="max-w-80"
                />
                <FieldStatus
                    sim={sim}
                    field="name"
                    emptyHint="Your company or product name, the way customers say it."
                />
            </div>
            <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{BRAND_FIELD_LABELS.logo}</span>
                <LogoPreview sim={sim} />
                <LogoChoices sim={sim} />
                <FieldStatus sim={sim} field="logo" emptyHint="Detect it from GitHub, or upload an SVG or PNG." />
            </div>
        </Section>
    )
}

function LogoPreview({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { brand } = sim.state
    return (
        <div className="flex items-center gap-3 flex-wrap">
            <div
                className={cn(
                    'h-16 w-56 max-w-full rounded border flex items-center justify-center px-4',
                    logoBackground(brand.logo)
                )}
            >
                {brand.logo ? (
                    <img src={logoDataUrl(brand.logo)} alt={brand.logo.label} className="max-h-10 max-w-full" />
                ) : (
                    <span
                        className="font-bold text-lg truncate"
                        style={{ color: brand.primaryColor, fontFamily: brand.fontFamily }}
                    >
                        {brand.name || 'Your brand name'}
                    </span>
                )}
            </div>
            <div className="text-xs text-secondary min-w-0">
                {brand.logo ? (
                    <>
                        <div className="font-mono text-primary truncate">{brand.logo.label}</div>
                        <div>{brand.logo.detail}</div>
                    </>
                ) : (
                    'No logo. The email shows the name instead.'
                )}
            </div>
        </div>
    )
}

function LogoChoices({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { brand, detectionRuns, phase } = sim.state
    const showFound = detectionRuns > 0 && phase !== 'detecting' && sim.derived.logoCandidates.length > 0
    return (
        <div className="flex flex-col gap-1.5">
            {showFound && (
                <>
                    <span className="text-xs text-secondary">Found in your repo</span>
                    <div className="flex flex-wrap gap-2">
                        {sim.derived.logoCandidates.map((logo) => (
                            <button
                                key={logo.id}
                                type="button"
                                onClick={() => sim.actions.swapLogo(logo)}
                                aria-pressed={brand.logo?.id === logo.id}
                                title={`${logo.file}, ${logo.detail}`}
                                className={cn(
                                    'h-10 w-28 rounded border flex items-center justify-center px-2 cursor-pointer',
                                    logoBackground(logo),
                                    brand.logo?.id === logo.id && 'ring-2 ring-accent'
                                )}
                            >
                                <img src={logoDataUrl(logo)} alt={logo.label} className="max-h-6 max-w-full" />
                            </button>
                        ))}
                    </div>
                </>
            )}
            <div className="flex flex-wrap gap-2">
                <LemonButton size="small" type="secondary" icon={<IconUpload />} onClick={sim.actions.uploadLogo}>
                    Upload a file
                </LemonButton>
                <LemonButton
                    size="small"
                    type="tertiary"
                    icon={<IconX />}
                    onClick={() => sim.actions.swapLogo(null)}
                    disabledReason={brand.logo ? undefined : 'There is no logo set'}
                >
                    No logo
                </LemonButton>
            </div>
        </div>
    )
}

function logoBackground(logo: PrototypeLogo | null): string {
    return logo?.id === 'logo-dark' ? 'bg-[#111827]' : 'bg-white'
}
