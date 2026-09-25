// PROTOTYPE (throwaway): pick, create and recolor tags. Tags with a `/` list under their group's heading.
import { useActions, useValues } from 'kea'
import { useMemo, useState } from 'react'

import { IconPalette, IconPlus } from '@posthog/icons'
import { LemonButton, LemonCheckbox, LemonInput } from '@posthog/lemon-ui'

import { TagColor, normalizeTagName, randomTagColor, tagGroup } from './combinedStore'
import { combinedVariantLogic } from './combinedVariantLogic'
import { TagColorSwatches } from './TagColorSwatches'
import { TagPill } from './TagPill'

interface TagSection {
    group: string | null
    tags: string[]
}

function sectionsOf(tags: string[]): TagSection[] {
    const ungrouped = tags.filter((tag) => !tagGroup(tag))
    const groups = new Map<string, string[]>()
    for (const tag of tags) {
        const group = tagGroup(tag)
        if (group) {
            groups.set(group, [...(groups.get(group) ?? []), tag])
        }
    }
    return [
        ...(ungrouped.length ? [{ group: null, tags: ungrouped }] : []),
        ...Array.from(groups.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([group, groupTags]) => ({ group, tags: groupTags })),
    ]
}

export function TagPicker({
    selected,
    onToggle,
    title,
}: {
    selected: string[]
    onToggle: (tag: string, checked: boolean) => void
    title: string
}): JSX.Element {
    const { vocabulary, colors } = useValues(combinedVariantLogic)
    const { createTag, setTagColor, setManageTagsOpen } = useActions(combinedVariantLogic)
    const [query, setQuery] = useState('')
    const [newColor, setNewColor] = useState<TagColor>(randomTagColor)
    const [recoloring, setRecoloring] = useState<string | null>(null)

    const name = normalizeTagName(query)
    const matches = useMemo(
        () => vocabulary.filter((tag) => !name || tag.includes(name) || tag.replace('/', ' ').includes(name)),
        [vocabulary, name]
    )
    const canCreate = !!name && !vocabulary.includes(name)

    const create = (): void => {
        createTag(name, newColor)
        onToggle(name, true)
        setQuery('')
        setNewColor(randomTagColor())
    }

    return (
        <div className="flex flex-col gap-2 p-2 w-80" data-attr="workflows-combined-tag-picker">
            <span className="text-xs font-semibold text-secondary">{title}</span>
            <LemonInput
                size="small"
                autoFocus
                value={query}
                onChange={setQuery}
                placeholder="Find or create a tag"
                onPressEnter={() => {
                    if (canCreate) {
                        create()
                    } else if (matches.length === 1) {
                        onToggle(matches[0], !selected.includes(matches[0]))
                    }
                }}
                data-attr="workflows-combined-tag-picker-input"
            />
            <div className="max-h-72 overflow-y-auto flex flex-col">
                {sectionsOf(matches).map((section) => (
                    <div key={section.group ?? ''} className="flex flex-col">
                        {section.group && (
                            <div className="px-1 pt-2 pb-0.5 text-xs font-semibold text-secondary">{section.group}</div>
                        )}
                        {section.tags.map((tag) => (
                            <div key={tag} className="flex flex-col">
                                <div className="group/tagrow flex items-center gap-1 rounded hover:bg-fill-button-tertiary-hover">
                                    <LemonCheckbox
                                        className={
                                            section.group ? 'pl-3 flex-1 min-w-0 py-1' : 'pl-1 flex-1 min-w-0 py-1'
                                        }
                                        checked={selected.includes(tag)}
                                        onChange={(checked) => onToggle(tag, checked)}
                                        label={<TagPill tag={tag} color={colors[tag]} size="xsmall" />}
                                        data-attr="workflows-combined-tag-picker-option"
                                    />
                                    <LemonButton
                                        size="xsmall"
                                        icon={<IconPalette />}
                                        tooltip="Change color"
                                        className="opacity-0 group-hover/tagrow:opacity-100 focus:opacity-100"
                                        onClick={() => setRecoloring(recoloring === tag ? null : tag)}
                                    />
                                </div>
                                {recoloring === tag && (
                                    <div className="pl-7 py-1">
                                        <TagColorSwatches
                                            value={colors[tag]}
                                            onChange={(color) => {
                                                setTagColor(tag, color)
                                                setRecoloring(null)
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
                {!matches.length && !canCreate && <span className="text-secondary text-xs px-1">No tags yet.</span>}
            </div>
            {canCreate && (
                <div className="flex flex-col gap-2 border-t pt-2">
                    <div className="flex items-center gap-2">
                        <TagPill tag={name} color={newColor} />
                        <LemonButton
                            size="xsmall"
                            type="primary"
                            icon={<IconPlus />}
                            className="ml-auto"
                            onClick={create}
                            data-attr="workflows-combined-tag-create"
                        >
                            Create tag
                        </LemonButton>
                    </div>
                    <TagColorSwatches value={newColor} onChange={setNewColor} />
                </div>
            )}
            <div className="flex items-center gap-2 text-xs text-secondary">
                <span className="flex-1">Use / to group tags, for example team/marketing.</span>
                <LemonButton size="xsmall" type="tertiary" onClick={() => setManageTagsOpen(true)}>
                    Manage tags
                </LemonButton>
            </div>
        </div>
    )
}
