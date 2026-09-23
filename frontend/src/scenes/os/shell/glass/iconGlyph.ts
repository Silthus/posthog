import { isValidElement, type ReactElement, type ReactNode } from 'react'

import type { GlyphPart } from './GlassIcon'

export interface IconGlyph {
    parts: GlyphPart[]
    viewBox: string
}

const DEFAULT_ICON_VIEWBOX = '0 0 24 24'
// Tags that paint nothing, so a glyph can skip them.
const NON_PAINTING_TAGS = new Set(['defs', 'title', 'desc'])

type ForwardRefIcon = { render: (props: Record<string, unknown>, ref: null) => ReactNode }

// Only `@posthog/icons` components are unwrapped. Their render functions return plain SVG and call no
// hooks, so calling one outside React is safe. Any other component could run hooks.
function posthogIconRender(type: unknown): ForwardRefIcon['render'] | null {
    const render = (type as Partial<ForwardRefIcon> | null)?.render
    return typeof render === 'function' && /^(Icon|BaseIcon)[A-Za-z0-9]*$/.test(render.name) ? render : null
}

function collectParts(node: ReactNode, parts: GlyphPart[], state: { viewBox?: string }): boolean {
    if (node === null || node === undefined || typeof node === 'boolean') {
        return true
    }
    if (Array.isArray(node)) {
        return node.every((child) => collectParts(child, parts, state))
    }
    if (!isValidElement(node)) {
        return false
    }
    const element = node as ReactElement<Record<string, unknown>>
    const { type, props } = element

    if (type === 'path') {
        if (typeof props.d !== 'string') {
            return false
        }
        parts.push({ d: props.d, fillRule: props.fillRule === 'evenodd' ? 'evenodd' : 'nonzero' })
        return true
    }
    if (typeof type === 'string' && NON_PAINTING_TAGS.has(type)) {
        return true
    }
    if (type === 'svg') {
        state.viewBox ??= typeof props.viewBox === 'string' ? props.viewBox : undefined
        return collectParts(props.children as ReactNode, parts, state)
    }
    if (type === 'g') {
        return collectParts(props.children as ReactNode, parts, state)
    }
    const render = posthogIconRender(type)
    if (render) {
        state.viewBox ??= typeof props.viewBox === 'string' ? props.viewBox : undefined
        return collectParts(render(props, null), parts, state)
    }
    // A wrapper such as the product icon color span passes its icon through as children.
    if (typeof type !== 'string' && props.children) {
        return collectParts(props.children as ReactNode, parts, state)
    }
    return false
}

/**
 * The fill paths of an icon element, so the desktop can draw it as a glass glyph.
 * Returns null when the icon draws anything besides paths, so the caller can show it as is.
 */
export function glyphFromIcon(icon: ReactNode): IconGlyph | null {
    const parts: GlyphPart[] = []
    const state: { viewBox?: string } = {}
    if (!collectParts(icon, parts, state) || parts.length === 0) {
        return null
    }
    return { parts, viewBox: state.viewBox ?? DEFAULT_ICON_VIEWBOX }
}
