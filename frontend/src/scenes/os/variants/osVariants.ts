import { removeProjectIdIfPresent } from 'lib/utils/kea-router'
import { urls } from 'scenes/urls'

// PROTOTYPE: design variants of the OS shell, picked on `/os?variant=`. Delete the losers once one is chosen.

// pinned: `?variant=` values are shared as links, so renaming one breaks them
export type OsVariantKey = 'a' | 'b' | 'c' | 'd'

export interface OsVariantOption {
    key: OsVariantKey
    label: string
    description: string
}

export const OS_VARIANTS: OsVariantOption[] = [
    { key: 'a', label: 'posthog.com', description: 'Menu bar and desktop icon columns, no dock' },
    { key: 'b', label: 'Mac', description: 'Menu bar and a dock with running apps' },
    { key: 'c', label: 'Launcher', description: 'App grid as home, full-size windows, Cmd+K' },
    { key: 'd', label: 'Tiling', description: 'Sidebar of apps and windows, windows tile' },
]

export const DEFAULT_OS_VARIANT: OsVariantKey = 'a'

// pinned: sessionStorage key, holds the variant this tab picked on `/os`
export const OS_VARIANT_STORAGE_KEY = 'posthog-os-variant'

export function isOsVariantKey(value: unknown): value is OsVariantKey {
    return OS_VARIANTS.some(({ key }) => key === value)
}

export function isOsDesktopPath(pathname: string): boolean {
    return removeProjectIdIfPresent(pathname) === urls.os()
}

export interface OsVariantChoice {
    variant: OsVariantKey
    /** True when this tab went through `/os`, so it shows the switcher. */
    exploring: boolean
}

/**
 * Only `/os` picks a variant. A tab that picked one keeps it while the address bar follows its windows and
 * across reloads, so the choice survives until the tab closes or the user leaves the preview. Every other
 * tab renders the default.
 */
export function resolveOsVariant(pathname: string, search: string, stored: string | null): OsVariantChoice {
    const requested = new URLSearchParams(search).get('variant')?.toLowerCase()
    if (isOsDesktopPath(pathname)) {
        const variant = isOsVariantKey(requested) ? requested : isOsVariantKey(stored) ? stored : DEFAULT_OS_VARIANT
        return { variant, exploring: true }
    }
    return isOsVariantKey(stored)
        ? { variant: stored, exploring: true }
        : { variant: DEFAULT_OS_VARIANT, exploring: false }
}

export function cycleOsVariant(current: OsVariantKey, step: 1 | -1): OsVariantKey {
    const index = OS_VARIANTS.findIndex(({ key }) => key === current)
    return OS_VARIANTS[(index + step + OS_VARIANTS.length) % OS_VARIANTS.length].key
}
