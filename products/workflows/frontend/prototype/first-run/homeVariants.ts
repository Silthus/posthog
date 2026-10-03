// PROTOTYPE ONLY (silthus/posthog#212). The homepage variants the floating bar switches between.
export type HomeVariant = 'F' | 'G' | 'H' | 'I'

export interface HomeVariantMeta {
    key: HomeVariant
    name: string
    oneLiner: string
}

export const HOME_VARIANTS: HomeVariantMeta[] = [
    { key: 'F', name: 'Example first', oneLiner: 'The best pick is already open, then three steps' },
    { key: 'G', name: 'Tailored gallery', oneLiner: 'Templates picked for your data, a workspace per email' },
    { key: 'H', name: 'PostHog AI walks you through', oneLiner: 'A chat leads, the email stays in view' },
    { key: 'I', name: 'Your brand first', oneLiner: 'Generic versus yours, then pick and send' },
]

const requested = new URLSearchParams(window.location.search).get('variant')?.toUpperCase()

export const VARIANT_FROM_URL: HomeVariant | null = HOME_VARIANTS.some((variant) => variant.key === requested)
    ? (requested as HomeVariant)
    : null
