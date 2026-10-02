import { buildStarterEmailHtml } from '../shared/brandEmail'
// PROTOTYPE (throwaway): where each brand value shows up in the starter email, and how much of it to color in.
import { BRAND_FIELD_ORDER, BrandFieldKey, BrandState, BrandValues } from '../simulation'

export const EMAIL_WIDTH = 680
export const EMAIL_HEIGHT = 660

export type PreviewMode = 'muted' | 'progressive' | 'final'

type ChipAnchor = 'top-right' | 'right' | 'top-left' | 'bottom-right'

interface PreviewRegion {
    x: number
    y: number
    w: number
    h: number
    anchor: ChipAnchor
}

export const PREVIEW_REGIONS: Record<BrandFieldKey, PreviewRegion> = {
    backgroundColor: { x: 40, y: 32, w: 600, h: 558, anchor: 'bottom-right' },
    accentColor: { x: 40, y: 26, w: 600, h: 18, anchor: 'top-left' },
    textColor: { x: 72, y: 186, w: 536, h: 112, anchor: 'top-right' },
    fontFamily: { x: 72, y: 392, w: 536, h: 86, anchor: 'bottom-right' },
    name: { x: 72, y: 130, w: 536, h: 50, anchor: 'top-right' },
    logo: { x: 72, y: 58, w: 240, h: 56, anchor: 'right' },
    primaryColor: { x: 72, y: 312, w: 160, h: 62, anchor: 'right' },
}

export const REGION_STACK = Object.keys(PREVIEW_REGIONS) as BrandFieldKey[]

export interface Placement {
    left: number
    top: number
    width: number
    height: number
}

export function regionPlacement(key: BrandFieldKey, scale: number): Placement {
    const { x, y, w, h } = PREVIEW_REGIONS[key]
    return { left: x * scale, top: y * scale, width: w * scale, height: h * scale }
}

export function chipPlacement(key: BrandFieldKey, scale: number): { left: number; top: number; transform: string } {
    const { x, y, w, h, anchor } = PREVIEW_REGIONS[key]
    switch (anchor) {
        case 'top-right':
            return { left: (x + w) * scale - 4, top: y * scale, transform: 'translate(-100%, -50%)' }
        case 'right':
            return { left: (x + w) * scale + 6, top: (y + h / 2) * scale, transform: 'translate(0, -50%)' }
        case 'top-left':
            return { left: x * scale + 8, top: (y + h / 2) * scale, transform: 'translate(0, -50%)' }
        case 'bottom-right':
            return { left: (x + w) * scale - 8, top: (y + h) * scale - 8, transform: 'translate(-100%, -100%)' }
    }
}

const MUTED_COLORS = {
    primaryColor: '#9CA3AF',
    accentColor: '#D1D5DB',
    textColor: '#6B7280',
    backgroundColor: '#F3F4F6',
}

export function knownFields(state: BrandState): BrandFieldKey[] {
    return BRAND_FIELD_ORDER.filter((key) => state.sources[key] || state.edited.includes(key))
}

export function previewModeFor(state: BrandState): PreviewMode {
    if (state.phase === 'review' || state.phase === 'creating') {
        return 'final'
    }
    return knownFields(state).length ? 'progressive' : 'muted'
}

function progressiveBrand(state: BrandState): BrandValues {
    const known = new Set(knownFields(state))
    const pick = <K extends keyof typeof MUTED_COLORS>(key: K): string =>
        known.has(key) ? state.brand[key] : MUTED_COLORS[key]
    return {
        name: known.has('name') ? state.brand.name : '',
        logo: known.has('logo') ? state.brand.logo : null,
        primaryColor: pick('primaryColor'),
        accentColor: pick('accentColor'),
        textColor: pick('textColor'),
        backgroundColor: pick('backgroundColor'),
        fontFamily: state.brand.fontFamily,
    }
}

export function previewHtml(state: BrandState, mode: PreviewMode): string {
    if (mode === 'muted') {
        return buildStarterEmailHtml(state.brand, { muted: true })
    }
    return buildStarterEmailHtml(mode === 'progressive' ? progressiveBrand(state) : state.brand)
}

export function fieldValueLabel(key: BrandFieldKey, brand: BrandValues): string {
    if (key === 'logo') {
        return brand.logo?.label ?? 'No logo'
    }
    if (key === 'fontFamily') {
        return brand.fontFamily.split(',')[0]
    }
    return brand[key] || 'Empty'
}
