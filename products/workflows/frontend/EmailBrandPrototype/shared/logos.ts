// PROTOTYPE (throwaway): invented Acme logos as inline SVG, standing in for files found in the repo.
export interface PrototypeLogo {
    id: string
    file: string | null
    label: string
    detail: string
    svg: string
    width: number
    height: number
}

const wordmark = (fill: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 120" width="480" height="120"><path d="M60 10 L110 110 H88 L78 88 H42 L32 110 H10 Z M60 44 L49 70 H71 Z" fill="${fill}"/><text x="130" y="86" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="76" fill="${fill}" letter-spacing="-2">acme</text></svg>`

const mark = (fill: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" rx="24" fill="${fill}"/><path d="M60 22 L98 98 H80 L72 80 H48 L40 98 H22 Z M60 50 L52 66 H68 Z" fill="#fff"/></svg>`

export const LOGO_CANDIDATES: PrototypeLogo[] = [
    {
        id: 'logo',
        file: 'public/logo.svg',
        label: 'logo.svg',
        detail: '480×120, wordmark',
        svg: wordmark('#1D4ED8'),
        width: 480,
        height: 120,
    },
    {
        id: 'logo-dark',
        file: 'src/assets/logo-dark.svg',
        label: 'logo-dark.svg',
        detail: '480×120, for dark backgrounds',
        svg: wordmark('#FFFFFF'),
        width: 480,
        height: 120,
    },
    {
        id: 'favicon',
        file: 'public/favicon.svg',
        label: 'favicon.svg',
        detail: '120×120, icon only',
        svg: mark('#1D4ED8'),
        width: 120,
        height: 120,
    },
]

export const UPLOADED_LOGO: PrototypeLogo = {
    id: 'uploaded',
    file: null,
    label: 'acme-logo-2026.svg',
    detail: 'Uploaded just now',
    svg: wordmark('#0F172A'),
    width: 480,
    height: 120,
}

export const logoDataUrl = (logo: PrototypeLogo): string => `data:image/svg+xml;utf8,${encodeURIComponent(logo.svg)}`
