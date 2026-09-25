// PROTOTYPE (throwaway): a tag in its color, GitHub label style. Tint and text mix the color with the theme's
// surface and text colors, so a pill stays readable in light and dark mode. With `onRemove`, hovering the pill
// shows an × that removes it, and the rest of the pill keeps its click.
import clsx from 'clsx'

import { IconX } from '@posthog/icons'

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
    onRemove,
    title,
    size = 'small',
}: {
    tag: string
    color: TagColor
    onClick?: () => void
    onRemove?: () => void
    title?: string
    size?: 'xsmall' | 'small'
}): JSX.Element {
    const group = tagGroup(tag)
    const content = (
        <span className="truncate">
            {group && <span className="opacity-70">{group}/</span>}
            {group ? tag.slice(group.length + 1) : tag}
        </span>
    )
    const className = clsx(
        'group/pill inline-flex items-center border rounded-full font-medium whitespace-nowrap leading-none',
        size === 'xsmall' ? 'text-[0.6875rem] px-1.5 py-0.5 max-w-32' : 'text-xs px-2 py-1 max-w-48'
    )
    return (
        <span className={className} style={tagColorStyle(color)} data-attr="workflows-combined-tag-pill">
            {onClick ? (
                <button
                    type="button"
                    className="min-w-0 cursor-pointer hover:underline"
                    onClick={onClick}
                    title={title}
                >
                    {content}
                </button>
            ) : (
                <span className="min-w-0" title={title}>
                    {content}
                </span>
            )}
            {onRemove && (
                <button
                    type="button"
                    aria-label={`Remove ${tag}`}
                    title={`Remove ${tag}`}
                    className="hidden group-hover/pill:inline-flex focus-visible:inline-flex items-center -mr-0.5 ml-0.5 rounded-full cursor-pointer hover:bg-fill-button-tertiary-hover"
                    onClick={(event) => {
                        event.stopPropagation()
                        onRemove()
                    }}
                    data-attr="workflows-combined-tag-remove"
                >
                    <IconX className="size-3" />
                </button>
            )}
        </span>
    )
}
