// PROTOTYPE (throwaway): rename, recolor, merge and delete the project's tags. Renaming onto an existing tag merges
// the two. Colors come from the fixed palette on the theme's data color tokens.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconPencil, IconTrash } from '@posthog/icons'
import { LemonButton, LemonDialog, LemonInput, LemonModal, LemonSelect } from '@posthog/lemon-ui'

import { TAG_COLORS, normalizeTagName } from './combinedStore'
import { combinedVariantLogic } from './combinedVariantLogic'
import { orderTags } from './InlineTagEditor'
import { TagColorSwatches } from './TagColorSwatches'
import { TagPill } from './TagPill'

function TagRow({ tag }: { tag: string }): JSX.Element {
    const { colors, tagUsage, vocabulary } = useValues(combinedVariantLogic)
    const { renameTag, setTagColor, deleteTag } = useActions(combinedVariantLogic)
    const [editing, setEditing] = useState(false)
    const [name, setName] = useState(tag)
    const [recoloring, setRecoloring] = useState(false)
    const usage = tagUsage[tag] ?? 0
    const target = normalizeTagName(name)
    const merges = target !== tag && vocabulary.includes(target)

    const submitRename = (): void => {
        if (target && target !== tag) {
            renameTag(tag, target)
        }
        setEditing(false)
    }

    return (
        <div
            className="flex flex-col gap-1 py-1.5 border-b last:border-b-0"
            data-attr="workflows-combined-manage-tag-row"
        >
            <div className="flex items-center gap-2">
                {editing ? (
                    <LemonInput
                        size="small"
                        autoFocus
                        value={name}
                        onChange={setName}
                        onPressEnter={submitRename}
                        onBlur={submitRename}
                        className="flex-1"
                        data-attr="workflows-combined-manage-tag-name"
                    />
                ) : (
                    <div className="flex-1 min-w-0">
                        <TagPill tag={tag} color={colors[tag]} />
                    </div>
                )}
                <span className="text-xs text-secondary whitespace-nowrap w-16 text-right" translate="no">
                    {usage === 1 ? '1 item' : `${usage} items`}
                </span>
                <LemonButton
                    size="xsmall"
                    icon={<IconPencil />}
                    tooltip="Rename. Use a name that exists to merge."
                    onClick={() => {
                        setName(tag)
                        setEditing(true)
                    }}
                    data-attr="workflows-combined-manage-tag-rename"
                />
                <LemonButton
                    size="xsmall"
                    tooltip="Change color"
                    onClick={() => setRecoloring(!recoloring)}
                    data-attr="workflows-combined-manage-tag-color"
                >
                    <span
                        className="size-3.5 rounded-full block"
                        style={{ backgroundColor: `var(--${TAG_COLORS[colors[tag]]})` }}
                    />
                </LemonButton>
                <LemonSelect
                    size="xsmall"
                    placeholder="Merge into…"
                    value={null}
                    options={vocabulary
                        .filter((other) => other !== tag)
                        .map((other) => ({ value: other, label: other }))}
                    onChange={(other) => {
                        if (other) {
                            LemonDialog.open({
                                title: `Merge ${tag} into ${other}?`,
                                description: `${usage === 1 ? 'The item' : `All ${usage} items`} tagged ${tag} get ${other} instead, and ${tag} goes away.`,
                                primaryButton: { children: 'Merge', onClick: () => renameTag(tag, other) },
                                secondaryButton: { children: 'Cancel' },
                            })
                        }
                    }}
                    data-attr="workflows-combined-manage-tag-merge"
                />
                <LemonButton
                    size="xsmall"
                    status="danger"
                    icon={<IconTrash />}
                    tooltip="Delete tag"
                    onClick={() =>
                        LemonDialog.open({
                            title: `Delete ${tag}?`,
                            description: `It comes off ${usage === 1 ? '1 item' : `${usage} items`}. The items stay.`,
                            primaryButton: { children: 'Delete', status: 'danger', onClick: () => deleteTag(tag) },
                            secondaryButton: { children: 'Cancel' },
                        })
                    }
                />
            </div>
            {editing && merges && (
                <span className="text-xs text-warning pl-1">{target} exists. Saving merges the two tags.</span>
            )}
            {recoloring && (
                <div className="pl-1">
                    <TagColorSwatches
                        value={colors[tag]}
                        onChange={(color) => {
                            setTagColor(tag, color)
                            setRecoloring(false)
                        }}
                    />
                </div>
            )}
        </div>
    )
}

export function ManageTagsModal(): JSX.Element {
    const { manageTagsOpen, vocabulary } = useValues(combinedVariantLogic)
    const { setManageTagsOpen } = useActions(combinedVariantLogic)
    const [query, setQuery] = useState('')
    const shown = orderTags(vocabulary.filter((tag) => !query || tag.includes(query.toLowerCase())))

    return (
        <LemonModal
            isOpen={manageTagsOpen}
            onClose={() => setManageTagsOpen(false)}
            title="Manage tags"
            description="Tags are shared by everyone in this project. Use / to group them, for example team/marketing."
            width={560}
            footer={
                <LemonButton type="primary" onClick={() => setManageTagsOpen(false)}>
                    Done
                </LemonButton>
            }
        >
            <div className="flex flex-col gap-2" data-attr="workflows-combined-manage-tags">
                <LemonInput type="search" placeholder="Find a tag" value={query} onChange={setQuery} autoFocus />
                <div className="flex flex-col">
                    {shown.map((tag) => (
                        <TagRow key={tag} tag={tag} />
                    ))}
                    {!shown.length && <span className="text-secondary text-sm py-2">No tags match.</span>}
                </div>
            </div>
        </LemonModal>
    )
}
