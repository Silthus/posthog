// PROTOTYPE (throwaway): a row's colored tags. The add control only shows while the pointer is over the cell,
// so untagged rows stay quiet. Only the row being edited mounts a picker.
import clsx from 'clsx'
import { useActions, useValues } from 'kea'

import { IconPlus } from '@posthog/icons'
import { LemonButton, Popover } from '@posthog/lemon-ui'

import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { combinedVariantLogic } from './combinedVariantLogic'
import { TagPicker } from './TagPicker'
import { TagPill } from './TagPill'

const MAX_VISIBLE_TAGS = { compact: 2, comfortable: 4 }

export function RowTagsCell({ itemId, editable }: { itemId: string; editable: boolean }): JSX.Element {
    const { store, colors, compact, editingRowKey } = useValues(combinedVariantLogic)
    const { setEditingRowKey, setWorkflowTags } = useActions(combinedVariantLogic)
    const { addFilter } = useActions(workflowsPrototypeLogic)
    const tags = store?.tags[itemId] ?? []
    const editing = editingRowKey === itemId

    const maxVisible = compact ? MAX_VISIBLE_TAGS.compact : MAX_VISIBLE_TAGS.comfortable
    const visible = tags.slice(0, maxVisible)
    const hidden = tags.length - visible.length

    return (
        <div
            className={clsx(
                'group/tags flex items-center gap-1 w-full min-h-6',
                compact ? 'flex-nowrap min-w-32' : 'flex-wrap min-w-44 max-w-72'
            )}
        >
            {visible.map((tag) => (
                <TagPill
                    key={tag}
                    tag={tag}
                    color={colors[tag]}
                    size={compact ? 'xsmall' : 'small'}
                    onClick={() => addFilter({ facet: 'tag', value: tag, negated: false })}
                    title={`Show only items tagged ${tag}`}
                />
            ))}
            {hidden > 0 && (
                <span className="text-xs text-secondary whitespace-nowrap" title={tags.slice(maxVisible).join(', ')}>
                    +{hidden}
                </span>
            )}
            {editable && store && (
                <Popover
                    visible={editing}
                    onClickOutside={() => setEditingRowKey(null)}
                    placement="bottom-start"
                    overlay={
                        <TagPicker
                            title="Tags on this workflow"
                            selected={tags}
                            onToggle={(tag, checked) =>
                                setWorkflowTags(itemId, checked ? [...tags, tag] : tags.filter((t) => t !== tag))
                            }
                        />
                    }
                >
                    <LemonButton
                        size="xsmall"
                        type="tertiary"
                        icon={<IconPlus />}
                        tooltip={tags.length ? 'Edit tags' : 'Add tags'}
                        onClick={() => setEditingRowKey(editing ? null : itemId)}
                        className={clsx(!editing && 'opacity-0 group-hover/tags:opacity-100 focus-visible:opacity-100')}
                        data-attr="workflows-combined-tag-add"
                    />
                </Popover>
            )}
        </div>
    )
}
