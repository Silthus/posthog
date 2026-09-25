// PROTOTYPE (throwaway): the simple color picker for a tag, one swatch per palette color.
import clsx from 'clsx'

import { IconCheck } from '@posthog/icons'

import { TAG_COLORS, TAG_COLOR_NAMES, TagColor } from './combinedStore'

export function TagColorSwatches({
    value,
    onChange,
}: {
    value: TagColor
    onChange: (color: TagColor) => void
}): JSX.Element {
    return (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Tag color">
            {TAG_COLOR_NAMES.map((color) => (
                <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={color === value}
                    aria-label={color}
                    title={color}
                    className={clsx(
                        'size-5 rounded-full flex items-center justify-center text-white cursor-pointer',
                        color === value ? 'ring-2 ring-offset-1 ring-primary' : 'hover:scale-110'
                    )}
                    style={{ backgroundColor: `var(--${TAG_COLORS[color]})` }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onChange(color)}
                    data-attr="workflows-combined-tag-color"
                >
                    {color === value && <IconCheck className="size-3" />}
                </button>
            ))}
        </div>
    )
}
