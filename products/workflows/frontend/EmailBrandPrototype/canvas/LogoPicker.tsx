import { useEffect, useState } from 'react'

// PROTOTYPE (throwaway): swap the logo for another file from the repo, an upload, or none.
import { IconUpload, IconX } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { logoDataUrl, PrototypeLogo } from '../shared/logos'
import { BrandSimulation } from '../simulation'

const isDarkLogo = (logo: PrototypeLogo): boolean => logo.id.endsWith('-dark')

export function LogoPicker({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { brand } = sim.state
    const [uploading, setUploading] = useState(false)
    const candidates = sim.derived.logoCandidates
    const options =
        brand.logo && !candidates.some((logo) => logo.id === brand.logo?.id) ? [...candidates, brand.logo] : candidates

    useEffect(() => {
        if (!uploading) {
            return
        }
        const timer = setTimeout(() => {
            sim.actions.uploadLogo()
            setUploading(false)
        }, 700)
        return () => clearTimeout(timer)
    }, [uploading, sim.actions])

    return (
        <div className="flex flex-col gap-2">
            {options.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {options.map((logo) => {
                        const selected = brand.logo?.id === logo.id
                        return (
                            <button
                                key={logo.id}
                                type="button"
                                title={`${logo.label}, ${logo.detail}`}
                                aria-pressed={selected}
                                onClick={() => sim.actions.swapLogo(logo)}
                                className={cn(
                                    'h-10 w-24 rounded border flex items-center justify-center p-1.5 cursor-pointer',
                                    isDarkLogo(logo) ? 'bg-[#1f2937]' : 'bg-white',
                                    selected ? 'ring-2 ring-accent border-accent' : 'hover:border-secondary'
                                )}
                            >
                                <img src={logoDataUrl(logo)} alt={logo.label} className="max-h-full max-w-full" />
                            </button>
                        )
                    })}
                </div>
            )}
            <div className="text-xs text-secondary">
                {brand.logo
                    ? `${brand.logo.label}, ${brand.logo.detail}`
                    : 'No logo. The email shows your brand name instead.'}
            </div>
            <div className="flex flex-wrap gap-1">
                <LemonButton
                    size="xsmall"
                    type="secondary"
                    icon={<IconUpload />}
                    onClick={() => setUploading(true)}
                    loading={uploading}
                >
                    Upload a file
                </LemonButton>
                <LemonButton
                    size="xsmall"
                    type="tertiary"
                    icon={<IconX />}
                    onClick={() => sim.actions.swapLogo(null)}
                    disabledReason={brand.logo ? (uploading ? 'Uploading' : undefined) : 'There is no logo to remove'}
                >
                    No logo
                </LemonButton>
            </div>
        </div>
    )
}
