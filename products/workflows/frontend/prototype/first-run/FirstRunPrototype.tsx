// PROTOTYPE ONLY (silthus/posthog#212): three first-run variants for Workflows on a simulated backend,
// switchable via `?variant=`. Runs in Storybook; never wire it into a real route.
import { useState } from 'react'

import { PrototypeBackendProvider } from './prototypeBackend'
import { PrototypeSwitcher, VariantMeta } from './PrototypeSwitcher'
import { PrototypeFrame } from './shared/PrototypeFrame'
import { VariantA } from './VariantA'
import { VariantB } from './VariantB'
import { VariantC } from './VariantC'

const VARIANTS: VariantMeta[] = [
    { key: 'A', name: 'Send yourself one first', oneLiner: 'Composer first, setup after the first delivery' },
    { key: 'B', name: 'Setup checklist', oneLiner: 'Five rows in sending order, canvas never shown' },
    { key: 'C', name: 'Recipes from your data', oneLiner: 'Gallery graded by readiness, canvas plus blockers' },
]

function readVariantFromUrl(): string {
    const requested = new URLSearchParams(window.location.search).get('variant')?.toUpperCase()
    return VARIANTS.some((v) => v.key === requested) ? (requested as string) : 'A'
}

function writeVariantToUrl(key: string): void {
    const url = new URL(window.location.href)
    url.searchParams.set('variant', key)
    window.history.replaceState(null, '', url.toString())
}

export function FirstRunPrototype(): JSX.Element {
    const [variantKey, setVariantKey] = useState(readVariantFromUrl)
    const current = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0]

    const change = (key: string): void => {
        writeVariantToUrl(key)
        setVariantKey(key)
    }

    return (
        <PrototypeBackendProvider>
            <PrototypeFrame>
                {current.key === 'A' && <VariantA key="A" />}
                {current.key === 'B' && <VariantB key="B" />}
                {current.key === 'C' && <VariantC key="C" />}
            </PrototypeFrame>
            <PrototypeSwitcher variants={VARIANTS} current={current} onChange={change} />
        </PrototypeBackendProvider>
    )
}
