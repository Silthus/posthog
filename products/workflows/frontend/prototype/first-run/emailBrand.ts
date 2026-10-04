// PROTOTYPE ONLY (silthus/posthog#212). The Email brand as the in-flight detector (silthus/posthog#198) will
// hand it over: values read from the team's GitHub repo, each with the file it came from, and how they apply
// to an Unlayer design.
import { TEAM_BRAND } from './firstRunScenario'

export type BrandField = 'name' | 'logo' | 'primary' | 'accent' | 'text' | 'background' | 'font'

export interface BrandFont {
    label: string
    value: string
    url: string
}

export interface LogoOption {
    key: string
    label: string
    url: string
    width: number
    height: number
}

export interface EmailBrand {
    name: string
    logo: LogoOption | null
    primary: string
    accent: string
    text: string
    background: string
    font: BrandFont
}

export const BRAND_REPO = 'example/web-app'
export const REPO_REASONS = 'Matches your project name, pushed 2 days ago, a Next.js app'

export const FILES_READ = [
    'package.json',
    'app/layout.tsx',
    'tailwind.config.ts',
    'app/globals.css',
    'public/logo.svg',
    'public/icon-192.png',
]

export const FIELD_SOURCES: Record<BrandField, { file: string; line?: number; detail: string }> = {
    name: { file: 'app/layout.tsx', line: 12, detail: "metadata.title: 'Example'" },
    logo: { file: 'public/logo.svg', detail: 'Logo file at the site root' },
    primary: { file: 'tailwind.config.ts', line: 14, detail: "colors.primary: '#6d28d9'" },
    accent: { file: 'tailwind.config.ts', line: 15, detail: "colors.accent: '#f59e0b'" },
    text: { file: 'app/globals.css', line: 8, detail: '--foreground: #18181b' },
    background: { file: 'app/globals.css', line: 7, detail: '--background: #ffffff' },
    font: { file: 'app/layout.tsx', line: 3, detail: 'Montserrat from next/font/google' },
}

function svgDataUrl(svg: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const LOGO_OPTIONS: LogoOption[] = [
    {
        key: 'wordmark',
        label: 'public/logo.svg',
        width: 600,
        height: 120,
        url: svgDataUrl(
            `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120" viewBox="0 0 600 120"><polygon points="40,92 80,24 120,92" fill="#6d28d9"/><text x="140" y="86" font-family="Montserrat,Arial,sans-serif" font-size="60" font-weight="700" fill="#18181b">${TEAM_BRAND.name}</text></svg>`
        ),
    },
    {
        key: 'icon',
        label: 'public/icon-192.png',
        width: 120,
        height: 120,
        url: svgDataUrl(
            `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#6d28d9"/><polygon points="30,88 60,32 90,88" fill="#ffffff"/></svg>`
        ),
    },
]

export const FONT_OPTIONS: BrandFont[] = [
    {
        label: 'Montserrat',
        value: "'Montserrat',sans-serif",
        url: 'https://fonts.googleapis.com/css?family=Montserrat:400,700',
    },
    {
        label: 'Open Sans',
        value: "'Open Sans',sans-serif",
        url: 'https://fonts.googleapis.com/css?family=Open+Sans:400,700',
    },
    { label: 'Lato', value: "'Lato',sans-serif", url: 'https://fonts.googleapis.com/css?family=Lato:400,700' },
    { label: 'Arial', value: 'arial,helvetica,sans-serif', url: '' },
    { label: 'Georgia', value: 'georgia,palatino', url: '' },
]

export const DETECTED_BRAND: EmailBrand = {
    name: TEAM_BRAND.name,
    logo: LOGO_OPTIONS[0],
    primary: '#6d28d9',
    accent: '#f59e0b',
    text: '#18181b',
    background: '#ffffff',
    font: FONT_OPTIONS[0],
}

const POSTHOG_BUTTON_COLORS = ['#f1a82c', '#c1841a']
const HEADER_ROW_ID = 'brand-header'

type Design = Record<string, any>

function forEachContent(design: Design, visit: (content: Design) => void): void {
    for (const row of design.body?.rows ?? []) {
        for (const column of row.columns ?? []) {
            for (const content of column.contents ?? []) {
                visit(content)
            }
        }
    }
}

function logoSrc(logo: LogoOption): Design {
    const maxWidth = logo.width > 200 ? '40%' : '15%'
    return { url: logo.url, width: logo.width, height: logo.height, autoWidth: false, maxWidth }
}

function headerRow(logo: LogoOption): Design {
    return {
        id: HEADER_ROW_ID,
        cells: [1],
        columns: [
            {
                id: `${HEADER_ROW_ID}-column`,
                contents: [
                    {
                        id: `${HEADER_ROW_ID}-logo`,
                        type: 'image',
                        values: {
                            src: logoSrc(logo),
                            textAlign: 'left',
                            containerPadding: '24px 24px 8px',
                            autoWidth: false,
                            maxWidth: logo.width > 200 ? '40%' : '15%',
                            altText: `${TEAM_BRAND.name} logo`,
                            _meta: { htmlID: 'u_content_image_brand', htmlClassNames: 'u_content_image' },
                        },
                    },
                ],
                values: { _meta: { htmlID: 'u_column_brand', htmlClassNames: 'u_column' } },
            },
        ],
        values: { _meta: { htmlID: 'u_row_brand', htmlClassNames: 'u_row' } },
    }
}

function fontValue(brand: EmailBrand): Design {
    return { label: brand.font.label, value: brand.font.value, url: brand.font.url, defaultFont: false }
}

function setBodyStyle(design: Design, brand: EmailBrand): void {
    design.body.values = {
        ...design.body.values,
        textColor: brand.text,
        backgroundColor: brand.background,
        fontFamily: fontValue(brand),
    }
    forEachContent(design, (content) => {
        if (['heading', 'text', 'button'].includes(content.type) && content.values?.fontFamily) {
            content.values.fontFamily = fontValue(brand)
        }
        if (content.type === 'heading') {
            content.values.color = brand.text
        }
    })
}

function sizeLogo(content: Design, logo: LogoOption): void {
    content.values = {
        ...content.values,
        src: logoSrc(logo),
        autoWidth: false,
        maxWidth: logo.width > 200 ? '40%' : '15%',
        textAlign: 'center',
    }
}

function placeLogo(design: Design, logo: LogoOption | null): void {
    let replacedBanner = false
    forEachContent(design, (content) => {
        const url: string = content.type === 'image' ? (content.values?.src?.url ?? '') : ''
        if (url.includes('email-banner')) {
            replacedBanner = true
            if (logo) {
                sizeLogo(content, logo)
            } else {
                content.values.src = { url: '', width: 0, height: 0 }
            }
        }
    })
    design.body.rows = design.body.rows.filter((row: Design) => row.id !== HEADER_ROW_ID)
    if (!replacedBanner && logo) {
        design.body.rows.unshift(headerRow(logo))
    }
}

export function applyBrand(templateDesign: Design, brand: EmailBrand): Design {
    const design: Design = JSON.parse(
        POSTHOG_BUTTON_COLORS.reduce(
            (json, color) => json.replace(new RegExp(color, 'gi'), brand.primary),
            JSON.stringify(templateDesign)
        )
    )
    forEachContent(design, (content) => {
        if (content.type === 'button') {
            content.values.buttonColors = {
                ...content.values.buttonColors,
                color: '#FFFFFF',
                backgroundColor: brand.primary,
                hoverColor: '#FFFFFF',
                hoverBackgroundColor: brand.accent,
            }
        }
    })
    setBodyStyle(design, brand)
    placeLogo(design, brand.logo)
    return design
}

export function rebrand(currentDesign: Design, from: EmailBrand, to: EmailBrand): Design {
    const swaps: [string, string][] = [
        [from.primary, to.primary],
        [from.accent, to.accent],
    ]
    const json = swaps.reduce(
        (result, [old, next]) =>
            old.toLowerCase() === next.toLowerCase() ? result : result.replace(new RegExp(old, 'gi'), next),
        JSON.stringify(currentDesign)
    )
    const design: Design = JSON.parse(json)
    setBodyStyle(design, to)
    if (from.logo?.key !== to.logo?.key) {
        forEachContent(design, (content) => {
            if (content.type === 'image' && from.logo && content.values?.src?.url === from.logo.url) {
                if (to.logo) {
                    sizeLogo(content, to.logo)
                } else {
                    content.values.src = { url: '', width: 0, height: 0 }
                }
            }
        })
        if (!from.logo && to.logo) {
            placeLogo(design, to.logo)
        }
    }
    return design
}
