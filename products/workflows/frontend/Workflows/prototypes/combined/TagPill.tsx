// PROTOTYPE (throwaway): a tag in its color, GitHub label style. Tint and text mix the color with the theme's
// surface and text colors, so a pill stays readable in light and dark mode.
import clsx from 'clsx'

import { TAG_COLORS, TagColor, tagGroup } from './combinedStore'

export function tagColorStyle(color: TagColor): React.CSSProperties {
    const token = `var(--${TAG_COLORS[color]})`
    return {
        backgroundColor: `color-mix(in srgb, ${token} 16%, var(--color-bg-surface-primary))`,
        borderColor: `color-mix(in srgb, ${token} 55%, transparent)`,
        color: `color-mix(in srgb, ${token} 62%, var(--color-text-primary))`,
    }
}

export function TagPill({
    tag,
    color,
    onClick,
    title,
    size = 'small',
}: {
    tag: string
    color: TagColor
    onClick?: () => void
    title?: string
    size?: 'xsmall' | 'small'
}): JSX.Element {
    const group = tagGroup(tag)
    const content = (
        <>
            {group && <span className="opacity-70">{group}/</span>}
            {group ? tag.slice(group.length + 1) : tag}
        </>
    )
    const className = clsx(
        'inline-flex items-center border rounded-full font-medium whitespace-nowrap max-w-48 truncate leading-none',
        size === 'xsmall' ? 'text-[0.6875rem] px-1.5 py-0.5' : 'text-xs px-2 py-1',
        onClick && 'cursor-pointer hover:brightness-95'
    )
    return onClick ? (
        <button type="button" className={className} style={tagColorStyle(color)} onClick={onClick} title={title}>
            {content}
        </button>
    ) : (
        <span className={className} style={tagColorStyle(color)} title={title}>
            {content}
        </span>
    )
}
