// PROTOTYPE (throwaway): one search bar with facet pills. Type free text to search, or `facet:value`
// (optionally `-facet:value` to exclude). Suggestions come from the loaded data, with counts.
import { useActions, useValues } from 'kea'
import { useEffect, useMemo, useRef, useState } from 'react'

import { IconSearch } from '@posthog/icons'
import { LemonButton, LemonInput, LemonSnack, Popover } from '@posthog/lemon-ui'

import {
    FacetFilter,
    WorkflowFacet,
    facetValueCounts,
    filterKey,
    findWorkflowFacet,
    formatFacetValue,
    getWorkflowFacets,
    groupOfValue,
    isGroupFilterValue,
} from './workflowFacets'
import type { WorkflowListItem } from './workflowListItems'
import { workflowsPrototypeLogic } from './workflowsPrototypeLogic'

interface Draft {
    facet: WorkflowFacet
    negated: boolean
    partial: string
    /** Input text before the facet token. It stays as the free-text search. */
    rest: string
}

type SuggestionKind = 'facet' | 'value' | 'search' | 'none'

interface Suggestion {
    key: string
    kind: SuggestionKind
    label: string
    detail?: string
    count?: number
    /** A group row, for example `team` above `team/marketing`. */
    heading?: boolean
    indent?: boolean
    apply: () => void
}

/** Orders values so each group's members follow a row for the group itself. Ungrouped values come first. */
function groupValueSuggestions(
    facet: WorkflowFacet,
    values: Suggestion[],
    valueOf: (s: Suggestion) => string
): Suggestion[] {
    if (!facet.groupSeparator) {
        return values
    }
    const ungrouped: Suggestion[] = []
    const groups = new Map<string, { header: Suggestion | null; members: Suggestion[] }>()
    for (const suggestion of values) {
        const value = valueOf(suggestion)
        const group = groupOfValue(facet, value)
        if (!group) {
            ungrouped.push(suggestion)
            continue
        }
        const entry = groups.get(group) ?? { header: null, members: [] }
        if (isGroupFilterValue(facet, value)) {
            entry.header = {
                ...suggestion,
                heading: true,
                label: group,
                detail: `Any ${group}${facet.groupSeparator}… tag`,
            }
        } else {
            entry.members.push(suggestion)
        }
        groups.set(group, entry)
    }
    const grouped = Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([group, { header, members }]) =>
            header
                ? [
                      header,
                      ...members.map((member) => ({
                          ...member,
                          indent: true,
                          label: member.label.replace(`${group}${facet.groupSeparator}`, ''),
                      })),
                  ]
                : members
        )
    return [...ungrouped, ...grouped]
}

const MAX_VALUE_SUGGESTIONS = 50

function caretAtEnd(input: HTMLInputElement): boolean {
    return input.selectionStart === input.value.length && input.selectionEnd === input.value.length
}
const MAX_CROSS_FACET_SUGGESTIONS = 8

function parseDraft(input: string): Draft | null {
    const match = input.match(/(^|\s)(-?)([\w-]+):"([^"]*)$/) ?? input.match(/(^|\s)(-?)([\w-]+):(\S*)$/) ?? undefined
    if (!match || match.index === undefined) {
        return null
    }
    const facet = findWorkflowFacet(match[3])
    if (!facet) {
        return null
    }
    return { facet, negated: match[2] === '-', partial: match[4], rest: input.slice(0, match.index + match[1].length) }
}

function splitLastToken(input: string): { rest: string; token: string } {
    const match = input.match(/^(.*?)(\S*)$/s)
    return { rest: match?.[1] ?? '', token: match?.[2] ?? '' }
}

function pillLabel(filter: FacetFilter): string {
    const facet = findWorkflowFacet(filter.facet)
    const value = formatFacetValue(facet, filter.value)
    return `${facet?.label ?? filter.facet}${filter.negated ? ' is not' : ''}: ${value}`
}

/** `items` lets a variant count suggestions over rows the shared logic doesn't load, like Library email templates. */
export function WorkflowsSearchBar({ items: itemsOverride }: { items?: WorkflowListItem[] } = {}): JSX.Element {
    const { items: sharedItems, filters, search, query, facetsVersion } = useValues(workflowsPrototypeLogic)
    const items = itemsOverride ?? sharedItems
    const { addFilter, removeFilter, removeLastFilter, setSearch } = useActions(workflowsPrototypeLogic)

    const [input, setInput] = useState(search)
    const [open, setOpen] = useState(false)
    const [highlighted, setHighlighted] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    // The URL or "Clear all" can change the search without this input knowing.
    useEffect(() => {
        const draft = parseDraft(input)
        const current = draft ? draft.rest.trim() : input.trim()
        if (current !== search.trim()) {
            setInput(search)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search])

    const changeInput = (next: string): void => {
        setInput(next)
        setOpen(true)
        setHighlighted(0)
        const draft = parseDraft(next)
        const nextSearch = draft ? draft.rest.trim() : next.trim()
        if (nextSearch !== search) {
            setSearch(nextSearch)
        }
    }

    const commitFilter = (filter: FacetFilter, rest: string): void => {
        addFilter(filter)
        const trimmed = rest.trimEnd()
        setInput(trimmed ? `${trimmed} ` : '')
        setHighlighted(0)
        inputRef.current?.focus()
    }

    const suggestions: Suggestion[] = useMemo(() => {
        const draft = parseDraft(input)
        const chosen = new Set(filters.map(filterKey))

        if (draft) {
            const partial = draft.partial.toLowerCase()
            const values: Suggestion[] = facetValueCounts(items, draft.facet.key, query)
                .filter(
                    ({ value }) => !chosen.has(filterKey({ facet: draft.facet.key, value, negated: draft.negated }))
                )
                .filter(({ value }) => {
                    const label = formatFacetValue(draft.facet, value).toLowerCase()
                    return !partial || label.includes(partial) || value.toLowerCase().includes(partial)
                })
                .slice(0, MAX_VALUE_SUGGESTIONS)
                .map(
                    ({ value, count }): Suggestion => ({
                        key: `value-${value}`,
                        kind: 'value',
                        label: `${draft.negated ? 'Not ' : ''}${formatFacetValue(draft.facet, value)}`,
                        detail: draft.negated ? `Hides ${count}` : undefined,
                        count: draft.negated ? undefined : count,
                        apply: () =>
                            commitFilter({ facet: draft.facet.key, value, negated: draft.negated }, draft.rest),
                    })
                )
            const ordered = groupValueSuggestions(draft.facet, values, (suggestion) =>
                suggestion.key.slice('value-'.length)
            )
            return ordered.length
                ? ordered
                : [
                      {
                          key: 'none',
                          kind: 'none',
                          label: 'No values match the other filters',
                          apply: () => setOpen(false),
                      },
                  ]
        }

        const facets = getWorkflowFacets()
        const { rest, token } = splitLastToken(input)

        if (!token) {
            return facets.map((facet) => ({
                key: `facet-${facet.key}`,
                kind: 'facet' as const,
                label: `${facet.key}:`,
                detail: facet.description,
                apply: () => {
                    setInput(`${input}${facet.key}:`)
                    setHighlighted(0)
                    inputRef.current?.focus()
                },
            }))
        }

        const negated = token.startsWith('-')
        const bare = (negated ? token.slice(1) : token).toLowerCase()
        const searchSuggestion: Suggestion = {
            key: 'search',
            kind: 'search',
            label: `Search for "${input.trim()}"`,
            apply: () => setOpen(false),
        }
        const result: Suggestion[] = []
        for (const facet of facets) {
            if (bare && (facet.key.startsWith(bare) || facet.label.toLowerCase().startsWith(bare))) {
                result.push({
                    key: `facet-${facet.key}`,
                    kind: 'facet',
                    label: `${negated ? '-' : ''}${facet.key}:`,
                    detail: facet.description,
                    apply: () => {
                        setInput(`${rest}${negated ? '-' : ''}${facet.key}:`)
                        setHighlighted(0)
                        inputRef.current?.focus()
                    },
                })
            }
        }
        // A token that starts a facet name most likely is one, so offer the facet before the plain search.
        result.push(searchSuggestion)
        if (bare.length >= 2) {
            const valueMatches: Suggestion[] = []
            for (const facet of facets) {
                for (const { value, count } of facetValueCounts(items, facet.key, { ...query, search: rest.trim() })) {
                    const label = formatFacetValue(facet, value)
                    if (!label.toLowerCase().includes(bare) && !value.toLowerCase().includes(bare)) {
                        continue
                    }
                    if (chosen.has(filterKey({ facet: facet.key, value, negated }))) {
                        continue
                    }
                    valueMatches.push({
                        key: `value-${facet.key}-${value}`,
                        kind: 'value',
                        label: `${negated ? 'Not ' : ''}${facet.label}: ${label}`,
                        count,
                        apply: () => commitFilter({ facet: facet.key, value, negated }, rest),
                    })
                }
            }
            result.push(...valueMatches.slice(0, MAX_CROSS_FACET_SUGGESTIONS))
        }
        return result
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input, items, filters, query, facetsVersion])

    const draft = parseDraft(input)
    const title = draft
        ? `${draft.facet.label}${draft.negated ? ' is not' : ''}`
        : input.trim()
          ? 'Search or filter'
          : 'Filter by'

    const highlightedSuggestion = suggestions[highlighted]
    const isFilterSuggestion = (suggestion: Suggestion | undefined): boolean =>
        suggestion?.kind === 'facet' || suggestion?.kind === 'value'
    // Tab and the right arrow never run a plain search. They take the highlighted filter, or the first one offered.
    // With an empty input, Tab keeps moving focus out of the bar.
    const tabTarget: Suggestion | undefined = !input.trim()
        ? undefined
        : isFilterSuggestion(highlightedSuggestion)
          ? highlightedSuggestion
          : suggestions.find(isFilterSuggestion)
    const verb = (suggestion: Suggestion): string =>
        suggestion.kind === 'facet' ? `pick ${suggestion.label}` : 'add filter'
    const enterHint =
        highlightedSuggestion?.kind === 'search'
            ? 'Enter to search'
            : isFilterSuggestion(highlightedSuggestion)
              ? `Enter${tabTarget === highlightedSuggestion ? ' or Tab' : ''} to ${verb(highlightedSuggestion!)}`
              : null
    const tabHint =
        tabTarget && tabTarget !== highlightedSuggestion
            ? `Tab or → to ${tabTarget.kind === 'facet' ? verb(tabTarget) : 'add as filter'}`
            : null
    const hint = [enterHint, tabHint, '↑↓ to move', 'Esc to close'].filter(Boolean)

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setHighlighted((index) => Math.min(index + 1, suggestions.length - 1))
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlighted((index) => Math.max(index - 1, 0))
        } else if (event.key === 'Enter' && open && suggestions[highlighted]) {
            event.preventDefault()
            suggestions[highlighted].apply()
        } else if (
            (event.key === 'Tab' || (event.key === 'ArrowRight' && caretAtEnd(event.currentTarget))) &&
            open &&
            tabTarget
        ) {
            event.preventDefault()
            tabTarget.apply()
        } else if (event.key === 'Enter') {
            setOpen(false)
        } else if (event.key === 'Escape') {
            setOpen(false)
        } else if (event.key === 'Backspace' && input === '' && filters.length > 0) {
            event.preventDefault()
            removeLastFilter()
        }
    }

    return (
        <Popover
            visible={open && suggestions.length > 0}
            onClickOutside={() => setOpen(false)}
            placement="bottom-start"
            matchWidth
            overlay={
                <div onMouseDown={(event) => event.preventDefault()}>
                    <div className="max-h-96 overflow-y-auto">
                        <div className="px-2 py-1 text-xs font-semibold text-secondary">{title}</div>
                        {suggestions.map((suggestion, index) => (
                            <LemonButton
                                key={suggestion.key}
                                fullWidth
                                size="small"
                                active={index === highlighted}
                                onMouseEnter={() => setHighlighted(index)}
                                onClick={suggestion.apply}
                                data-attr="workflows-prototype-search-suggestion"
                            >
                                <span
                                    className={`flex items-center gap-2 w-full min-w-0${suggestion.indent ? ' pl-4' : ''}`}
                                >
                                    <span
                                        className={
                                            suggestion.heading ? 'font-semibold truncate' : 'font-medium truncate'
                                        }
                                    >
                                        {suggestion.label}
                                    </span>
                                    {suggestion.detail && (
                                        <span className="text-secondary truncate">{suggestion.detail}</span>
                                    )}
                                    {suggestion.count !== undefined && (
                                        <span className="ml-auto text-secondary tabular-nums" translate="no">
                                            {suggestion.count}
                                        </span>
                                    )}
                                </span>
                            </LemonButton>
                        ))}
                    </div>
                    <div
                        className="flex flex-wrap gap-x-3 px-2 pt-1 mt-1 border-t text-xs text-secondary"
                        data-attr="workflows-prototype-search-hint"
                    >
                        {hint.map((part) => (
                            <span key={part}>{part}</span>
                        ))}
                    </div>
                </div>
            }
        >
            <div className="w-full">
                <LemonInput
                    inputRef={inputRef}
                    fullWidth
                    className="!h-auto leading-7 flex-wrap"
                    placeholder={
                        filters.length
                            ? 'Add a filter or search'
                            : 'Search workflows, or filter with status:, channel:, from:, owner: and more'
                    }
                    prefix={
                        <>
                            <IconSearch className="text-secondary shrink-0" />
                            {filters.map((filter) => (
                                <LemonSnack
                                    key={filterKey(filter)}
                                    title={pillLabel(filter)}
                                    onClose={() => removeFilter(filter)}
                                    data-attr="workflows-prototype-search-pill"
                                >
                                    <span className={filter.negated ? 'text-danger' : undefined}>
                                        {pillLabel(filter)}
                                    </span>
                                </LemonSnack>
                            ))}
                        </>
                    }
                    value={input}
                    onChange={changeInput}
                    onFocus={() => setOpen(true)}
                    onClick={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    data-attr="workflows-prototype-search"
                />
            </div>
        </Popover>
    )
}
