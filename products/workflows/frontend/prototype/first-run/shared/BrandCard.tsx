// PROTOTYPE ONLY (silthus/posthog#212). The brand picked up from the team's website, with a way out.
// Stands in for the in-flight Email brand detector.
import { useActions, useValues } from 'kea'

import { LemonSwitch, LemonTag, Spinner } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { TEAM_BRAND } from '../firstRunScenario'

export function BrandCard(): JSX.Element {
    const { brandStatus, brandApplied } = useValues(firstRunPrototypeLogic)
    const { setBrandApplied } = useActions(firstRunPrototypeLogic)

    return (
        <div className="flex flex-col gap-2 rounded border border-primary p-3 bg-surface-primary">
            <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">Your brand</span>
                <LemonTag type="completion" size="small">
                    Email brand, in flight
                </LemonTag>
            </div>
            {brandStatus !== 'found' ? (
                <span className="flex items-center gap-2 text-sm text-secondary">
                    <Spinner /> Looking at {TEAM_BRAND.domain} for your logo and colors
                </span>
            ) : (
                <>
                    <div className="flex items-center gap-3">
                        <div className="h-9 px-3 rounded flex items-center text-white font-bold bg-[#6d28d9]">
                            &#9650; {TEAM_BRAND.name}
                        </div>
                        <div className="flex gap-1">
                            <span className="size-5 rounded-full bg-[#6d28d9]" />
                            <span className="size-5 rounded-full bg-[#ede9fe] border border-primary" />
                            <span className="size-5 rounded-full bg-[#18181b]" />
                        </div>
                    </div>
                    <span className="text-xs text-secondary">Logo, colors and footer from {TEAM_BRAND.domain}</span>
                    <LemonSwitch
                        checked={brandApplied}
                        onChange={setBrandApplied}
                        label="Use my brand in this email"
                        bordered
                        fullWidth
                    />
                </>
            )}
        </div>
    )
}
