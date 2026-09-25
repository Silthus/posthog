// PROTOTYPE (throwaway): a row's colored tags. The cell has three targets: a pill filters by its tag, the × on a
// hovered pill removes it, and a click anywhere else in the cell (the empty space too) opens the inline tag editor.
import { useActions, useValues } from 'kea'

import { IconPencil } from '@posthog/icons'

import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { combinedVariantLogic } from './combinedVariantLogic'
import { InlineTagEditor, orderTags } from './InlineTagEditor'
import { TagPill } from './TagPill'

const MAX_VISIBLE_TAGS = 2

export function RowTagsCell({ itemId }: { itemId: string }): JSX.Element {
    const { store, colors, editingRowKey } = useValues(combinedVariantLogic)
    const { setEditingRowKey, setItemTags } = useActions(combinedVariantLogic)
    const { addFilter } = useActions(workflowsPrototypeLogic)
    const tags = store?.tags[itemId] ?? []

    if (editingRowKey === itemId) {
        return <InlineTagEditor itemId={itemId} tags={tags} />
    }

    const ordered = orderTags(tags)
    const visible = ordered.slice(0, MAX_VISIBLE_TAGS)
    const hidden = ordered.length - visible.length
    const edit = (): void => {
        if (store) {
            setEditingRowKey(itemId)
        }
    }

    return (
        <div
            role="button"
            tabIndex={store ? 0 : -1}
            aria-label={tags.length ? 'Edit tags' : 'Add tags'}
            title={store ? (tags.length ? 'Click to edit tags' : 'Click to add tags') : undefined}
            className="relative flex flex-nowrap items-center gap-1 w-full min-w-20 min-h-7 -my-1 py-1 rounded cursor-pointer"
            onClick={edit}
            onKeyDown={(event) => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault()
                    edit()
                }
            }}
            data-attr="workflows-combined-tag-area"
        >
            {visible.map((tag) => (
                <TagPill
                    key={tag}
                    tag={tag}
                    color={colors[tag]}
                    size="xsmall"
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
                <span
                    className="text-xs text-secondary whitespace-nowrap"
                    title={ordered.slice(MAX_VISIBLE_TAGS).join(', ')}
                >
                    +{hidden}
                </span>
            )}
            {store && (
                // Floats over the cell's end, so the column never reserves room for a hint that only shows on hover.
                <span
                    className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-secondary bg-surface-primary border opacity-0 group-hover/row:opacity-100 pointer-events-none"
                    aria-hidden
                    data-attr="workflows-combined-tag-edit"
                >
                    <IconPencil />
                    {tags.length ? 'Edit' : 'Add tags'}
                </span>
            )}
        </div>
    )
}
