import { IconGear } from '@posthog/icons'

import { urls } from 'scenes/urls'

import type { FlatNavProductGroup } from '~/layout/panel-layout/navbar/tabs/flat-nav/flatNavLogic'
import { iconForType } from '~/layout/panel-layout/ProjectTree/defaultTree'

import type { GlyphPart } from './glass/GlassIcon'
import { CHANGELOG_GLYPH, DOCS_GLYPH, HOME_GLYPH } from './glass/glyphs'
import { glyphFromIcon } from './glass/iconGlyph'

export type OsDesktopAppIcon =
    | { kind: 'glyph'; path: string | GlyphPart[]; viewBox?: string; fillRule?: 'nonzero' | 'evenodd' }
    /** An icon drawn with more than paths, so it cannot become glass. */
    | { kind: 'element'; element: JSX.Element }

export interface OsDesktopApp {
    key: string
    label: string
    href: string
    /** Opens in a new browser tab, because the site refuses to load inside a window. */
    external?: boolean
    icon: OsDesktopAppIcon
}

export interface OsDesktopColumns {
    left: OsDesktopApp[]
    right: OsDesktopApp[]
}

function iconFromElement(element: JSX.Element): OsDesktopAppIcon {
    const glyph = glyphFromIcon(element)
    return glyph ? { kind: 'glyph', path: glyph.parts, viewBox: glyph.viewBox } : { kind: 'element', element }
}

/**
 * The desktop mirrors posthog.com: the user's picked tools run down the left edge after home,
 * and the system apps sit on the right edge.
 */
export function osDesktopColumns(productGroups: FlatNavProductGroup[]): OsDesktopColumns {
    const home: OsDesktopApp = {
        key: 'home',
        label: 'Home',
        href: urls.projectHomepage(),
        icon: { kind: 'glyph', path: HOME_GLYPH },
    }
    const tools = productGroups.flatMap(({ items }) =>
        items.map(
            (item): OsDesktopApp => ({
                key: `tool-${item.path}`,
                label: item.label,
                href: item.href,
                icon: iconFromElement(iconForType(item.iconType, item.iconColor)),
            })
        )
    )

    return {
        left: [home, ...tools],
        right: [
            { key: 'settings', label: 'Settings', href: urls.settings(), icon: iconFromElement(<IconGear />) },
            {
                key: 'docs',
                label: 'Docs',
                href: 'https://posthog.com/docs',
                external: true,
                icon: { kind: 'glyph', path: DOCS_GLYPH, fillRule: 'evenodd' },
            },
            {
                key: 'changelog',
                label: 'Changelog',
                href: 'https://posthog.com/changelog',
                external: true,
                icon: { kind: 'glyph', path: CHANGELOG_GLYPH },
            },
        ],
    }
}
