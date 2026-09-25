// PROTOTYPE (throwaway): tag pills on a row, with inline editing. Only the row being edited mounts an input,
// so a list of hundreds of rows stays cheap.
import clsx from 'clsx'
import { useActions, useValues } from 'kea'

import { IconPencil, IconPlus } from '@posthog/icons'
import { LemonButton, LemonInputSelect, LemonTag } from '@posthog/lemon-ui'

import { colorForString } from 'lib/utils/colors'

import type { WorkflowListItem } from '../shared/workflowListItems'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { workflowsTagsVariantLogic } from './workflowsTagsVariantLogic'
import { tagsOfItem } from './workflowTagFacets'

// Compact rows keep every row on one line, so they show fewer pills before the overflow count.
const MAX_VISIBLE_TAGS = { compact: 2, comfortable: 3 }

export function WorkflowTagsCell({ item, rowKey }: { item: WorkflowListItem; rowKey: string }): JSX.Element {
    const { editingRowKey, vocabulary, store, compact } = useValues(workflowsTagsVariantLogic)
    const { setEditingRowKey, setWorkflowTags } = useActions(workflowsTagsVariantLogic)
    const { addFilter } = useActions(workflowsPrototypeLogic)
    // Reading `store` re-renders the cell when its tags change.
    const tags = store ? tagsOfItem(item) : []
    const editable = item.kind === 'workflow'

    if (editable && editingRowKey === rowKey) {
        return (
            <LemonInputSelect
                mode="multiple"
                allowCustomValues
                size="xsmall"
                value={tags}
                options={vocabulary.map((tag) => ({ key: tag, label: tag }))}
                onChange={(next) => setWorkflowTags(item.id, next)}
                onBlur={() => setEditingRowKey(null)}
                placeholder="Pick or type a tag"
                autoFocus
                className="min-w-48"
                data-attr="workflows-tags-inline-input"
            />
        )
    }

    const maxVisible = compact ? MAX_VISIBLE_TAGS.compact : MAX_VISIBLE_TAGS.comfortable
    const visible = tags.slice(0, maxVisible)
    const hidden = tags.length - visible.length

    return (
        <div
            className={clsx(
                'flex items-center gap-0.5 group/tags',
                compact ? 'flex-nowrap whitespace-nowrap' : 'flex-wrap'
            )}
        >
            {visible.map((tag) => (
                <LemonTag
                    key={tag}
                    size="small"
                    type={colorForString(tag)}
                    onClick={() => addFilter({ facet: 'tag', value: tag, negated: false })}
                    title={`Show only workflows tagged ${tag}`}
                >
                    {tag}
                </LemonTag>
            ))}
            {hidden > 0 && (
                <LemonTag size="small" type="muted" title={tags.slice(maxVisible).join(', ')}>
                    +{hidden}
                </LemonTag>
            )}
            {editable && (
                <LemonButton
                    size="xsmall"
                    type="tertiary"
                    icon={tags.length ? <IconPencil /> : <IconPlus />}
                    tooltip={tags.length ? 'Edit tags' : 'Add tags'}
                    onClick={() => setEditingRowKey(rowKey)}
                    className={tags.length ? 'opacity-0 group-hover/tags:opacity-100 focus:opacity-100' : undefined}
                    data-attr="workflows-tags-inline-edit"
                />
            )}
        </div>
    )
}
