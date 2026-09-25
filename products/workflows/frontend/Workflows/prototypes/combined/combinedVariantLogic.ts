import './combinedFacets'

// PROTOTYPE (throwaway): state for the combined variant, and for any layout over the same pieces (the side tree
// here, the folder rows of the browser variant). It builds on the folders logic (tree rows, location, moves) and the
// shared pill search, and adds the scope, views that know when they are modified, per-view columns, and tags.
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
import { actionToUrl, router, urlToAction } from 'kea-router'

import { lemonToast } from '@posthog/lemon-ui'

import api from 'lib/api'
import { urls } from 'scenes/urls'
import { userLogic } from 'scenes/userLogic'

import { joinPath, splitPath } from '~/layout/panel-layout/ProjectTree/utils'
import type { FileSystemEntry } from '~/queries/schema/schema-general'
import type { UserType } from '~/types'

import { newWorkflowLogic } from '../../newWorkflowLogic'
import { FolderLocation, FolderRow, WORKFLOWS_ROOT, foldersVariantLogic } from '../folders/foldersVariantLogic'
import {
    FacetFilter,
    WorkflowQuery,
    applyWorkflowQuery,
    findWorkflowFacet,
    isGroupFilterValue,
    parseFilters,
    serializeFilters,
} from '../shared/workflowFacets'
import type { WorkflowListItem } from '../shared/workflowListItems'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { resolveViewFilters } from '../tags/workflowsTagsVariantLogic'
import { setWorkflowTagsForFacets } from '../tags/workflowTagFacets'
import { setItemTagsForFacets } from './combinedFacets'
import {
    BUILT_IN_VIEWS,
    COLUMN_ORDER,
    ColumnKey,
    CombinedStore,
    CombinedView,
    DEFAULT_COLUMNS,
    TagColor,
    fallbackTagColor,
    normalizeColumns,
    normalizeTagName,
    readCombinedStore,
    writeCombinedStore,
} from './combinedStore'
import { setNewWorkflowContext } from './newWorkflowContext'

const TEAM_URL = 'api/environments/@current/'

function startsWith(segments: string[], prefix: string[]): boolean {
    return prefix.length <= segments.length && prefix.every((segment, index) => segments[index] === segment)
}

/** The open folder under the Workflows root. The root is `[]`, and it means "everywhere". */
export function scopeOf(location: FolderLocation): string[] {
    return location.type === 'folder' ? location.segments : []
}

/** Unfiled items sit in the root. */
export function placementOf(row: FolderRow): string[] {
    return row.segments ?? []
}

/** Where a row sits relative to the scope: `[]` for the scope itself, `['Cards']` for a subfolder. */
export function relativePathOf(row: FolderRow, scope: string[]): string[] {
    return placementOf(row).slice(scope.length)
}

function compareNames(a: string, b: string): number {
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

/** Tree order: at every level, each subfolder's items as a block (subfolders alphabetical), then the loose items. */
export function compareTreeOrder(a: FolderRow, b: FolderRow, scope: string[]): number {
    const pathA = relativePathOf(a, scope)
    const pathB = relativePathOf(b, scope)
    for (let depth = 0; ; depth++) {
        const segmentA = pathA[depth]
        const segmentB = pathB[depth]
        if (segmentA === undefined && segmentB === undefined) {
            return compareNames(a.item.name, b.item.name)
        }
        if (segmentA === undefined) {
            return 1
        }
        if (segmentB === undefined) {
            return -1
        }
        const bySegment = compareNames(segmentA, segmentB)
        if (bySegment !== 0) {
            return bySegment
        }
    }
}

export type ListRow =
    | { rowType: 'up'; id: string; parent: string[] }
    | { rowType: 'folder'; id: string; name: string; segments: string[]; count: number }
    | { rowType: 'item'; id: string; row: FolderRow }

export interface ViewState {
    filters: FacetFilter[]
    search: string
    scope: string[]
    columns: ColumnKey[]
}

function filtersSignature(filters: FacetFilter[]): string {
    return filters
        .map((filter) => serializeFilters([filter]))
        .sort()
        .join(' ')
}

/** Which parts of the current state differ from the view. Empty when the view shows as saved. */
export function viewChanges(view: CombinedView, state: ViewState, user: UserType | null): string[] {
    const changes: string[] = []
    if (filtersSignature(resolveViewFilters(view.q, user)) !== filtersSignature(state.filters)) {
        changes.push('filters')
    }
    if (view.text !== state.search.trim()) {
        changes.push('search')
    }
    if (view.folder !== null && view.folder !== joinPath(state.scope)) {
        changes.push('folder')
    }
    if (view.columns.join(',') !== state.columns.join(',')) {
        changes.push('columns')
    }
    return changes
}

/** Tag filters that name one tag, so a new workflow can carry them. Group pills and exclusions don't count. */
export function tagsFromFilters(filters: FacetFilter[]): string[] {
    const tagFacet = findWorkflowFacet('tag')
    return filters
        .filter((filter) => filter.facet === 'tag' && !filter.negated && !isGroupFilterValue(tagFacet, filter.value))
        .map((filter) => filter.value)
}

function renameTagInQuery(q: string, from: string, to: string): string {
    return serializeFilters(
        parseFilters(q).map((filter) =>
            filter.facet === 'tag' && filter.value === from ? { ...filter, value: to } : filter
        )
    )
}

function withTags(store: CombinedStore, updates: Record<string, string[]>): CombinedStore {
    const tags = { ...store.tags }
    for (const [id, value] of Object.entries(updates)) {
        const normalized = Array.from(new Set(value.map(normalizeTagName).filter(Boolean)))
        if (normalized.length) {
            tags[id] = normalized
        } else {
            delete tags[id]
        }
    }
    return { ...store, tags }
}

interface Values {
    user: UserType | null
    rows: FolderRow[]
    rowsById: Record<string, FolderRow>
    folderPaths: string[][]
    location: FolderLocation
    entriesLoading: boolean
    filters: FacetFilter[]
    search: string
    query: WorkflowQuery
    hasActiveQuery: boolean
    hasLoaded: boolean
    facetsVersion: number
    store: CombinedStore | null
    storeLoading: boolean
    saving: boolean
    columns: ColumnKey[]
    activeViewId: string
    selectedIds: string[]
    editingRowKey: string | null
    manageTagsOpen: boolean
    scope: string[]
    effectiveFlat: boolean
    listRows: FolderRow[]
    allItems: WorkflowListItem[]
    matchingRows: FolderRow[]
    contents: ListRow[]
    childFolders: Extract<ListRow, { rowType: 'folder' }>[]
    folderCounts: Record<string, number>
    usedByCounts: Record<string, number>
    vocabulary: string[]
    colors: Record<string, TagColor>
    tagUsage: Record<string, number>
    views: CombinedView[]
    activeView: CombinedView
    viewState: ViewState
    activeViewChanges: string[]
    isModified: boolean
    canUpdateActiveView: boolean
    viewCounts: Record<string, number>
    selectedTagCounts: Record<string, number>
}

interface Actions {
    setLocation: (location: FolderLocation) => { location: FolderLocation }
    loadEntries: () => {}
    loadEntriesFailure: (error: string) => { error: string }
    loadSources: () => {}
    loadSourcesFailure: (error: string) => { error: string }
    moveRows: (ids: string[]) => { ids: string[] }
    movesSettled: (moved: unknown[]) => { moved: unknown[] }
    setFilters: (filters: FacetFilter[]) => { filters: FacetFilter[] }
    setSearch: (search: string) => { search: string }
    addFilter: (filter: FacetFilter) => { filter: FacetFilter }
    loadStore: () => {}
    loadStoreSuccess: (store: CombinedStore | null) => { store: CombinedStore | null }
    loadStoreFailure: (error: string) => { error: string }
    setScope: (scope: string[]) => { scope: string[] }
    setColumns: (columns: ColumnKey[]) => { columns: ColumnKey[] }
    toggleColumn: (column: ColumnKey, shown: boolean) => { column: ColumnKey; shown: boolean }
    setActiveViewId: (id: string) => { id: string }
    setSelectedIds: (ids: string[]) => { ids: string[] }
    toggleSelected: (ids: string[], selected: boolean) => { ids: string[]; selected: boolean }
    clearSelection: () => { value: true }
    setEditingRowKey: (rowKey: string | null) => { rowKey: string | null }
    setItemTags: (itemId: string, tags: string[]) => { itemId: string; tags: string[] }
    addTagsToSelection: (ids: string[], tags: string[]) => { ids: string[]; tags: string[] }
    removeTagsFromSelection: (ids: string[], tags: string[]) => { ids: string[]; tags: string[] }
    createTag: (tag: string, color: TagColor) => { tag: string; color: TagColor }
    setTagColor: (tag: string, color: TagColor) => { tag: string; color: TagColor }
    renameTag: (from: string, to: string) => { from: string; to: string }
    deleteTag: (tag: string) => { tag: string }
    setManageTagsOpen: (open: boolean) => { open: boolean }
    applyView: (view: CombinedView) => { view: CombinedView }
    resetView: () => { value: true }
    saveViewAs: (name: string, pinScope: boolean) => { name: string; pinScope: boolean }
    updateActiveView: () => { value: true }
    renameView: (id: string, name: string) => { id: string; name: string }
    upsertView: (view: CombinedView) => { view: CombinedView }
    deleteView: (id: string) => { id: string }
    createFolderAt: (parent: string[], name: string) => { parent: string[]; name: string }
    startNewWorkflow: () => { value: true }
    showWorkflowsUsingTemplate: (name: string) => { name: string }
    persist: () => { value: true }
    persistDone: () => { value: true }
}

export const combinedVariantLogic = kea<MakeLogicType<Values, Actions>>([
    path(['products', 'workflows', 'frontend', 'Workflows', 'prototypes', 'combined', 'combinedVariantLogic']),
    connect(() => ({
        values: [
            userLogic,
            ['user'],
            foldersVariantLogic,
            ['rows', 'rowsById', 'folderPaths', 'location', 'entriesLoading'],
            workflowsPrototypeLogic,
            ['filters', 'search', 'query', 'hasActiveQuery', 'hasLoaded', 'facetsVersion'],
        ],
        actions: [
            foldersVariantLogic,
            ['setLocation', 'loadEntries', 'loadEntriesFailure', 'moveRows', 'movesSettled'],
            workflowsPrototypeLogic,
            ['setFilters', 'setSearch', 'addFilter', 'loadSources', 'loadSourcesFailure'],
        ],
    })),
    actions({
        setScope: (scope: string[]) => ({ scope }),
        setColumns: (columns: ColumnKey[]) => ({ columns }),
        toggleColumn: (column: ColumnKey, shown: boolean) => ({ column, shown }),
        setActiveViewId: (id: string) => ({ id }),
        setSelectedIds: (ids: string[]) => ({ ids }),
        toggleSelected: (ids: string[], selected: boolean) => ({ ids, selected }),
        clearSelection: true,
        setEditingRowKey: (rowKey: string | null) => ({ rowKey }),
        setItemTags: (itemId: string, tags: string[]) => ({ itemId, tags }),
        addTagsToSelection: (ids: string[], tags: string[]) => ({ ids, tags }),
        removeTagsFromSelection: (ids: string[], tags: string[]) => ({ ids, tags }),
        createTag: (tag: string, color: TagColor) => ({ tag, color }),
        setTagColor: (tag: string, color: TagColor) => ({ tag, color }),
        renameTag: (from: string, to: string) => ({ from, to }),
        deleteTag: (tag: string) => ({ tag }),
        setManageTagsOpen: (open: boolean) => ({ open }),
        applyView: (view: CombinedView) => ({ view }),
        resetView: true,
        saveViewAs: (name: string, pinScope: boolean) => ({ name, pinScope }),
        updateActiveView: true,
        renameView: (id: string, name: string) => ({ id, name }),
        upsertView: (view: CombinedView) => ({ view }),
        deleteView: (id: string) => ({ id }),
        createFolderAt: (parent: string[], name: string) => ({ parent, name }),
        startNewWorkflow: true,
        showWorkflowsUsingTemplate: (name: string) => ({ name }),
        persist: true,
        persistDone: true,
    }),
    loaders({
        store: [
            null as CombinedStore | null,
            {
                loadStore: async (_, breakpoint) => {
                    // The shared dev stack restarts often, so ride out a few failed requests.
                    for (let attempt = 1; ; attempt++) {
                        try {
                            const team = await api.get(TEAM_URL)
                            return readCombinedStore(team.extra_settings)
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
        // Every edit is a no-op until the stored blob has loaded, so a write can never replace it with an empty one.
        store: {
            setItemTags: (state, { itemId, tags }) => (state ? withTags(state, { [itemId]: tags }) : state),
            addTagsToSelection: (state, { ids, tags }) =>
                state
                    ? withTags(state, Object.fromEntries(ids.map((id) => [id, [...(state.tags[id] ?? []), ...tags]])))
                    : state,
            removeTagsFromSelection: (state, { ids, tags }) => {
                if (!state) {
                    return state
                }
                const drop = new Set(tags.map(normalizeTagName))
                return withTags(
                    state,
                    Object.fromEntries(ids.map((id) => [id, (state.tags[id] ?? []).filter((tag) => !drop.has(tag))]))
                )
            },
            createTag: (state, { tag, color }) => {
                const name = normalizeTagName(tag)
                if (!state || !name) {
                    return state
                }
                return {
                    ...state,
                    colors: { ...state.colors, [name]: state.colors[name] ?? color },
                    pinnedTags: state.pinnedTags.includes(name) ? state.pinnedTags : [...state.pinnedTags, name],
                }
            },
            setTagColor: (state, { tag, color }) =>
                state ? { ...state, colors: { ...state.colors, [tag]: color } } : state,
            // Renaming onto an existing tag merges the two: items keep one copy, and the target keeps its color.
            renameTag: (state, { from, to }) => {
                const target = normalizeTagName(to)
                if (!state || !target || target === from) {
                    return state
                }
                const tags = Object.fromEntries(
                    Object.entries(state.tags).map(([id, value]) => [
                        id,
                        Array.from(new Set(value.map((tag) => (tag === from ? target : tag)))),
                    ])
                )
                const { [from]: fromColor, ...colors } = state.colors
                return {
                    ...state,
                    tags,
                    colors: { ...colors, [target]: state.colors[target] ?? fromColor ?? fallbackTagColor(target) },
                    pinnedTags: Array.from(new Set(state.pinnedTags.map((tag) => (tag === from ? target : tag)))),
                    views: state.views.map((view) => ({ ...view, q: renameTagInQuery(view.q, from, target) })),
                }
            },
            deleteTag: (state, { tag }) => {
                if (!state) {
                    return state
                }
                const { [tag]: _color, ...colors } = state.colors
                const tags = Object.fromEntries(
                    Object.entries(state.tags)
                        .map(([id, value]) => [id, value.filter((existing) => existing !== tag)] as const)
                        .filter(([, value]) => value.length > 0)
                )
                return { ...state, tags, colors, pinnedTags: state.pinnedTags.filter((existing) => existing !== tag) }
            },
            upsertView: (state, { view }) => {
                if (!state) {
                    return state
                }
                const exists = state.views.some((existing) => existing.id === view.id)
                return {
                    ...state,
                    views: exists
                        ? state.views.map((existing) => (existing.id === view.id ? view : existing))
                        : [...state.views, view],
                }
            },
            renameView: (state, { id, name }) =>
                state
                    ? { ...state, views: state.views.map((view) => (view.id === id ? { ...view, name } : view)) }
                    : state,
            deleteView: (state, { id }) =>
                state ? { ...state, views: state.views.filter((view) => view.id !== id) } : state,
        },
        saving: [false, { persist: () => true, persistDone: () => false }],
        columns: [
            DEFAULT_COLUMNS,
            {
                setColumns: (_, { columns }) => normalizeColumns(columns),
                toggleColumn: (state, { column, shown }) =>
                    COLUMN_ORDER.filter((key) => (key === column ? shown : state.includes(key))),
            },
        ],
        activeViewId: ['all', { setActiveViewId: (_, { id }) => id, applyView: (_, { view }) => view.id }],
        selectedIds: [
            [] as string[],
            {
                setSelectedIds: (_, { ids }) => ids,
                toggleSelected: (state, { ids, selected }) =>
                    selected ? Array.from(new Set([...state, ...ids])) : state.filter((id) => !ids.includes(id)),
                clearSelection: () => [],
                setLocation: () => [],
            },
        ],
        editingRowKey: [null as string | null, { setEditingRowKey: (_, { rowKey }) => rowKey }],
        manageTagsOpen: [false, { setManageTagsOpen: (_, { open }) => open }],
    })),
    selectors({
        scope: [(s) => [s.location], (location: FolderLocation): string[] => scopeOf(location)],
        // Any search or filter looks through the scope folder and everything below it.
        effectiveFlat: [(s) => [s.hasActiveQuery], (hasActiveQuery: boolean) => hasActiveQuery],
        // Workflow templates live in the "New workflow" chooser, not in this list.
        listRows: [
            (s) => [s.rows],
            (rows: FolderRow[]): FolderRow[] => rows.filter((row) => row.kind !== 'workflow_template'),
        ],
        allItems: [(s) => [s.listRows], (rows: FolderRow[]): WorkflowListItem[] => rows.map((row) => row.item)],
        matchingRows: [
            (s) => [s.listRows, s.query, s.facetsVersion],
            (rows: FolderRow[], query: WorkflowQuery): FolderRow[] => {
                const ids = new Set(
                    applyWorkflowQuery(
                        rows.map((row) => row.item),
                        query
                    ).map((item) => item.id)
                )
                return rows.filter((row) => ids.has(row.id))
            },
        ],
        contents: [
            (s) => [s.matchingRows, s.scope, s.effectiveFlat],
            (matchingRows: FolderRow[], scope: string[], effectiveFlat: boolean): ListRow[] => {
                const items = matchingRows
                    .filter((row) =>
                        effectiveFlat
                            ? startsWith(placementOf(row), scope)
                            : placementOf(row).length === scope.length && startsWith(placementOf(row), scope)
                    )
                    .sort((a, b) =>
                        effectiveFlat
                            ? compareTreeOrder(a, b, scope)
                            : (a.kind === b.kind ? 0 : a.kind === 'workflow' ? -1 : 1) ||
                              compareNames(a.item.name, b.item.name)
                    )
                    .map((row): ListRow => ({ rowType: 'item', id: row.id, row }))
                return scope.length ? [{ rowType: 'up', id: 'up', parent: scope.slice(0, -1) }, ...items] : items
            },
        ],
        // Folder rows for layouts without a side tree. Empty in flat mode, where subfolders' items show instead.
        childFolders: [
            (s) => [s.folderPaths, s.matchingRows, s.scope, s.effectiveFlat, s.hasActiveQuery],
            (
                folderPaths: string[][],
                matchingRows: FolderRow[],
                scope: string[],
                effectiveFlat: boolean,
                hasActiveQuery: boolean
            ): Extract<ListRow, { rowType: 'folder' }>[] =>
                effectiveFlat
                    ? []
                    : folderPaths
                          .filter((segments) => segments.length === scope.length + 1 && startsWith(segments, scope))
                          .map((segments) => ({
                              rowType: 'folder' as const,
                              id: `folder:${joinPath(segments)}`,
                              name: segments[segments.length - 1],
                              segments,
                              count: matchingRows.filter((row) => startsWith(placementOf(row), segments)).length,
                          }))
                          .filter((folder) => !hasActiveQuery || folder.count > 0),
        ],
        folderCounts: [
            (s) => [s.matchingRows],
            (matchingRows: FolderRow[]): Record<string, number> => {
                const counts: Record<string, number> = {}
                for (const row of matchingRows) {
                    const placement = placementOf(row)
                    for (let depth = 0; depth <= placement.length; depth++) {
                        const key = joinPath(placement.slice(0, depth))
                        counts[key] = (counts[key] ?? 0) + 1
                    }
                }
                return counts
            },
        ],
        usedByCounts: [
            (s) => [s.listRows],
            (rows: FolderRow[]): Record<string, number> => {
                const counts: Record<string, number> = {}
                for (const row of rows) {
                    if (row.kind !== 'workflow') {
                        continue
                    }
                    const templateIds = new Set(
                        row.item.emailSteps.map((step) => step.libraryTemplateId).filter(Boolean)
                    )
                    templateIds.forEach((id) => (counts[id!] = (counts[id!] ?? 0) + 1))
                }
                return counts
            },
        ],
        vocabulary: [
            (s) => [s.store],
            (store: CombinedStore | null): string[] => {
                const all = new Set<string>([...(store?.pinnedTags ?? []), ...Object.keys(store?.colors ?? {})])
                Object.values(store?.tags ?? {}).forEach((tags) => tags.forEach((tag) => all.add(tag)))
                return Array.from(all).sort()
            },
        ],
        colors: [
            (s) => [s.vocabulary, s.store],
            (vocabulary: string[], store: CombinedStore | null): Record<string, TagColor> =>
                Object.fromEntries(vocabulary.map((tag) => [tag, store?.colors[tag] ?? fallbackTagColor(tag)])),
        ],
        tagUsage: [
            (s) => [s.store, s.rowsById],
            (store: CombinedStore | null, rowsById: Record<string, FolderRow>): Record<string, number> => {
                const counts: Record<string, number> = {}
                for (const [id, tags] of Object.entries(store?.tags ?? {})) {
                    if (rowsById[id]) {
                        tags.forEach((tag) => (counts[tag] = (counts[tag] ?? 0) + 1))
                    }
                }
                return counts
            },
        ],
        views: [
            (s) => [s.store],
            (store: CombinedStore | null): CombinedView[] => [...BUILT_IN_VIEWS, ...(store?.views ?? [])],
        ],
        activeView: [
            (s) => [s.views, s.activeViewId],
            (views: CombinedView[], activeViewId: string): CombinedView =>
                views.find((view) => view.id === activeViewId) ?? views[0],
        ],
        viewState: [
            (s) => [s.filters, s.search, s.scope, s.columns],
            (filters, search, scope, columns): ViewState => ({ filters, search, scope, columns }),
        ],
        activeViewChanges: [
            (s) => [s.activeView, s.viewState, s.user],
            (activeView: CombinedView, viewState: ViewState, user: UserType | null): string[] =>
                viewChanges(activeView, viewState, user),
        ],
        isModified: [(s) => [s.activeViewChanges], (changes: string[]): boolean => changes.length > 0],
        // Saved views are shared by the whole project, so anyone can save them for everyone. Built-ins are fixed.
        canUpdateActiveView: [(s) => [s.activeView], (activeView: CombinedView): boolean => !activeView.builtIn],
        viewCounts: [
            (s) => [s.views, s.listRows, s.user, s.facetsVersion],
            (views: CombinedView[], rows: FolderRow[], user: UserType | null): Record<string, number> =>
                Object.fromEntries(
                    views.map((view) => {
                        // A view pinned to a folder counts what it shows: that folder and everything below it.
                        const scoped =
                            view.folder === null
                                ? rows
                                : rows.filter((row) => startsWith(placementOf(row), splitPath(view.folder!)))
                        const matches = applyWorkflowQuery(
                            scoped.map((row) => row.item),
                            { filters: resolveViewFilters(view.q, user), search: view.text }
                        )
                        return [view.id, matches.length]
                    })
                ),
        ],
        selectedTagCounts: [
            (s) => [s.selectedIds, s.store],
            (selectedIds: string[], store: CombinedStore | null): Record<string, number> => {
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
    listeners(({ actions, values, cache }) => {
        const tagsChanged = (): void => {
            if (values.store) {
                setWorkflowTagsForFacets(values.store.tags)
                setItemTagsForFacets(values.store.tags)
            }
            actions.persist()
        }
        const viewFrom = (id: string, name: string, pinScope: boolean): CombinedView => ({
            id,
            name,
            q: serializeFilters(values.filters),
            text: values.search.trim(),
            folder: pinScope ? joinPath(values.scope) : null,
            columns: values.columns,
            createdBy: values.user?.uuid ?? null,
        })
        return {
            loadStoreSuccess: ({ store }) => {
                setWorkflowTagsForFacets(store?.tags ?? {})
                setItemTagsForFacets(store?.tags ?? {})
            },
            loadStoreFailure: () => {
                lemonToast.error("Couldn't load tags and saved views. Refresh the page to try again.")
            },
            setItemTags: tagsChanged,
            addTagsToSelection: ({ ids, tags }) => {
                lemonToast.success(
                    `Tagged ${ids.length === 1 ? '1 item' : `${ids.length} items`} with ${tags.join(', ')}`
                )
                tagsChanged()
            },
            removeTagsFromSelection: tagsChanged,
            renameTag: ({ from, to }) => {
                const target = normalizeTagName(to)
                if (values.filters.some((filter) => filter.facet === 'tag' && filter.value === from)) {
                    actions.setFilters(
                        values.filters.map((filter) =>
                            filter.facet === 'tag' && filter.value === from ? { ...filter, value: target } : filter
                        )
                    )
                }
                tagsChanged()
            },
            deleteTag: ({ tag }) => {
                if (values.filters.some((filter) => filter.facet === 'tag' && filter.value === tag)) {
                    actions.setFilters(
                        values.filters.filter((filter) => !(filter.facet === 'tag' && filter.value === tag))
                    )
                }
                tagsChanged()
            },
            createTag: () => actions.persist(),
            setTagColor: () => actions.persist(),
            upsertView: () => actions.persist(),
            renameView: () => actions.persist(),
            deleteView: ({ id }) => {
                if (values.activeViewId === id) {
                    actions.applyView(BUILT_IN_VIEWS[0])
                }
                actions.persist()
            },
            setScope: ({ scope }) => actions.setLocation({ type: 'folder', segments: scope }),
            movesSettled: () => actions.clearSelection(),
            // The shared dev stack returns 502 while it reloads, so try the folder tree and the list again.
            loadEntriesFailure: async (_, breakpoint) => {
                await breakpoint(3000)
                actions.loadEntries()
            },
            loadSourcesFailure: async (_, breakpoint) => {
                await breakpoint(3000)
                actions.loadSources()
            },
            persist: async (_, breakpoint) => {
                if (!values.store) {
                    actions.persistDone()
                    return
                }
                await breakpoint(400)
                for (let attempt = 1; ; attempt++) {
                    try {
                        // Read the latest settings first, so keys other features keep there survive the write.
                        const team = await api.get(TEAM_URL)
                        breakpoint()
                        await api.update(TEAM_URL, {
                            extra_settings: writeCombinedStore(team.extra_settings, values.store),
                        })
                        break
                    } catch (error: any) {
                        if (isBreakpoint(error)) {
                            throw error
                        }
                        if (attempt >= 5) {
                            lemonToast.error("Couldn't save your changes. Check your connection and try again.")
                            break
                        }
                        await breakpoint(3000)
                    }
                }
                actions.persistDone()
            },
            applyView: ({ view }) => {
                // Each step below rewrites the URL before this view's id reaches it, so the URL sync must not
                // read the old id back in the meantime.
                cache.applyingView = true
                actions.setFilters(resolveViewFilters(view.q, values.user))
                actions.setSearch(view.text)
                if (view.folder !== null) {
                    actions.setLocation({ type: 'folder', segments: splitPath(view.folder) })
                }
                actions.setColumns(view.columns)
                actions.clearSelection()
                cache.applyingView = false
            },
            resetView: () => actions.applyView(values.activeView),
            saveViewAs: ({ name, pinScope }) => {
                const view = viewFrom(`view-${Date.now().toString(36)}`, name, pinScope)
                actions.upsertView(view)
                actions.setActiveViewId(view.id)
                lemonToast.success(`Saved ${name} as a new view`)
            },
            updateActiveView: () => {
                const current = values.activeView
                actions.upsertView({
                    ...viewFrom(current.id, current.name, current.folder !== null),
                    createdBy: current.createdBy,
                })
                lemonToast.success(`Saved ${current.name} for everyone`)
            },
            createFolderAt: async ({ parent, name }) => {
                const segments = [...parent, name.trim()]
                try {
                    await api.fileSystem.create({
                        id: '',
                        path: joinPath([WORKFLOWS_ROOT, ...segments]),
                        type: 'folder',
                    } as FileSystemEntry)
                } catch {
                    lemonToast.error("Couldn't create the folder. Try again in a moment.")
                    return
                }
                actions.loadEntries()
                actions.setLocation({ type: 'folder', segments })
            },
            // The workflows that send a template can sit in any folder, so this searches everywhere, and a `kind:`
            // pill that would hide workflows goes.
            showWorkflowsUsingTemplate: ({ name }) => {
                actions.setFilters([
                    ...values.filters.filter((filter) => filter.facet !== 'kind' && filter.facet !== 'library'),
                    { facet: 'library', value: name, negated: false },
                ])
                if (values.scope.length) {
                    actions.setScope([])
                }
            },
            startNewWorkflow: () => {
                // The usual chooser opens. Whatever it creates lands in the scope folder with the filter's tags.
                setNewWorkflowContext(
                    values.scope.length ? joinPath([WORKFLOWS_ROOT, ...values.scope]) : null,
                    tagsFromFilters(values.filters)
                )
                newWorkflowLogic.actions.startNewWorkflow()
            },
        }
    }),
    actionToUrl(({ values }) => {
        const buildURL = (): [string, Record<string, any>, Record<string, any>, { replace: boolean }] => {
            const {
                flat: _flat,
                compact: _compact,
                cols: _cols,
                view: _view,
                ...searchParams
            } = router.values.searchParams
            if (values.activeViewId !== 'all') {
                searchParams.view = values.activeViewId
            }
            if (values.columns.join(',') !== DEFAULT_COLUMNS.join(',')) {
                searchParams.cols = values.columns.join(',')
            }
            return [router.values.location.pathname, searchParams, router.values.hashParams, { replace: true }]
        }
        return {
            setColumns: buildURL,
            toggleColumn: buildURL,
            setActiveViewId: buildURL,
            applyView: buildURL,
        }
    }),
    urlToAction(({ actions, values, cache }) => {
        const sync = (_: Record<string, string | undefined>, searchParams: Record<string, any>): void => {
            if (cache.applyingView) {
                return
            }
            const view = searchParams.view ? String(searchParams.view) : 'all'
            if (view !== values.activeViewId) {
                actions.setActiveViewId(view)
            }
            const columns = searchParams.cols ? normalizeColumns(String(searchParams.cols).split(',')) : DEFAULT_COLUMNS
            if (columns.join(',') !== values.columns.join(',')) {
                actions.setColumns(columns)
            }
        }
        return { [urls.workflows()]: sync, [urls.workflows('workflows')]: sync }
    }),
    afterMount(({ actions }) => {
        actions.loadStore()
    }),
])
