// PROTOTYPE (throwaway): actions for the selected rows: tag, untag and move.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconFolderMove, IconPlus, IconX } from '@posthog/icons'
import { LemonButton, Popover } from '@posthog/lemon-ui'

import { combinedVariantLogic } from './combinedVariantLogic'
import { TagPicker } from './TagPicker'
import { TagPill } from './TagPill'

export function BulkBar(): JSX.Element | null {
    const { selectedIds, selectedTagCounts, colors, saving, store, rowsById } = useValues(combinedVariantLogic)
    const { addTagsToSelection, removeTagsFromSelection, clearSelection, moveRows } = useActions(combinedVariantLogic)
    const [addOpen, setAddOpen] = useState(false)
    const [removeOpen, setRemoveOpen] = useState(false)

    if (!selectedIds.length) {
        return null
    }
    const workflowIds = selectedIds.filter((id) => rowsById[id]?.kind === 'workflow')
    const presentTags = Object.entries(selectedTagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

    return (
        <div
            className="flex flex-wrap items-center gap-2 px-2 py-1 mb-2 rounded border bg-surface-secondary"
            data-attr="workflows-combined-bulk-bar"
        >
            <span className="font-semibold" translate="no">
                {selectedIds.length === 1 ? '1 item selected' : `${selectedIds.length} items selected`}
            </span>
            <Popover
                visible={addOpen}
                onClickOutside={() => setAddOpen(false)}
                placement="bottom-start"
                overlay={
                    <TagPicker
                        title={`Add to ${workflowIds.length === 1 ? '1 selected workflow' : `${workflowIds.length} selected workflows`}`}
                        selected={[]}
                        onToggle={(tag, checked) => checked && addTagsToSelection(workflowIds, [tag])}
                    />
                }
            >
                <LemonButton
                    size="small"
                    type="secondary"
                    icon={<IconPlus />}
                    onClick={() => setAddOpen(!addOpen)}
                    disabledReason={
                        !store
                            ? 'Tags are still loading'
                            : !workflowIds.length
                              ? 'Only workflows can carry tags for now'
                              : undefined
                    }
                    data-attr="workflows-combined-bulk-add-tags"
                >
                    Add tags
                </LemonButton>
            </Popover>
            <Popover
                visible={removeOpen}
                onClickOutside={() => setRemoveOpen(false)}
                placement="bottom-start"
                overlay={
                    <div className="flex flex-col gap-1 p-2 w-64">
                        <span className="text-secondary text-xs">Remove a tag from every selected workflow</span>
                        {presentTags.map(([tag, count]) => (
                            <LemonButton
                                key={tag}
                                size="small"
                                fullWidth
                                sideIcon={<span className="text-secondary text-xs">{count}</span>}
                                onClick={() => removeTagsFromSelection(workflowIds, [tag])}
                                data-attr="workflows-combined-bulk-remove-tag"
                            >
                                <TagPill tag={tag} color={colors[tag]} size="xsmall" />
                            </LemonButton>
                        ))}
                    </div>
                }
            >
                <LemonButton
                    size="small"
                    type="secondary"
                    icon={<IconX />}
                    disabledReason={presentTags.length ? undefined : 'The selected items have no tags'}
                    onClick={() => setRemoveOpen(!removeOpen)}
                    data-attr="workflows-combined-bulk-remove-tags"
                >
                    Remove tags
                </LemonButton>
            </Popover>
            <LemonButton
                size="small"
                type="secondary"
                icon={<IconFolderMove />}
                onClick={() => moveRows(selectedIds)}
                data-attr="workflows-combined-bulk-move"
            >
                Move to…
            </LemonButton>
            <LemonButton
                size="small"
                type="tertiary"
                onClick={clearSelection}
                data-attr="workflows-combined-bulk-clear"
            >
                Clear selection
            </LemonButton>
            {saving && <span className="text-secondary text-xs">Saving…</span>}
        </div>
    )
}
