// PROTOTYPE (throwaway): a row's colored tags. Clicking a tag filters by it, hovering shows an × that removes it.
// An Edit button shows while the pointer is over the row and swaps the cell for the inline tag editor.
import clsx from 'clsx'
import { useActions, useValues } from 'kea'

import { IconPencil } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { combinedVariantLogic } from './combinedVariantLogic'
import { InlineTagEditor, orderTags } from './InlineTagEditor'
import { TagPill } from './TagPill'

const MAX_VISIBLE_TAGS = { compact: 2, comfortable: 4 }

export function RowTagsCell({ itemId }: { itemId: string }): JSX.Element {
    const { store, colors, compact, editingRowKey } = useValues(combinedVariantLogic)
    const { setEditingRowKey, setItemTags } = useActions(combinedVariantLogic)
    const { addFilter } = useActions(workflowsPrototypeLogic)
    const tags = store?.tags[itemId] ?? []

    if (editingRowKey === itemId) {
        return <InlineTagEditor itemId={itemId} tags={tags} />
    }

    const ordered = orderTags(tags)
    const maxVisible = compact ? MAX_VISIBLE_TAGS.compact : MAX_VISIBLE_TAGS.comfortable
    const visible = ordered.slice(0, maxVisible)
    const hidden = ordered.length - visible.length

    return (
        <div
            className={clsx(
                'relative flex items-center gap-1 w-full min-w-20 min-h-6',
                compact ? 'flex-nowrap' : 'flex-wrap min-w-44 max-w-72'
            )}
        >
            {visible.map((tag) => (
                <TagPill
                    key={tag}
                    tag={tag}
                    color={colors[tag]}
                    size={compact ? 'xsmall' : 'small'}
                    onClick={() => addFilter({ facet: 'tag', value: tag, negated: false })}
                    onRemove={() =>
                        setItemTags(
                            itemId,
                            tags.filter((existing) => existing !== tag)
                        )
                    }
                    title={`Show only items tagged ${tag}`}
                />
            ))}
            {hidden > 0 && (
                <span className="text-xs text-secondary whitespace-nowrap" title={ordered.slice(maxVisible).join(', ')}>
                    +{hidden}
                </span>
            )}
            {store && (
                <LemonButton
                    size="xsmall"
                    type="tertiary"
                    icon={<IconPencil />}
                    tooltip={tags.length ? 'Edit tags' : 'Add tags'}
                    onClick={() => setEditingRowKey(itemId)}
                    // Floats over the end of the cell, so the column never reserves room for a button that only shows on hover.
                    className="absolute right-0 top-1/2 -translate-y-1/2 bg-surface-primary opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                    data-attr="workflows-combined-tag-edit"
                >
                    Edit
                </LemonButton>
            )}
        </div>
    )
}
