import './combinedFacets'

// PROTOTYPE (throwaway): state for the combined variant. It builds on the folders logic (tree rows, location,
// moves) and the shared pill search, and adds the flat and compact toggles, colored tags and saved views.
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

import { escapePath, joinPath, splitPath } from '~/layout/panel-layout/ProjectTree/utils'
import type { FileSystemEntry } from '~/queries/schema/schema-general'
import type { UserType } from '~/types'

import type { HogFlow } from '../../hogflows/types'
import { NEW_WORKFLOW } from '../../workflowLogic'
import { FolderLocation, FolderRow, WORKFLOWS_ROOT, foldersVariantLogic } from '../folders/foldersVariantLogic'
import { FacetFilter, WorkflowQuery, applyWorkflowQuery, serializeFilters } from '../shared/workflowFacets'
import type { WorkflowListItem } from '../shared/workflowListItems'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { resolveViewFilters } from '../tags/workflowsTagsVariantLogic'
import { setWorkflowTagsForFacets } from '../tags/workflowTagFacets'
import {
    BUILT_IN_VIEWS,
    CombinedStore,
    CombinedView,
    TagColor,
    fallbackTagColor,
    normalizeTagName,
    readCombinedStore,
    writeCombinedStore,
} from './combinedStore'

const TEAM_URL = 'api/environments/@current/'

/** Where a row shows up: a folder under the Workflows root, or the secondary workflow templates node. */
export type Placement = string[] | 'workflow-templates'

/** Unfiled workflows and email templates sit in the root. Unfiled workflow templates get their own node. */
export function placementOf(row: FolderRow): Placement {
    if (row.segments) {
        return row.segments
    }
    return row.kind === 'workflow_template' ? 'workflow-templates' : []
}

function startsWith(segments: string[], prefix: string[]): boolean {
    return prefix.length <= segments.length && prefix.every((segment, index) => segments[index] === segment)
}

export function isTemplatesLocation(location: FolderLocation): boolean {
    return location.type === 'library'
}

export function currentSegments(location: FolderLocation): string[] {
    return location.type === 'folder' ? location.segments : []
}

function rowIn(row: FolderRow, location: FolderLocation, flat: boolean): boolean {
    const placement = placementOf(row)
    if (isTemplatesLocation(location)) {
        return placement === 'workflow-templates'
    }
    if (placement === 'workflow-templates') {
        return false
    }
    const segments = currentSegments(location)
    return flat
        ? startsWith(placement, segments)
        : placement.length === segments.length && startsWith(placement, segments)
}

const KIND_ORDER: Record<FolderRow['kind'], number> = { workflow: 0, email_template: 1, workflow_template: 2 }

export type CombinedRow =
    | { rowType: 'up'; id: string; parent: FolderLocation }
    | { rowType: 'item'; id: string; row: FolderRow }

export function viewFolderToLocation(folder: string): FolderLocation {
    return folder === ':templates' ? { type: 'library' } : { type: 'folder', segments: splitPath(folder) }
}

export function locationToViewFolder(location: FolderLocation): string {
    return isTemplatesLocation(location) ? ':templates' : joinPath(currentSegments(location))
}

function filtersSignature(filters: FacetFilter[]): string {
    return filters
        .map((filter) => serializeFilters([filter]))
        .sort()
        .join(' ')
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
    flat: boolean
    compact: boolean
    selectedIds: string[]
    editingRowKey: string | null
    creatingWorkflow: boolean
    allItems: WorkflowListItem[]
    matchingRows: FolderRow[]
    contents: CombinedRow[]
    hiddenBelowCount: number
    folderCounts: Record<string, number>
    workflowTemplatesCount: number
    vocabulary: string[]
    colors: Record<string, TagColor>
    views: CombinedView[]
    activeViewId: string | null
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
    loadStore: () => {}
    loadStoreSuccess: (store: CombinedStore | null) => { store: CombinedStore | null }
    loadStoreFailure: (error: string) => { error: string }
    setFlat: (flat: boolean) => { flat: boolean }
    setCompact: (compact: boolean) => { compact: boolean }
    setSelectedIds: (ids: string[]) => { ids: string[] }
    toggleSelected: (ids: string[], selected: boolean) => { ids: string[]; selected: boolean }
    clearSelection: () => { value: true }
    setEditingRowKey: (rowKey: string | null) => { rowKey: string | null }
    setWorkflowTags: (workflowId: string, tags: string[]) => { workflowId: string; tags: string[] }
    addTagsToSelection: (ids: string[], tags: string[]) => { ids: string[]; tags: string[] }
    removeTagsFromSelection: (ids: string[], tags: string[]) => { ids: string[]; tags: string[] }
    createTag: (tag: string, color: TagColor) => { tag: string; color: TagColor }
    setTagColor: (tag: string, color: TagColor) => { tag: string; color: TagColor }
    saveView: (view: CombinedView) => { view: CombinedView }
    deleteView: (id: string) => { id: string }
    applyView: (view: CombinedView) => { view: CombinedView }
    createFolderAt: (parent: string[], name: string) => { parent: string[]; name: string }
    createWorkflowHere: () => { value: true }
    createWorkflowDone: () => { value: true }
    persist: () => { value: true }
    persistDone: () => { value: true }
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
            ['setFilters', 'setSearch', 'loadSources', 'loadSourcesFailure'],
        ],
    })),
    actions({
        setFlat: (flat: boolean) => ({ flat }),
        setCompact: (compact: boolean) => ({ compact }),
        setSelectedIds: (ids: string[]) => ({ ids }),
        toggleSelected: (ids: string[], selected: boolean) => ({ ids, selected }),
        clearSelection: true,
        setEditingRowKey: (rowKey: string | null) => ({ rowKey }),
        setWorkflowTags: (workflowId: string, tags: string[]) => ({ workflowId, tags }),
        addTagsToSelection: (ids: string[], tags: string[]) => ({ ids, tags }),
        removeTagsFromSelection: (ids: string[], tags: string[]) => ({ ids, tags }),
        createTag: (tag: string, color: TagColor) => ({ tag, color }),
        setTagColor: (tag: string, color: TagColor) => ({ tag, color }),
        saveView: (view: CombinedView) => ({ view }),
        deleteView: (id: string) => ({ id }),
        applyView: (view: CombinedView) => ({ view }),
        createFolderAt: (parent: string[], name: string) => ({ parent, name }),
        createWorkflowHere: true,
        createWorkflowDone: true,
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
            setWorkflowTags: (state, { workflowId, tags }) => (state ? withTags(state, { [workflowId]: tags }) : state),
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
                    colors: { ...state.colors, [name]: color },
                    pinnedTags: state.pinnedTags.includes(name) ? state.pinnedTags : [...state.pinnedTags, name],
                }
            },
            setTagColor: (state, { tag, color }) =>
                state ? { ...state, colors: { ...state.colors, [tag]: color } } : state,
            saveView: (state, { view }) => {
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
            deleteView: (state, { id }) =>
                state ? { ...state, views: state.views.filter((view) => view.id !== id) } : state,
        },
        saving: [false, { persist: () => true, persistDone: () => false }],
        flat: [false, { setFlat: (_, { flat }) => flat }],
        compact: [false, { persist: true, prefix: 'combined' }, { setCompact: (_, { compact }) => compact }],
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
        creatingWorkflow: [false, { createWorkflowHere: () => true, createWorkflowDone: () => false }],
    })),
    selectors({
        allItems: [(s) => [s.rows], (rows: FolderRow[]): WorkflowListItem[] => rows.map((row) => row.item)],
        matchingRows: [
            (s) => [s.rows, s.query, s.facetsVersion],
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
            (s) => [s.matchingRows, s.location, s.flat],
            (matchingRows: FolderRow[], location: FolderLocation, flat: boolean): CombinedRow[] => {
                const items = matchingRows
                    .filter((row) => rowIn(row, location, flat))
                    .sort(
                        (a, b) =>
                            KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
                            a.item.name.localeCompare(b.item.name, undefined, { sensitivity: 'base' })
                    )
                    .map((row): CombinedRow => ({ rowType: 'item', id: row.id, row }))
                const segments = currentSegments(location)
                if (!isTemplatesLocation(location) && segments.length === 0) {
                    return items
                }
                const parent: FolderLocation = isTemplatesLocation(location)
                    ? { type: 'folder', segments: [] }
                    : { type: 'folder', segments: segments.slice(0, -1) }
                return [{ rowType: 'up', id: 'up', parent }, ...items]
            },
        ],
        hiddenBelowCount: [
            (s) => [s.matchingRows, s.location, s.flat],
            (matchingRows: FolderRow[], location: FolderLocation, flat: boolean): number =>
                flat || isTemplatesLocation(location)
                    ? 0
                    : matchingRows.filter((row) => rowIn(row, location, true) && !rowIn(row, location, false)).length,
        ],
        folderCounts: [
            (s) => [s.matchingRows],
            (matchingRows: FolderRow[]): Record<string, number> => {
                const counts: Record<string, number> = {}
                for (const row of matchingRows) {
                    const placement = placementOf(row)
                    if (placement === 'workflow-templates') {
                        continue
                    }
                    for (let depth = 0; depth <= placement.length; depth++) {
                        const key = joinPath(placement.slice(0, depth))
                        counts[key] = (counts[key] ?? 0) + 1
                    }
                }
                return counts
            },
        ],
        workflowTemplatesCount: [
            (s) => [s.matchingRows],
            (matchingRows: FolderRow[]): number =>
                matchingRows.filter((row) => placementOf(row) === 'workflow-templates').length,
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
        views: [
            (s) => [s.store],
            (store: CombinedStore | null): CombinedView[] => [...BUILT_IN_VIEWS, ...(store?.views ?? [])],
        ],
        activeViewId: [
            (s) => [s.views, s.filters, s.search, s.location, s.user],
            (
                views: CombinedView[],
                filters: FacetFilter[],
                search: string,
                location: FolderLocation,
                user: UserType | null
            ): string | null => {
                const current = filtersSignature(filters)
                const folder = locationToViewFolder(location)
                const match = views.find(
                    (view) =>
                        filtersSignature(resolveViewFilters(view.q, user)) === current &&
                        view.text === search.trim() &&
                        (view.folder === null || view.folder === folder)
                )
                return match?.id ?? null
            },
        ],
        viewCounts: [
            (s) => [s.views, s.rows, s.user, s.facetsVersion],
            (views: CombinedView[], rows: FolderRow[], user: UserType | null): Record<string, number> =>
                Object.fromEntries(
                    views.map((view) => {
                        // A view pinned to a folder counts what it shows there: that folder, and its subfolders when flat.
                        const scoped =
                            view.folder === null
                                ? rows
                                : rows.filter((row) => rowIn(row, viewFolderToLocation(view.folder!), !!view.flat))
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
    listeners(({ actions, values }) => {
        const tagsChanged = (): void => {
            if (values.store) {
                setWorkflowTagsForFacets(values.store.tags)
            }
            actions.persist()
        }
        return {
            loadStoreSuccess: ({ store }) => {
                setWorkflowTagsForFacets(store?.tags ?? {})
            },
            loadStoreFailure: () => {
                lemonToast.error("Couldn't load tags and saved views. Refresh the page to try again.")
            },
            setWorkflowTags: tagsChanged,
            addTagsToSelection: ({ ids, tags }) => {
                lemonToast.success(
                    `Tagged ${ids.length === 1 ? '1 item' : `${ids.length} items`} with ${tags.join(', ')}`
                )
                tagsChanged()
            },
            removeTagsFromSelection: tagsChanged,
            createTag: () => actions.persist(),
            setTagColor: () => actions.persist(),
            saveView: () => actions.persist(),
            deleteView: () => actions.persist(),
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
                actions.setFilters(resolveViewFilters(view.q, values.user))
                actions.setSearch(view.text)
                if (view.folder !== null) {
                    actions.setLocation(viewFolderToLocation(view.folder))
                } else if (view.builtIn && view.flat) {
                    // Built-in views start from everything. The tab stays active while you narrow it with the tree.
                    actions.setLocation({ type: 'folder', segments: [] })
                }
                if (view.flat !== undefined) {
                    actions.setFlat(view.flat)
                }
                if (view.compact !== undefined) {
                    actions.setCompact(view.compact)
                }
                actions.clearSelection()
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
            createWorkflowHere: async () => {
                const segments = isTemplatesLocation(values.location) ? [] : currentSegments(values.location)
                const { actions: steps, edges, conversion, exit_condition } = NEW_WORKFLOW
                try {
                    // Hog flows don't accept `_create_in_folder`, so create a draft and move its tree row.
                    const created = await api.hogFlows.createHogFlow({
                        name: 'Untitled workflow',
                        actions: steps,
                        edges,
                        conversion,
                        exit_condition,
                        status: 'draft',
                    } as Partial<HogFlow>)
                    if (segments.length) {
                        const { results } = await api.fileSystem.list({ type: 'hog_flow', ref: created.id })
                        const entry = results[0]
                        if (entry?.id) {
                            await api.fileSystem.move(
                                entry.id,
                                `${joinPath([WORKFLOWS_ROOT, ...segments])}/${escapePath(created.name)}`
                            )
                        }
                    }
                    router.actions.push(urls.workflow(created.id, 'workflow'))
                } catch {
                    lemonToast.error("Couldn't create the workflow. Try again in a moment.")
                }
                actions.createWorkflowDone()
            },
        }
    }),
    actionToUrl(({ values }) => ({
        setFlat: () => {
            const { flat: _flat, ...searchParams } = router.values.searchParams
            return [
                router.values.location.pathname,
                values.flat ? { ...searchParams, flat: 1 } : searchParams,
                router.values.hashParams,
                { replace: true },
            ]
        },
    })),
    urlToAction(({ actions, values }) => {
        const sync = (_: Record<string, string | undefined>, searchParams: Record<string, any>): void => {
            const flat = !!searchParams.flat
            if (flat !== values.flat) {
                actions.setFlat(flat)
            }
        }
        return { [urls.workflows()]: sync, [urls.workflows('workflows')]: sync }
    }),
    afterMount(({ actions }) => {
        actions.loadStore()
    }),
])
