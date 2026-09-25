// PROTOTYPE (throwaway): bulk tagging for the selected workflows.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconPlus, IconX } from '@posthog/icons'
import { LemonButton, LemonInputSelect, LemonTag } from '@posthog/lemon-ui'

import { Popover } from 'lib/lemon-ui/Popover'
import { colorForString } from 'lib/utils/colors'

import { workflowsTagsVariantLogic } from './workflowsTagsVariantLogic'

export function BulkTagBar(): JSX.Element | null {
    const { selectedIds, vocabulary, selectedTagCounts, saving, store } = useValues(workflowsTagsVariantLogic)
    const { addTagsToSelection, removeTagsFromSelection, clearSelection } = useActions(workflowsTagsVariantLogic)
    const [addOpen, setAddOpen] = useState(false)
    const [removeOpen, setRemoveOpen] = useState(false)
    const [pending, setPending] = useState<string[]>([])

    if (!selectedIds.length || !store) {
        return null
    }
    const presentTags = Object.entries(selectedTagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

    return (
        <div
            className="flex flex-wrap items-center gap-2 px-2 py-1 mb-2 rounded border bg-surface-secondary"
            data-attr="workflows-tags-bulk-bar"
        >
            <span className="font-semibold" translate="no">
                {selectedIds.length === 1 ? '1 workflow selected' : `${selectedIds.length} workflows selected`}
            </span>
            <Popover
                visible={addOpen}
                onClickOutside={() => setAddOpen(false)}
                placement="bottom-start"
                overlay={
                    <div className="flex flex-col gap-2 p-2 w-80">
                        {/* The apply button sits above the input, so the open tag list never covers it. */}
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-secondary text-xs">Add to every selected workflow</span>
                            <LemonButton
                                type="primary"
                                size="xsmall"
                                disabledReason={pending.length ? undefined : 'Pick at least one tag'}
                                onClick={() => {
                                    addTagsToSelection(selectedIds, pending)
                                    setPending([])
                                    setAddOpen(false)
                                }}
                                data-attr="workflows-tags-bulk-add-apply"
                            >
                                Apply
                            </LemonButton>
                        </div>
                        <LemonInputSelect
                            mode="multiple"
                            allowCustomValues
                            value={pending}
                            options={vocabulary.map((tag) => ({ key: tag, label: tag }))}
                            onChange={setPending}
                            placeholder="Pick or type tags"
                            data-attr="workflows-tags-bulk-add-input"
                        />
                    </div>
                }
            >
                <LemonButton
                    size="small"
                    type="secondary"
                    icon={<IconPlus />}
                    onClick={() => setAddOpen(!addOpen)}
                    data-attr="workflows-tags-bulk-add"
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
                                onClick={() => removeTagsFromSelection(selectedIds, [tag])}
                                data-attr="workflows-tags-bulk-remove-tag"
                            >
                                <LemonTag size="small" type={colorForString(tag)}>
                                    {tag}
                                </LemonTag>
                            </LemonButton>
                        ))}
                    </div>
                }
            >
                <LemonButton
                    size="small"
                    type="secondary"
                    icon={<IconX />}
                    disabledReason={presentTags.length ? undefined : 'The selected workflows have no tags'}
                    onClick={() => setRemoveOpen(!removeOpen)}
                    data-attr="workflows-tags-bulk-remove"
                >
                    Remove tags
                </LemonButton>
            </Popover>
            <LemonButton size="small" type="tertiary" onClick={clearSelection} data-attr="workflows-tags-bulk-clear">
                Clear selection
            </LemonButton>
            {saving && <span className="text-secondary text-xs">Saving…</span>}
        </div>
    )
}
