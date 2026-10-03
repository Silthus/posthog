// PROTOTYPE ONLY (silthus/posthog#212). The homepage variants the floating bar switches between.
export type HomeVariant = 'A' | 'B' | 'C' | 'D' | 'E'

export interface HomeVariantMeta {
    key: HomeVariant
    name: string
    oneLiner: string
}

export const HOME_VARIANTS: HomeVariantMeta[] = [
    { key: 'A', name: 'Pitch and preview', oneLiner: 'Round 2: why, your data, the email, one button' },
    { key: 'B', name: 'Your recent signups', oneLiner: 'Real people who signed up and heard nothing' },
    { key: 'C', name: 'One button', oneLiner: 'Nothing but "email it to me", the inbox is the pitch' },
    { key: 'D', name: "A new user's first week", oneLiner: 'Today versus with a welcome sequence' },
    { key: 'E', name: 'PostHog AI drafted it', oneLiner: 'A short chat: what it found, the draft, send it' },
]

const requested = new URLSearchParams(window.location.search).get('variant')?.toUpperCase()

export const VARIANT_FROM_URL: HomeVariant | null = HOME_VARIANTS.some((variant) => variant.key === requested)
    ? (requested as HomeVariant)
    : null
