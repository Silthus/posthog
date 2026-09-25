// PROTOTYPE (throwaway): the folders variant. Workflows, workflow templates and Library email templates live
// in the project tree (FileSystem rows) under a "Workflows" root. This logic joins those rows onto the shared
// list items on the client, so the prototype needs no `?folder=` API filter.
import { MakeLogicType, actions, afterMount, connect, kea, listeners, path, reducers, selectors } from 'kea'
import { loaders } from 'kea-loaders'
import { actionToUrl, router, urlToAction } from 'kea-router'

import api from 'lib/api'
import { moveToLogic } from 'lib/components/FileSystem/MoveTo/moveToLogic'
import { lemonToast } from 'lib/lemon-ui/LemonToast/LemonToast'
import { urls } from 'scenes/urls'

import { PROJECT_TREE_KEY } from '~/layout/panel-layout/ProjectTree/ProjectTree'
import { MovedItem, projectTreeDataLogic } from '~/layout/panel-layout/ProjectTree/projectTreeDataLogic'
import { escapePath, joinPath, splitPath } from '~/layout/panel-layout/ProjectTree/utils'
import { FileSystemEntry } from '~/queries/schema/schema-general'

import type { MessageTemplate } from '../../../TemplateLibrary/types'
import { WorkflowQuery, applyWorkflowQuery } from '../shared/workflowFacets'
import { WorkflowListItem, WorkflowsPrototypeSources, splitNamePath } from '../shared/workflowListItems'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { setItemFolders } from './folderFacet'

export const WORKFLOWS_ROOT = 'Workflows'
const TREE_TYPES = ['hog_flow', 'hog_flow_template', 'message_template'] as const

export type FolderItemKind = 'workflow' | 'workflow_template' | 'email_template'
export type KindFilter = 'all' | 'workflows' | 'templates'
export type SearchScope = 'folder' | 'everywhere'

/** A folder under the Workflows root, the unfiled bucket, or the virtual Library node. */
export type FolderLocation = { type: 'folder'; segments: string[] } | { type: 'unfiled' } | { type: 'library' }

export interface FolderRow {
    id: string
    item: WorkflowListItem
    kind: FolderItemKind
    entry: FileSystemEntry | null
    /** Folder under the Workflows root. `null` when the item is not filed there. */
    segments: string[] | null
    /** Global and organization templates can't live in a project folder. */
    movable: boolean
}

export type ContentsRow =
    | { rowType: 'folder'; id: string; name: string; segments: string[]; count: number }
    | { rowType: 'item'; id: string; row: FolderRow }

export interface PrefixMove {
    row: FolderRow
    segments: string[]
    newName: string
}

export interface PrefixPlanGroup {
    segments: string[]
    isNew: boolean
    moves: PrefixMove[]
}

interface FolderEntries {
    items: FileSystemEntry[]
    folders: FileSystemEntry[]
}

async function listAll(params: { type: string; parent?: string }): Promise<FileSystemEntry[]> {
    const response = await api.fileSystem.list({ ...params, limit: 2000 })
    return response.results
}

function emailTemplateItem(template: MessageTemplate): WorkflowListItem {
    const email = template.content?.email ?? ({} as MessageTemplate['content']['email'])
    const createdBy = template.created_by ?? null
    return {
        id: template.id,
        kind: 'template',
        name: template.name,
        ...splitNamePath(template.name),
        description: template.description ?? '',
        status: 'template',
        type: 'messaging',
        triggerType: 'none',
        channels: ['email'],
        emailSteps: [
            {
                actionId: template.id,
                stepName: template.name,
                subject: String((email as { subject?: string }).subject ?? ''),
                fromAddress: (email as { from?: string }).from || null,
                fromName: null,
                libraryTemplateId: template.id,
                libraryTemplateName: template.name,
            },
        ],
        owners: [],
        createdBy,
        createdByName: createdBy ? createdBy.first_name || createdBy.email : null,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
        tags: [],
        templateScope: 'library',
        metrics: null,
        actions: [],
        workflow: null,
        template: null,
    }
}

/** Parent folder segments of an entry under the Workflows root, or null outside it. */
function segmentsUnderRoot(entryPath: string): string[] | null {
    const segments = splitPath(entryPath)
    if (segments[0] !== WORKFLOWS_ROOT) {
        return null
    }
    return segments.slice(1, -1)
}

function sameSegments(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((segment, index) => segment === b[index])
}

function startsWithSegments(segments: string[], prefix: string[]): boolean {
    return prefix.every((segment, index) => segments[index] === segment)
}

export function locationToParam(location: FolderLocation): string | undefined {
    if (location.type === 'unfiled') {
        return ':unfiled'
    }
    if (location.type === 'library') {
        return ':library'
    }
    return location.segments.length ? joinPath(location.segments) : undefined
}

function paramToLocation(param: string | undefined): FolderLocation {
    if (param === ':unfiled') {
        return { type: 'unfiled' }
    }
    if (param === ':library') {
        return { type: 'library' }
    }
    return { type: 'folder', segments: splitPath(param ?? '') }
}

export function locationKey(location: FolderLocation): string {
    return location.type === 'folder' ? `folder:${joinPath(location.segments)}` : location.type
}

function rowInLocation(row: FolderRow, location: FolderLocation, recursive: boolean): boolean {
    if (location.type === 'unfiled') {
        return row.segments === null && row.kind === 'workflow'
    }
    if (location.type === 'library') {
        return row.segments === null && row.kind !== 'workflow'
    }
    if (row.segments === null) {
        return false
    }
    return recursive
        ? startsWithSegments(row.segments, location.segments)
        : sameSegments(row.segments, location.segments)
}

interface foldersVariantLogicValues {
    sources: WorkflowsPrototypeSources
    items: WorkflowListItem[]
    query: WorkflowQuery
    hasActiveQuery: boolean
    hasLoaded: boolean
    entries: FolderEntries
    entriesLoading: boolean
    location: FolderLocation
    scope: SearchScope
    kindFilter: KindFilter
    selectedIds: string[]
    prefixModalOpen: boolean
    stripPrefixes: boolean
    applyingPrefixPlan: boolean
    rows: FolderRow[]
    rowsById: Record<string, FolderRow>
    folderPaths: string[][]
    matchingRows: FolderRow[]
    contents: ContentsRow[]
    showFolderColumn: boolean
    selectedRows: FolderRow[]
    prefixPlan: PrefixPlanGroup[]
    prefixMoveCount: number
}

interface foldersVariantLogicActions {
    loadEntries: () => {}
    loadEntriesSuccess: (entries: FolderEntries) => { entries: FolderEntries }
    loadEntriesFailure: (error: string) => { error: string }
    setLocation: (location: FolderLocation) => { location: FolderLocation }
    setScope: (scope: SearchScope) => { scope: SearchScope }
    setKindFilter: (kindFilter: KindFilter) => { kindFilter: KindFilter }
    toggleSelected: (id: string) => { id: string }
    setSelectedIds: (ids: string[]) => { ids: string[] }
    moveRows: (ids: string[]) => { ids: string[] }
    createFolder: (name: string) => { name: string }
    openPrefixModal: () => { value: true }
    closePrefixModal: () => { value: true }
    setStripPrefixes: (stripPrefixes: boolean) => { stripPrefixes: boolean }
    applyPrefixPlan: () => { value: true }
    prefixPlanApplied: () => { value: true }
    movesSettled: (moved: MovedItem[]) => { moved: MovedItem[] }
    loadSourcesSuccess: (sources: WorkflowsPrototypeSources) => { sources: WorkflowsPrototypeSources }
    moveItems: (
        moves: { item: FileSystemEntry; newPath: string }[],
        force: boolean,
        projectTreeLogicKey: string
    ) => { moves: { item: FileSystemEntry; newPath: string }[]; force: boolean; projectTreeLogicKey: string }
    openMoveToModal: (items: FileSystemEntry[]) => { items: FileSystemEntry[] }
}

type foldersVariantLogicType = MakeLogicType<foldersVariantLogicValues, foldersVariantLogicActions>

export const foldersVariantLogic = kea<foldersVariantLogicType>([
    path(['products', 'workflows', 'frontend', 'Workflows', 'prototypes', 'folders', 'foldersVariantLogic']),
    connect(() => ({
        values: [workflowsPrototypeLogic, ['sources', 'items', 'query', 'hasActiveQuery', 'hasLoaded']],
        actions: [
            projectTreeDataLogic,
            ['movesSettled', 'moveItems'],
            moveToLogic,
            ['openMoveToModal'],
            workflowsPrototypeLogic,
            ['loadSourcesSuccess'],
        ],
    })),
    actions({
        setLocation: (location: FolderLocation) => ({ location }),
        setScope: (scope: SearchScope) => ({ scope }),
        setKindFilter: (kindFilter: KindFilter) => ({ kindFilter }),
        toggleSelected: (id: string) => ({ id }),
        setSelectedIds: (ids: string[]) => ({ ids }),
        moveRows: (ids: string[]) => ({ ids }),
        createFolder: (name: string) => ({ name }),
        openPrefixModal: true,
        closePrefixModal: true,
        setStripPrefixes: (stripPrefixes: boolean) => ({ stripPrefixes }),
        applyPrefixPlan: true,
        prefixPlanApplied: true,
    }),
    loaders({
        entries: [
            { items: [], folders: [] } as FolderEntries,
            {
                loadEntries: async () => {
                    const [items, folders] = await Promise.all([
                        Promise.all(TREE_TYPES.map((type) => listAll({ type }))).then((lists) => lists.flat()),
                        listAll({ type: 'folder', parent: WORKFLOWS_ROOT }),
                    ])
                    return { items, folders }
                },
            },
        ],
    }),
    reducers({
        location: [{ type: 'folder', segments: [] } as FolderLocation, { setLocation: (_, { location }) => location }],
        scope: ['folder' as SearchScope, { setScope: (_, { scope }) => scope }],
        kindFilter: ['all' as KindFilter, { setKindFilter: (_, { kindFilter }) => kindFilter }],
        selectedIds: [
            [] as string[],
            {
                toggleSelected: (state, { id }) =>
                    state.includes(id) ? state.filter((existing) => existing !== id) : [...state, id],
                setSelectedIds: (_, { ids }) => ids,
                setLocation: () => [],
            },
        ],
        prefixModalOpen: [false, { openPrefixModal: () => true, closePrefixModal: () => false }],
        stripPrefixes: [false, { setStripPrefixes: (_, { stripPrefixes }) => stripPrefixes }],
        applyingPrefixPlan: [
            false,
            { applyPrefixPlan: () => true, prefixPlanApplied: () => false, closePrefixModal: () => false },
        ],
    }),
    selectors({
        rows: [
            (s) => [s.items, s.sources, s.entries],
            (items: WorkflowListItem[], sources: WorkflowsPrototypeSources, entries: FolderEntries): FolderRow[] => {
                const entryByRef = new Map(entries.items.map((entry) => [`${entry.type}:${entry.ref}`, entry]))
                const toRow = (item: WorkflowListItem, kind: FolderItemKind, type: string): FolderRow => {
                    const entry = entryByRef.get(`${type}:${item.id}`) ?? null
                    return {
                        id: item.id,
                        item,
                        kind,
                        entry,
                        segments: entry ? segmentsUnderRoot(entry.path) : null,
                        movable: !!entry,
                    }
                }
                return [
                    ...items.map((item) =>
                        item.kind === 'workflow'
                            ? toRow(item, 'workflow', 'hog_flow')
                            : toRow(item, 'workflow_template', 'hog_flow_template')
                    ),
                    ...sources.libraryTemplates.map((template) =>
                        toRow(emailTemplateItem(template), 'email_template', 'message_template')
                    ),
                ]
            },
        ],
        rowsById: [
            (s) => [s.rows],
            (rows: FolderRow[]): Record<string, FolderRow> => Object.fromEntries(rows.map((row) => [row.id, row])),
        ],
        folderPaths: [
            (s) => [s.entries, s.rows],
            (entries: FolderEntries, rows: FolderRow[]): string[][] => {
                const seen = new Map<string, string[]>()
                const add = (segments: string[]): void => {
                    for (let depth = 1; depth <= segments.length; depth++) {
                        const prefix = segments.slice(0, depth)
                        seen.set(joinPath(prefix), prefix)
                    }
                }
                entries.folders.forEach((folder) => add(splitPath(folder.path).slice(1)))
                rows.forEach((row) => row.segments && add(row.segments))
                return Array.from(seen.values()).sort((a, b) =>
                    joinPath(a).localeCompare(joinPath(b), undefined, { sensitivity: 'base' })
                )
            },
        ],
        matchingRows: [
            (s) => [s.rows, s.query, s.kindFilter],
            (rows: FolderRow[], query: WorkflowQuery, kindFilter: KindFilter): FolderRow[] => {
                const matchingIds = new Set(
                    applyWorkflowQuery(
                        rows.map((row) => row.item),
                        query
                    ).map((i) => i.id)
                )
                return rows.filter(
                    (row) =>
                        matchingIds.has(row.id) &&
                        (kindFilter === 'all' ||
                            (kindFilter === 'workflows' ? row.kind === 'workflow' : row.kind !== 'workflow'))
                )
            },
        ],
        contents: [
            (s) => [s.matchingRows, s.folderPaths, s.location, s.scope, s.hasActiveQuery, s.kindFilter],
            (
                matchingRows: FolderRow[],
                folderPaths: string[][],
                location: FolderLocation,
                scope: SearchScope,
                hasActiveQuery: boolean,
                kindFilter: KindFilter
            ): ContentsRow[] => {
                const searching = hasActiveQuery
                const byKindThenName = (a: FolderRow, b: FolderRow): number =>
                    (a.kind === b.kind ? 0 : a.kind === 'workflow' ? -1 : b.kind === 'workflow' ? 1 : 0) ||
                    a.item.name.localeCompare(b.item.name, undefined, { sensitivity: 'base' })

                if (searching && scope === 'everywhere') {
                    return matchingRows
                        .slice()
                        .sort(byKindThenName)
                        .map((row) => ({ rowType: 'item', id: row.id, row }))
                }
                const items = matchingRows
                    .filter((row) => rowInLocation(row, location, searching))
                    .sort(byKindThenName)
                    .map((row): ContentsRow => ({ rowType: 'item', id: row.id, row }))
                if (location.type !== 'folder' || searching) {
                    return items
                }
                const childFolders = folderPaths.filter(
                    (segments) =>
                        segments.length === location.segments.length + 1 &&
                        startsWithSegments(segments, location.segments)
                )
                const folders = childFolders.map(
                    (segments): ContentsRow => ({
                        rowType: 'folder',
                        id: `folder:${joinPath(segments)}`,
                        name: segments[segments.length - 1],
                        segments,
                        count: matchingRows.filter((row) => row.segments && startsWithSegments(row.segments, segments))
                            .length,
                    })
                )
                // With a kind filter on, a folder with nothing of that kind is noise.
                return [
                    ...folders.filter(
                        (folder) => kindFilter === 'all' || (folder.rowType === 'folder' && folder.count > 0)
                    ),
                    ...items,
                ]
            },
        ],
        showFolderColumn: [
            (s) => [s.hasActiveQuery, s.location],
            (hasActiveQuery: boolean, location: FolderLocation): boolean =>
                hasActiveQuery || location.type !== 'folder',
        ],
        selectedRows: [
            (s) => [s.selectedIds, s.rowsById],
            (selectedIds: string[], rowsById: Record<string, FolderRow>): FolderRow[] =>
                selectedIds.map((id) => rowsById[id]).filter(Boolean),
        ],
        prefixPlan: [
            (s) => [s.rows, s.folderPaths],
            (rows: FolderRow[], folderPaths: string[][]): PrefixPlanGroup[] => {
                const existing = new Set(folderPaths.map((segments) => joinPath(segments)))
                const groups = new Map<string, PrefixPlanGroup>()
                for (const row of rows) {
                    if (row.segments !== null || !row.entry || row.item.path.length === 0) {
                        continue
                    }
                    const key = joinPath(row.item.path)
                    const group = groups.get(key) ?? { segments: row.item.path, isNew: !existing.has(key), moves: [] }
                    group.moves.push({ row, segments: row.item.path, newName: row.item.leafName })
                    groups.set(key, group)
                }
                return Array.from(groups.values()).sort((a, b) =>
                    joinPath(a.segments).localeCompare(joinPath(b.segments), undefined, { sensitivity: 'base' })
                )
            },
        ],
        prefixMoveCount: [
            (s) => [s.prefixPlan],
            (prefixPlan: PrefixPlanGroup[]): number =>
                prefixPlan.reduce((total, group) => total + group.moves.length, 0),
        ],
    }),
    listeners(({ actions, values, cache }) => ({
        loadEntriesSuccess: () => {
            setItemFolders(new Map(values.rows.map((row) => [row.id, row.segments ?? []])))
        },
        loadSourcesSuccess: () => {
            if (values.entries.items.length > 0) {
                setItemFolders(new Map(values.rows.map((row) => [row.id, row.segments ?? []])))
            }
        },
        movesSettled: async () => {
            if (cache.pendingRenames) {
                const renames: { id: string; name: string }[] = cache.pendingRenames
                cache.pendingRenames = null
                for (const { id, name } of renames) {
                    try {
                        await api.hogFlows.updateHogFlow(id, { name })
                    } catch (error) {
                        console.error('Could not rename workflow', id, error)
                    }
                }
                workflowsPrototypeLogic.actions.loadSources()
            }
            if (values.applyingPrefixPlan) {
                actions.prefixPlanApplied()
                actions.closePrefixModal()
            }
            actions.setSelectedIds([])
            actions.loadEntries()
        },
        moveRows: ({ ids }) => {
            const entries = ids
                .map((id) => values.rowsById[id]?.entry)
                .filter((entry): entry is FileSystemEntry => !!entry)
            if (entries.length === 0) {
                lemonToast.info('Global templates live in the Library and can’t be moved into a folder.')
                return
            }
            actions.openMoveToModal(entries)
        },
        createFolder: async ({ name }) => {
            const parent = values.location.type === 'folder' ? values.location.segments : []
            const segments = [...parent, name.trim()]
            await api.fileSystem.create({
                id: '',
                path: joinPath([WORKFLOWS_ROOT, ...segments]),
                type: 'folder',
            } as FileSystemEntry)
            actions.loadEntries()
            actions.setLocation({ type: 'folder', segments })
        },
        applyPrefixPlan: () => {
            const moves = values.prefixPlan.flatMap((group) =>
                group.moves.map(({ row, segments, newName }) => ({
                    item: row.entry as FileSystemEntry,
                    newPath: `${joinPath([WORKFLOWS_ROOT, ...segments])}/${escapePath(
                        values.stripPrefixes && row.kind === 'workflow' ? newName : row.item.name
                    )}`,
                }))
            )
            if (values.stripPrefixes) {
                cache.pendingRenames = values.prefixPlan.flatMap((group) =>
                    group.moves
                        .filter(({ row }) => row.kind === 'workflow')
                        .map(({ row, newName }) => ({ id: row.id, name: newName }))
                )
            }
            if (moves.length === 0) {
                actions.prefixPlanApplied()
                return
            }
            actions.moveItems(moves, false, PROJECT_TREE_KEY)
        },
    })),
    actionToUrl(({ values }) => {
        const buildURL = (): [string, Record<string, any>, Record<string, any>, { replace: boolean }] => {
            const { folder: _folder, scope: _scope, kind: _kind, ...searchParams } = router.values.searchParams
            const folder = locationToParam(values.location)
            if (folder) {
                searchParams.folder = folder
            }
            if (values.scope === 'everywhere') {
                searchParams.scope = 'all'
            }
            if (values.kindFilter !== 'all') {
                searchParams.kind = values.kindFilter
            }
            return [router.values.location.pathname, searchParams, router.values.hashParams, { replace: false }]
        }
        return { setLocation: buildURL, setScope: buildURL, setKindFilter: buildURL }
    }),
    urlToAction(({ actions, values }) => {
        const sync = (_: Record<string, string | undefined>, searchParams: Record<string, any>): void => {
            const location = paramToLocation(searchParams.folder ? String(searchParams.folder) : undefined)
            if (locationKey(location) !== locationKey(values.location)) {
                actions.setLocation(location)
            }
            const scope: SearchScope = searchParams.scope === 'all' ? 'everywhere' : 'folder'
            if (scope !== values.scope) {
                actions.setScope(scope)
            }
            const kind: KindFilter =
                searchParams.kind === 'workflows' || searchParams.kind === 'templates' ? searchParams.kind : 'all'
            if (kind !== values.kindFilter) {
                actions.setKindFilter(kind)
            }
        }
        return { [urls.workflows()]: sync, [urls.workflows('workflows')]: sync }
    }),
    afterMount(({ actions }) => {
        actions.loadEntries()
    }),
])
