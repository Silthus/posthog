// PROTOTYPE (throwaway): state for the tags variant. Tags and saved views persist in the project's
// `extra_settings` (see workflowTagsStore.ts). Grouping lives in the `group` URL param, next to the shared `q` and `text`.
import {
    MakeLogicType,
    actions,
    afterMount,
    connect,
    isBreakpoint,
    kea,
    listeners,
    path,
    reducers,
    selectors,
} from 'kea'
import { loaders } from 'kea-loaders'
import { router } from 'kea-router'

import { lemonToast } from '@posthog/lemon-ui'

import api from 'lib/api'
import { userLogic } from 'scenes/userLogic'

import type { UserType } from '~/types'

import { FacetFilter, applyWorkflowQuery, parseFilters, serializeFilters } from '../shared/workflowFacets'
import type { WorkflowListItem } from '../shared/workflowListItems'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { GroupByOption, WorkflowGroup, findGroupBy, groupItems } from './workflowGrouping'
import { setWorkflowTagsForFacets, tagsOfItem } from './workflowTagFacets'
import {
    GroupByKey,
    SavedView,
    TAGS_STORE_KEY,
    WorkflowTagsStore,
    normalizeTags,
    readTagsStore,
} from './workflowTagsStore'

const TEAM_URL = 'api/environments/@current/'

export type TagsTableRow =
    | { kind: 'group'; rowKey: string; group: WorkflowGroup; collapsed: boolean }
    | { kind: 'item'; rowKey: string; item: WorkflowListItem }

/** `created-by:me` and `owner:me` stand for whoever is signed in, so one saved view works for everyone. */
export function resolveViewFilters(q: string, user: UserType | null): FacetFilter[] {
    const firstName = user?.first_name || user?.email || ''
    return parseFilters(q).map((filter) =>
        filter.value === 'me' && filter.facet === 'created-by'
            ? { ...filter, value: firstName }
            : filter.value === 'me' && filter.facet === 'owner'
              ? { ...filter, value: firstName.toLowerCase() }
              : filter
    )
}

function filtersSignature(filters: FacetFilter[]): string {
    return serializeFilters([...filters].sort((a, b) => serializeFilters([a]).localeCompare(serializeFilters([b]))))
}

interface Values {
    user: UserType | null
    filters: FacetFilter[]
    search: string
    filteredItems: WorkflowListItem[]
    items: WorkflowListItem[]
    store: WorkflowTagsStore | null
    storeLoading: boolean
    saving: boolean
    compact: boolean
    collapsed: Record<string, boolean>
    selectedIds: string[]
    editingRowKey: string | null
    groupBy: GroupByOption
    groups: WorkflowGroup[]
    rows: TagsTableRow[]
    vocabulary: string[]
    views: SavedView[]
    activeViewId: string | null
    viewCounts: Record<string, number>
    selectedTagCounts: Record<string, number>
}

interface Actions {
    setFilters: (filters: FacetFilter[]) => { filters: FacetFilter[] }
    setSearch: (search: string) => { search: string }
    loadStore: () => {}
    loadStoreSuccess: (store: WorkflowTagsStore | null) => { store: WorkflowTagsStore | null }
    loadStoreFailure: (error: string) => { error: string }
    setWorkflowTags: (workflowId: string, tags: string[]) => { workflowId: string; tags: string[] }
    addTagsToSelection: (ids: string[], tags: string[]) => { ids: string[]; tags: string[] }
    removeTagsFromSelection: (ids: string[], tags: string[]) => { ids: string[]; tags: string[] }
    saveView: (view: SavedView) => { view: SavedView }
    deleteView: (id: string) => { id: string }
    applyView: (view: SavedView | null) => { view: SavedView | null }
    persist: () => { value: true }
    persistDone: () => { value: true }
    setCompact: (compact: boolean) => { compact: boolean }
    setGroupBy: (groupBy: GroupByKey) => { groupBy: GroupByKey }
    toggleGroup: (key: string) => { key: string }
    collapseAll: (keys: string[]) => { keys: string[] }
    expandAll: () => { value: true }
    setSelectedIds: (ids: string[]) => { ids: string[] }
    toggleSelected: (ids: string[], selected: boolean) => { ids: string[]; selected: boolean }
    clearSelection: () => { value: true }
    setEditingRowKey: (rowKey: string | null) => { rowKey: string | null }
}

type LogicType = MakeLogicType<Values, Actions>

function withTags(store: WorkflowTagsStore, updates: Record<string, string[]>): WorkflowTagsStore {
    const tags = { ...store.tags }
    for (const [id, value] of Object.entries(updates)) {
        if (value.length) {
            tags[id] = value
        } else {
            delete tags[id]
        }
    }
    return { ...store, tags }
}

export const workflowsTagsVariantLogic = kea<LogicType>([
    path(['products', 'workflows', 'frontend', 'Workflows', 'prototypes', 'tags', 'workflowsTagsVariantLogic']),
    connect(() => ({
        values: [userLogic, ['user'], workflowsPrototypeLogic, ['filters', 'search', 'filteredItems', 'items']],
        actions: [workflowsPrototypeLogic, ['setFilters', 'setSearch']],
    })),
    actions({
        setWorkflowTags: (workflowId: string, tags: string[]) => ({ workflowId, tags }),
        addTagsToSelection: (ids: string[], tags: string[]) => ({ ids, tags }),
        removeTagsFromSelection: (ids: string[], tags: string[]) => ({ ids, tags }),
        saveView: (view: SavedView) => ({ view }),
        deleteView: (id: string) => ({ id }),
        applyView: (view: SavedView | null) => ({ view }),
        persist: true,
        persistDone: true,
        setCompact: (compact: boolean) => ({ compact }),
        setGroupBy: (groupBy: GroupByKey) => ({ groupBy }),
        toggleGroup: (key: string) => ({ key }),
        collapseAll: (keys: string[]) => ({ keys }),
        expandAll: true,
        setSelectedIds: (ids: string[]) => ({ ids }),
        toggleSelected: (ids: string[], selected: boolean) => ({ ids, selected }),
        clearSelection: true,
        setEditingRowKey: (rowKey: string | null) => ({ rowKey }),
    }),
    loaders({
        store: [
            null as WorkflowTagsStore | null,
            {
                loadStore: async (_, breakpoint) => {
                    // The shared dev stack restarts often, so ride out a few failed requests.
                    for (let attempt = 1; ; attempt++) {
                        try {
                            const team = await api.get(TEAM_URL)
                            return readTagsStore(team.extra_settings)
                        } catch (error) {
                            if (attempt >= 5) {
                                throw error
                            }
                            await breakpoint(3000)
                        }
                    }
                },
            },
        ],
    }),
    reducers(() => ({
        store: {
            // Until the stored blob has loaded, every edit is ignored, so a write can never replace it with an empty one.
            setWorkflowTags: (state, { workflowId, tags }) =>
                state ? withTags(state, { [workflowId]: normalizeTags(tags) }) : state,
            addTagsToSelection: (state, { ids, tags }) => {
                if (!state) {
                    return state
                }
                const current = state
                const normalized = normalizeTags(tags)
                return withTags(
                    current,
                    Object.fromEntries(
                        ids.map((id) => [id, normalizeTags([...(current.tags[id] ?? []), ...normalized])])
                    )
                )
            },
            removeTagsFromSelection: (state, { ids, tags }) => {
                if (!state) {
                    return state
                }
                const current = state
                const drop = new Set(normalizeTags(tags))
                return withTags(
                    current,
                    Object.fromEntries(ids.map((id) => [id, (current.tags[id] ?? []).filter((tag) => !drop.has(tag))]))
                )
            },
            saveView: (state, { view }) => {
                if (!state) {
                    return state
                }
                const current = state
                const exists = current.views.some((existing) => existing.id === view.id)
                return {
                    ...current,
                    views: exists
                        ? current.views.map((existing) => (existing.id === view.id ? view : existing))
                        : [...current.views, view],
                }
            },
            deleteView: (state, { id }) => {
                if (!state) {
                    return state
                }
                const current = state
                return { ...current, views: current.views.filter((view) => view.id !== id) }
            },
        },
        saving: [false, { persist: () => true, persistDone: () => false }],
        compact: [true, { persist: true }, { setCompact: (_, { compact }) => compact }],
        collapsed: [
            {} as Record<string, boolean>,
            {
                toggleGroup: (state, { key }) => ({ ...state, [key]: !state[key] }),
                collapseAll: (_, { keys }) => Object.fromEntries(keys.map((key) => [key, true])),
                expandAll: () => ({}),
                setGroupBy: () => ({}),
            },
        ],
        selectedIds: [
            [] as string[],
            {
                setSelectedIds: (_, { ids }) => ids,
                toggleSelected: (state, { ids, selected }) =>
                    selected ? Array.from(new Set([...state, ...ids])) : state.filter((id) => !ids.includes(id)),
                clearSelection: () => [],
            },
        ],
        editingRowKey: [null as string | null, { setEditingRowKey: (_, { rowKey }) => rowKey }],
    })),
    selectors({
        groupBy: [() => [router.selectors.searchParams], (searchParams) => findGroupBy(searchParams.group)],
        groups: [
            (s) => [s.filteredItems, s.groupBy, s.store],
            (filteredItems, groupBy): WorkflowGroup[] =>
                groupBy.key === 'none' ? [] : groupItems(filteredItems, groupBy),
        ],
        rows: [
            (s) => [s.filteredItems, s.groupBy, s.groups, s.collapsed],
            (filteredItems, groupBy, groups, collapsed): TagsTableRow[] => {
                if (groupBy.key === 'none') {
                    return filteredItems.map((item: WorkflowListItem) => ({ kind: 'item', rowKey: item.id, item }))
                }
                return groups.flatMap((group: WorkflowGroup): TagsTableRow[] => [
                    { kind: 'group', rowKey: `group:${group.key}`, group, collapsed: !!collapsed[group.key] },
                    ...(collapsed[group.key]
                        ? []
                        : group.items.map(
                              (item): TagsTableRow => ({ kind: 'item', rowKey: `${group.key}:${item.id}`, item })
                          )),
                ])
            },
        ],
        vocabulary: [
            (s) => [s.store, s.items],
            (store, items): string[] => {
                const all = new Set<string>(store?.pinned_tags ?? [])
                for (const item of items) {
                    tagsOfItem(item).forEach((tag) => all.add(tag))
                }
                return Array.from(all).sort()
            },
        ],
        views: [(s) => [s.store], (store): SavedView[] => store?.views ?? []],
        activeViewId: [
            (s) => [s.views, s.filters, s.search, s.groupBy, s.user],
            (views, filters, search, groupBy, user): string | null => {
                const current = filtersSignature(filters)
                const match = views.find(
                    (view: SavedView) =>
                        filtersSignature(resolveViewFilters(view.q, user)) === current &&
                        view.text === search &&
                        view.group === groupBy.key
                )
                if (match) {
                    return match.id
                }
                return !filters.length && !search && groupBy.key === 'none' ? 'all' : null
            },
        ],
        viewCounts: [
            (s) => [s.views, s.items, s.user, s.store],
            (views, items, user): Record<string, number> =>
                Object.fromEntries(
                    views.map((view: SavedView) => [
                        view.id,
                        applyWorkflowQuery(items, { filters: resolveViewFilters(view.q, user), search: view.text })
                            .length,
                    ])
                ),
        ],
        selectedTagCounts: [
            (s) => [s.selectedIds, s.store],
            (selectedIds, store): Record<string, number> => {
                const counts: Record<string, number> = {}
                for (const id of selectedIds) {
                    for (const tag of store?.tags[id] ?? []) {
                        counts[tag] = (counts[tag] ?? 0) + 1
                    }
                }
                return counts
            },
        ],
    }),
    listeners(({ actions, values }) => ({
        loadStoreSuccess: ({ store }) => {
            setWorkflowTagsForFacets(store?.tags ?? {})
        },
        loadStoreFailure: () => {
            lemonToast.error("Couldn't load tags and saved views. Refresh the page to try again.")
        },
        setWorkflowTags: () => actions.persist(),
        addTagsToSelection: ({ ids, tags }) => {
            lemonToast.success(`Tagged ${ids.length} workflows with ${normalizeTags(tags).join(', ')}`)
            actions.persist()
        },
        removeTagsFromSelection: () => actions.persist(),
        saveView: () => actions.persist(),
        deleteView: () => actions.persist(),
        persist: async (_, breakpoint) => {
            if (!values.store) {
                actions.persistDone()
                return
            }
            setWorkflowTagsForFacets(values.store.tags)
            await breakpoint(500)
            for (let attempt = 1; ; attempt++) {
                try {
                    // Read the latest settings first, so keys that other features keep there survive the write.
                    const team = await api.get(TEAM_URL)
                    breakpoint()
                    await api.update(TEAM_URL, {
                        extra_settings: { ...team.extra_settings, [TAGS_STORE_KEY]: values.store },
                    })
                    break
                } catch (error: any) {
                    if (isBreakpoint(error)) {
                        throw error
                    }
                    if (attempt >= 5) {
                        lemonToast.error("Couldn't save tags. Check your connection and try again.")
                        break
                    }
                    await breakpoint(3000)
                }
            }
            actions.persistDone()
        },
        setGroupBy: ({ groupBy }) => {
            const { group: _group, ...searchParams } = router.values.searchParams
            router.actions.replace(
                router.values.location.pathname,
                groupBy === 'none' ? searchParams : { ...searchParams, group: groupBy },
                router.values.hashParams
            )
        },
        applyView: ({ view }) => {
            actions.setGroupBy(view?.group ?? 'none')
            actions.setFilters(view ? resolveViewFilters(view.q, values.user) : [])
            actions.setSearch(view?.text ?? '')
            actions.clearSelection()
        },
    })),
    afterMount(({ actions }) => {
        actions.loadStore()
    }),
])
