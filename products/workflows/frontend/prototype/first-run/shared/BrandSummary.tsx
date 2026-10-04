// PROTOTYPE ONLY (silthus/posthog#212). The detected brand in one line above the gallery, so the team sees
// what PostHog picked up before it shows up in every email.
import { useActions, useValues } from 'kea'

import { IconGithub } from '@posthog/icons'
import { LemonButton, LemonModal } from '@posthog/lemon-ui'

import { BRAND_REPO } from '../emailBrand'
import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { BrandDetecting, BrandPanel } from './BrandPanel'

export function BrandSummary(): JSX.Element {
    const { brand, brandStatus, editedFields, brandModalOpen } = useValues(firstRunPrototypeLogic)
    const { setBrandModalOpen } = useActions(firstRunPrototypeLogic)

    return (
        <div className="flex items-center justify-between gap-4 flex-wrap rounded border border-primary bg-surface-primary px-4 py-3">
            {brandStatus !== 'found' ? (
                <BrandDetecting />
            ) : (
                <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm font-semibold">Your email brand</span>
                    <span className="h-8 px-2 rounded border border-primary bg-white flex items-center">
                        {brand.logo ? (
                            <img src={brand.logo.url} alt="Logo" className="h-5" />
                        ) : (
                            <span className="text-xs text-secondary">No logo</span>
                        )}
                    </span>
                    <span className="flex gap-1">
                        {[brand.primary, brand.accent, brand.text, brand.background].map((color, index) => (
                            <span
                                key={index}
                                className="size-5 rounded-full border border-primary"
                                style={{ backgroundColor: color }}
                            />
                        ))}
                    </span>
                    <span className="text-sm">{brand.font.label}</span>
                    <span className="flex items-center gap-1 text-xs text-secondary">
                        <IconGithub /> from {BRAND_REPO}
                        {editedFields.length > 0 && `, ${editedFields.length} edited by you`}
                    </span>
                </div>
            )}
            <LemonButton
                size="small"
                type="secondary"
                onClick={() => setBrandModalOpen(true)}
                disabledReason={brandStatus !== 'found' ? 'Still reading your repo' : undefined}
            >
                Review brand
            </LemonButton>
            <LemonModal
                isOpen={brandModalOpen}
                onClose={() => setBrandModalOpen(false)}
                title="Your email brand"
                description="Every email starts in these. Change anything that is off, and the emails follow."
                width={760}
            >
                <BrandPanel />
            </LemonModal>
        </div>
    )
}
