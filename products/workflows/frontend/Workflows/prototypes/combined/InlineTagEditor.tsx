// PROTOTYPE (throwaway): edit a row's tags in place. The row's tags sit as pills in a small input. Below it, the
// picker lists every other tag: ungrouped tags first, then each `/` group under its heading. Typing filters across all
// of them, Enter adds the highlighted tag or creates a new one, Backspace on an empty input drops the last pill.
// Several tags can go in at once, and Esc or a click outside saves them.
import clsx from 'clsx'
import { useActions, useValues } from 'kea'
import { useMemo, useRef, useState } from 'react'

import { IconPlus } from '@posthog/icons'
import { Popover } from '@posthog/lemon-ui'

import { normalizeTagName, randomTagColor, tagGroup } from './combinedStore'
import { combinedVariantLogic } from './combinedVariantLogic'
import { TagPill } from './TagPill'

interface Suggestion {
    tag: string
    isNew: boolean
}

interface SuggestionSection {
    group: string | null
    suggestions: Suggestion[]
}

/** Ungrouped first, then one section per group, alphabetical. A new tag goes last, in its own section. */
function sectionsOf(suggestions: Suggestion[]): SuggestionSection[] {
    const sections = new Map<string | null, Suggestion[]>()
    for (const suggestion of suggestions) {
        const group = suggestion.isNew ? '__new__' : tagGroup(suggestion.tag)
        sections.set(group, [...(sections.get(group) ?? []), suggestion])
    }
    const key = (group: string | null): string => (group === null ? '' : group === '__new__' ? '\uffff' : group)
    return Array.from(sections.entries())
        .sort(([a], [b]) => key(a).localeCompare(key(b)))
        .map(([group, groupSuggestions]) => ({
            group: group === '__new__' ? null : group,
            suggestions: groupSuggestions,
        }))
}

/** Ungrouped tags first, then each group's tags, alphabetical inside both. */
export function orderTags(tags: string[]): string[] {
    return [...tags].sort((a, b) => {
        const groupA = tagGroup(a)
        const groupB = tagGroup(b)
        if (!groupA !== !groupB) {
            return groupA ? 1 : -1
        }
        return a.localeCompare(b)
    })
}

export function InlineTagEditor({ itemId, tags }: { itemId: string; tags: string[] }): JSX.Element {
    const { vocabulary, colors } = useValues(combinedVariantLogic)
    const { setItemTags, setEditingRowKey, createTag } = useActions(combinedVariantLogic)
    const [draft, setDraft] = useState<string[]>(tags)
    const [text, setText] = useState('')
    const [highlighted, setHighlighted] = useState(0)
    const [newColors, setNewColors] = useState<Record<string, ReturnType<typeof randomTagColor>>>({})
    const inputRef = useRef<HTMLInputElement>(null)

    const name = normalizeTagName(text)
    const suggestions: Suggestion[] = useMemo(() => {
        const available = orderTags(vocabulary.filter((tag) => !draft.includes(tag)))
        const matching = available
            .filter((tag) => !name || tag.includes(name) || tag.replace('/', ' ').includes(name))
            .map((tag) => ({ tag, isNew: false }))
        const withNew =
            name && !vocabulary.includes(name) && !draft.includes(name)
                ? [...matching, { tag: name, isNew: true }]
                : matching
        return sectionsOf(withNew).flatMap((section) => section.suggestions)
    }, [vocabulary, draft, name])
    const sections = useMemo(() => sectionsOf(suggestions), [suggestions])

    const scrollIntoView = (element: HTMLButtonElement | null): void => element?.scrollIntoView({ block: 'nearest' })

    const colorOf = (tag: string): ReturnType<typeof randomTagColor> =>
        colors[tag] ?? newColors[tag] ?? randomTagColor()

    const add = (suggestion: Suggestion | undefined): void => {
        const tag = suggestion?.tag ?? name
        if (!tag || draft.includes(tag)) {
            return
        }
        if (suggestion?.isNew ?? !vocabulary.includes(tag)) {
            const color = randomTagColor()
            setNewColors((current) => ({ ...current, [tag]: color }))
            createTag(tag, color)
        }
        setDraft((current) => [...current, tag])
        setText('')
        setHighlighted(0)
        inputRef.current?.focus()
    }

    const commit = (): void => {
        if (draft.join('\n') !== tags.join('\n')) {
            setItemTags(itemId, draft)
        }
        setEditingRowKey(null)
    }

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlighted((index) => Math.min(index + 1, suggestions.length - 1))
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlighted((index) => Math.max(index - 1, 0))
        } else if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            if (text.trim()) {
                // With text typed, Enter takes the highlighted match, or creates the tag when nothing matches.
                add(suggestions[highlighted] ?? { tag: name, isNew: !vocabulary.includes(name) })
            } else if (event.key === 'Enter') {
                commit()
            }
        } else if (event.key === 'Backspace' && text === '' && draft.length) {
            event.preventDefault()
            setDraft((current) => current.slice(0, -1))
        } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            commit()
        }
    }

    return (
        <Popover
            visible
            onClickOutside={commit}
            placement="bottom-start"
            overlay={
                <div
                    className="flex flex-col p-1 w-64"
                    onMouseDown={(event) => event.preventDefault()}
                    data-attr="workflows-combined-tag-editor-suggestions"
                >
                    <div className="flex flex-col max-h-72 overflow-y-auto">
                        {sections.map((section) => (
                            <div key={section.group ?? ''} className="flex flex-col">
                                {section.group && (
                                    <div className="px-2 pt-2 pb-0.5 text-xs font-semibold text-secondary">
                                        {section.group}
                                    </div>
                                )}
                                {section.suggestions.map((suggestion) => {
                                    const index = suggestions.indexOf(suggestion)
                                    return (
                                        <button
                                            key={suggestion.tag}
                                            type="button"
                                            ref={index === highlighted ? scrollIntoView : undefined}
                                            className={clsx(
                                                'flex items-center gap-2 py-1 pr-2 rounded text-left cursor-pointer',
                                                section.group ? 'pl-4' : 'pl-2',
                                                index === highlighted && 'bg-fill-button-tertiary-hover'
                                            )}
                                            onMouseEnter={() => setHighlighted(index)}
                                            onClick={() => add(suggestion)}
                                            data-attr="workflows-combined-tag-editor-option"
                                        >
                                            {suggestion.isNew && <IconPlus className="text-secondary shrink-0" />}
                                            {suggestion.isNew && <span className="text-secondary text-xs">Create</span>}
                                            <TagPill
                                                tag={suggestion.tag}
                                                color={colorOf(suggestion.tag)}
                                                size="xsmall"
                                            />
                                        </button>
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                    {!suggestions.length && (
                        <span className="px-2 py-1 text-xs text-secondary">
                            {vocabulary.length
                                ? 'Every tag is on this row. Type to create one.'
                                : 'Type to create a tag.'}
                        </span>
                    )}
                    <div className="px-2 pt-1 mt-1 border-t text-xs text-secondary">
                        Enter to add · Backspace to remove · Esc to save
                    </div>
                </div>
            }
        >
            <div
                className="flex flex-wrap items-center gap-1 w-full min-w-44 px-1 py-0.5 rounded border border-primary bg-surface-primary cursor-text"
                onClick={() => inputRef.current?.focus()}
                data-attr="workflows-combined-tag-editor"
            >
                {draft.map((tag) => (
                    <TagPill
                        key={tag}
                        tag={tag}
                        color={colorOf(tag)}
                        size="xsmall"
                        onRemove={() => setDraft((current) => current.filter((existing) => existing !== tag))}
                    />
                ))}
                <input
                    ref={inputRef}
                    autoFocus
                    className="flex-1 min-w-16 bg-transparent outline-none text-xs py-0.5"
                    value={text}
                    placeholder={draft.length ? '' : 'Add tags'}
                    onChange={(event) => {
                        setText(event.target.value)
                        setHighlighted(0)
                    }}
                    onKeyDown={onKeyDown}
                    aria-label="Add a tag"
                    data-attr="workflows-combined-tag-editor-input"
                />
            </div>
        </Popover>
    )
}
