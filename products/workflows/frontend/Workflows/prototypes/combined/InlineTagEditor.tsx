// PROTOTYPE (throwaway): edit a row's tags in place. The row's tags sit as pills in a small input. Typing filters
// the suggestions, Enter adds the highlighted tag or creates a new one, Backspace on an empty input drops the last
// pill. Several tags can go in at once, and Esc or a click outside saves them.
import clsx from 'clsx'
import { useActions, useValues } from 'kea'
import { useMemo, useRef, useState } from 'react'

import { IconPlus } from '@posthog/icons'
import { Popover } from '@posthog/lemon-ui'

import { normalizeTagName, randomTagColor, tagGroup } from './combinedStore'
import { combinedVariantLogic } from './combinedVariantLogic'
import { TagPill } from './TagPill'

const MAX_SUGGESTIONS = 8

interface Suggestion {
    tag: string
    isNew: boolean
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
            .slice(0, MAX_SUGGESTIONS)
            .map((tag) => ({ tag, isNew: false }))
        return name && !vocabulary.includes(name) && !draft.includes(name)
            ? [...matching, { tag: name, isNew: true }]
            : matching
    }, [vocabulary, draft, name])

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
                    {suggestions.map((suggestion, index) => (
                        <button
                            key={suggestion.tag}
                            type="button"
                            className={clsx(
                                'flex items-center gap-2 px-2 py-1 rounded text-left cursor-pointer',
                                index === highlighted && 'bg-fill-button-tertiary-hover'
                            )}
                            onMouseEnter={() => setHighlighted(index)}
                            onClick={() => add(suggestion)}
                        >
                            {suggestion.isNew && <IconPlus className="text-secondary shrink-0" />}
                            {suggestion.isNew && <span className="text-secondary text-xs">Create</span>}
                            <TagPill tag={suggestion.tag} color={colorOf(suggestion.tag)} size="xsmall" />
                        </button>
                    ))}
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
