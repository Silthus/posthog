import { MakeLogicType, actions, afterMount, connect, kea, listeners, path, reducers, selectors } from 'kea'
import { loaders } from 'kea-loaders'
import { router, urlToAction } from 'kea-router'

import { lemonToast } from '@posthog/lemon-ui'

import type { BulkTagAction, BulkUpdateTagsResult } from 'lib/components/BulkActions/BulkUpdateTagsForm'
import { teamLogic } from 'scenes/teamLogic'
import { urls } from 'scenes/urls'
import { userLogic } from 'scenes/userLogic'

import type { UserType } from '~/types'

import {
    messagingTemplatesList,
    messagingTemplatesPartialUpdate,
    messagingTemplatesBulkUpdateTagsCreate,
} from 'products/messaging/frontend/generated/api'
import type { MessageTemplateApi } from 'products/messaging/frontend/generated/api.schemas'
import {
    hogFlowsCreate,
    hogFlowsBulkUpdateTagsCreate,
    hogFlowsPartialUpdate,
    hogFlowsMetricsGlobalRetrieve,
    hogFlowsRetrieve,
    hogFlowsSummariesList,
} from 'products/workflows/frontend/generated/api'
import type { HogFlowListSummaryApi, WorkflowStatsRowApi } from 'products/workflows/frontend/generated/api.schemas'

import { prepareWorkflowDuplicate } from '../workflowDuplication'
import {
    confirmArchiveWorkflow,
    confirmDeleteWorkflow,
    restoreWorkflowToDraft,
    setWorkflowStatus,
    WorkflowRowAction,
    workflowActionErrorDetail,
} from '../workflowRowActions'
import type { WorkflowTemplateTypeFilter } from '../workflowTypeFilters'
import {
    FacetDefinition,
    FacetFilter,
    FacetSearchValue,
    MatchesText,
    createFacetMatcher,
    parseFacetQuery,
    serializeFacetQuery,
} from './FacetSearchBar/facetQuery'
import { buildWorkflowListFacets, matchesWorkflowListText } from './workflowListFacets'
import {
    LIST_TYPES,
    DEFAULT_COLUMNS,
    OPTIONAL_COLUMNS,
    OptionalColumn,
    STATUS_LABELS,
    TRIGGER_LABELS,
    TYPE_LABELS,
} from './workflowListLabels'
import { WorkflowListRow, WorkflowLibraryRow, buildWorkflowListRows, buildEmailTemplateRows } from './workflowListRows'

const WORKFLOWS_PAGE_TYPES = LIST_TYPES.join(',')
const PAGE_LIMIT = 500
// A `next` link that never ends shows the load error instead of looping.
const MAX_PAGES = 40
const MIN_SERVER_SEARCH_LENGTH = 3
const SERVER_SEARCH_DEBOUNCE_MS = 300

export interface ServerSearchResult {
    text: string
    ids: string[]
    failed: boolean
}

/** `pending` while a server search for the current text is debouncing or in flight. */
export type ServerSearchStatus = 'off' | 'pending' | 'done' | 'failed'

const EMPTY_VALUE: FacetSearchValue = { filters: [], text: '' }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LEGACY_PARAMS = ['status', 'type', 'trigger_type', 'created_by', 'search', 'page'] as const
const LEGACY_VALUES: Record<string, (value: string) => boolean> = {
    status: (value) => value in STATUS_LABELS,
    type: (value) => value in TYPE_LABELS,
    trigger: (value) => value in TRIGGER_LABELS,
    'created-by': (value) => UUID_PATTERN.test(value),
}

// Parsing only needs facet keys and aliases, which don't depend on the loaded rows.
const QUERY_FACETS = buildWorkflowListFacets([])

/** Follows `next` to the end. Rows are keyed by id, because a row created mid-load shifts later offsets. */
async function loadAllPages<T extends { id: string }>(
    fetchPage: (offset: number | undefined) => Promise<{ results: T[]; next?: string | null }>
): Promise<T[]> {
    const byId = new Map<string, T>()
    let offset: number | undefined = undefined
    for (let pages = 0; pages < MAX_PAGES; pages++) {
        const page = await fetchPage(offset)
        for (const row of page.results) {
            byId.set(row.id, byId.get(row.id) ?? row)
        }
        const nextOffset = page.next ? new URL(page.next, window.location.origin).searchParams.get('offset') : null
        if (!nextOffset || !page.results.length) {
            return [...byId.values()]
        }
        offset = Number(nextOffset)
    }
    throw new Error(`Stopped loading after ${MAX_PAGES} pages`)
}

/** Reads a param as written. kea-router turns number-like values such as `007` into numbers. */
function rawSearchParam(name: string): string {
    return new URLSearchParams(router.values.location.search).get(name) ?? ''
}

function withFacetParams(searchParams: Record<string, unknown>, value: FacetSearchValue): Record<string, unknown> {
    const next: Record<string, unknown> = { ...searchParams }
    delete next.q
    delete next.text
    const q = serializeFacetQuery(value.filters)
    const text = value.text.trim()
    if (q || searchParams.view) {
        next.q = q
    }
    if (text || searchParams.view) {
        next.text = text
    }
    return next
}

/** Reads the filter params the flag-off list writes, so bookmarked links keep working. */
function legacyParamsToValue(searchParams: Record<string, unknown>): FacetSearchValue {
    const filters: FacetFilter[] = []
    const pairs: [string, string][] = [
        ['status', 'status'],
        ['type', 'type'],
        ['trigger_type', 'trigger'],
        ['created_by', 'created-by'],
    ]
    for (const [param, facet] of pairs) {
        const raw = searchParams[param]
        const value = raw === undefined || raw === null ? '' : String(raw)
        if (value && LEGACY_VALUES[facet](value)) {
            filters.push({ facet, value, negated: false })
        }
    }
    return { filters, text: rawSearchParam('search') }
}

// Generated by kea-typegen. Update if you're an agent, ignore if you're human.
export interface workflowsListV2LogicValues {
    currentTeamId: number | null // teamLogic
    user: UserType | null // userLogic
    bulkTagsResult: BulkUpdateTagsResult | null
    bulkTagsResultLoading: boolean
    emailTemplates: MessageTemplateApi[] | null
    emailTemplatesLoadFailed: boolean
    emailTemplatesLoading: boolean
    facets: FacetDefinition<WorkflowLibraryRow>[]
    filteredRows: WorkflowLibraryRow[]
    hasHealthFilter: boolean
    isUnfilteredAutomationView: boolean
    listLoaded: boolean
    loadFailed: boolean
    matchesText: MatchesText<WorkflowLibraryRow>
    metrics: WorkflowStatsRowApi[] | null
    metricsLoaded: boolean
    metricsLoading: boolean
    pendingRowActions: Record<string, WorkflowRowAction>
    requestedSearchText: string | null
    rows: WorkflowLibraryRow[]
    serverSearch: ServerSearchResult | null
    serverSearchLoading: boolean
    serverSearchStatus: ServerSearchStatus
    shownColumns: OptionalColumn[]
    templateTypeFilter: WorkflowTemplateTypeFilter
    value: FacetSearchValue
    visibleColumns: OptionalColumn[]
    workflows: HogFlowListSummaryApi[] | null
    workflowsLoadFailed: boolean
    workflowsLoading: boolean
}

// Generated by kea-typegen. Update if you're an agent, ignore if you're human.
export interface workflowsListV2LogicActions {
    archiveWorkflow: (row: WorkflowListRow) => {
        row: WorkflowListRow
    }
    bulkUpdateTags: ({ rows, action, tags }: { action: BulkTagAction; rows: WorkflowLibraryRow[]; tags: string[] }) => {
        rows: WorkflowLibraryRow[]
        action: BulkTagAction
        tags: string[]
    }
    bulkUpdateTagsFailure: (
        error: string,
        errorObject?: any
    ) => {
        error: string
        errorObject?: any
    }
    bulkUpdateTagsSuccess: (
        bulkTagsResult: BulkUpdateTagsResult,
        payload?: {
            rows: WorkflowLibraryRow[]
            action: BulkTagAction
            tags: string[]
        }
    ) => {
        bulkTagsResult: BulkUpdateTagsResult
        payload?: {
            rows: WorkflowLibraryRow[]
            action: BulkTagAction
            tags: string[]
        }
    }
    clearFilters: () => {
        value: true
    }
    deleteWorkflow: (row: WorkflowListRow) => {
        row: WorkflowListRow
    }
    duplicateWorkflow: (row: WorkflowListRow) => {
        row: WorkflowListRow
    }
    loadEmailTemplates: () => any
    loadEmailTemplatesFailure: (
        error: string,
        errorObject?: any
    ) => {
        error: string
        errorObject?: any
    }
    loadEmailTemplatesSuccess: (
        emailTemplates: MessageTemplateApi[],
        payload?: any
    ) => {
        emailTemplates: MessageTemplateApi[]
        payload?: any
    }
    loadMetrics: () => {
        value: true
    }
    loadMetricsFailure: (
        error: string,
        errorObject?: any
    ) => {
        error: string
        errorObject?: any
    }
    loadMetricsSuccess: (
        metrics: WorkflowStatsRowApi[] | null,
        payload?: {
            value: true
        }
    ) => {
        metrics: WorkflowStatsRowApi[] | null
        payload?: {
            value: true
        }
    }
    loadWorkflows: () => {
        value: true
    }
    loadWorkflowsFailure: (
        error: string,
        errorObject?: any
    ) => {
        error: string
        errorObject?: any
    }
    loadWorkflowsSuccess: (
        workflows: HogFlowListSummaryApi[],
        payload?: {
            value: true
        }
    ) => {
        workflows: HogFlowListSummaryApi[]
        payload?: {
            value: true
        }
    }
    patchEmailTemplate: (
        id: string,
        patch: Partial<MessageTemplateApi>
    ) => {
        id: string
        patch: Partial<MessageTemplateApi>
    }
    patchWorkflow: (
        id: string,
        patch: Partial<HogFlowListSummaryApi>
    ) => {
        id: string
        patch: Partial<HogFlowListSummaryApi>
    }
    removeWorkflow: (id: string) => {
        id: string
    }
    resetColumns: () => {
        value: true
    }
    restoreWorkflow: (row: WorkflowListRow) => {
        row: WorkflowListRow
    }
    searchWorkflows: (text: string) => string
    searchWorkflowsFailure: (
        error: string,
        errorObject?: any
    ) => {
        error: string
        errorObject?: any
    }
    searchWorkflowsSuccess: (
        serverSearch: ServerSearchResult,
        payload?: string
    ) => {
        serverSearch: ServerSearchResult
        payload?: string
    }
    setRowActionPending: (
        id: string,
        action: WorkflowRowAction | null
    ) => {
        action: WorkflowRowAction | null
        id: string
    }
    setValue: (
        value: FacetSearchValue,
        fromUrl?: boolean
    ) => {
        fromUrl: boolean
        value: FacetSearchValue
    }
    setVisibleColumns: (columns: OptionalColumn[]) => {
        columns: ('created_by' | 'health' | 'last_7_days' | 'owner' | 'trigger' | 'type')[]
    }
    toggleColumn: (column: OptionalColumn) => {
        column: 'created_by' | 'health' | 'last_7_days' | 'owner' | 'trigger' | 'type'
    }
    toggleWorkflowStatus: (row: WorkflowListRow) => {
        row: WorkflowListRow
    }
    updateWorkflowTags: (
        row: WorkflowLibraryRow,
        tags: string[]
    ) => {
        row: WorkflowLibraryRow
        tags: string[]
    }
}

// Generated by kea-typegen. Update if you're an agent, ignore if you're human.
export interface workflowsListV2LogicMeta {
    __keaTypeGenInternalSelectorTypes: {
        loadFailed: (workflowsLoadFailed: any, emailTemplatesLoadFailed: any) => boolean
        hasHealthFilter: (value: FacetSearchValue) => boolean
        metricsLoaded: (metrics: WorkflowStatsRowApi[] | null) => boolean
        isUnfilteredAutomationView: (value: FacetSearchValue) => boolean
        templateTypeFilter: (value: FacetSearchValue) => WorkflowTemplateTypeFilter
        rows: (
            workflows: HogFlowListSummaryApi[] | null,
            metrics: WorkflowStatsRowApi[] | null,
            emailTemplates: MessageTemplateApi[] | null
        ) => WorkflowLibraryRow[]
        listLoaded: (workflows: HogFlowListSummaryApi[] | null, emailTemplates: MessageTemplateApi[] | null) => boolean
        facets: (rows: WorkflowLibraryRow[], user: UserType | null) => FacetDefinition<WorkflowLibraryRow>[]
        matchesText: (serverSearch: ServerSearchResult | null) => MatchesText<WorkflowLibraryRow>
        serverSearchStatus: (value: FacetSearchValue, serverSearch: ServerSearchResult | null) => ServerSearchStatus
        filteredRows: (
            rows: WorkflowLibraryRow[],
            value: FacetSearchValue,
            facets: FacetDefinition<WorkflowLibraryRow>[],
            matchesText: MatchesText<WorkflowLibraryRow>
        ) => WorkflowLibraryRow[]
        shownColumns: (
            visibleColumns: ('created_by' | 'health' | 'last_7_days' | 'owner' | 'trigger' | 'type')[]
        ) => OptionalColumn[]
    }
}

export type workflowsListV2LogicType = MakeLogicType<
    workflowsListV2LogicValues,
    workflowsListV2LogicActions,
    Record<string, any>,
    workflowsListV2LogicMeta
>

export const workflowsListV2Logic = kea<workflowsListV2LogicType>([
    path(['products', 'workflows', 'frontend', 'workflowsListV2Logic']),
    // `hog_flows` is looked up by team, and a child environment's team id differs from its project id.
    connect(() => ({ values: [teamLogic, ['currentTeamId'], userLogic, ['user']] })),
    actions({
        loadWorkflows: true,
        loadMetrics: true,
        updateWorkflowTags: (row: WorkflowLibraryRow, tags: string[]) => ({ row, tags }),
        setValue: (value: FacetSearchValue, fromUrl: boolean = false) => ({ value, fromUrl }),
        clearFilters: true,
        toggleColumn: (column: OptionalColumn) => ({ column }),
        resetColumns: true,
        setVisibleColumns: (columns: OptionalColumn[]) => ({ columns }),
        patchWorkflow: (id: string, patch: Partial<HogFlowListSummaryApi>) => ({ id, patch }),
        patchEmailTemplate: (id: string, patch: Partial<MessageTemplateApi>) => ({ id, patch }),
        removeWorkflow: (id: string) => ({ id }),
        setRowActionPending: (id: string, action: WorkflowRowAction | null) => ({ id, action }),
        toggleWorkflowStatus: (row: WorkflowListRow) => ({ row }),
        duplicateWorkflow: (row: WorkflowListRow) => ({ row }),
        archiveWorkflow: (row: WorkflowListRow) => ({ row }),
        restoreWorkflow: (row: WorkflowListRow) => ({ row }),
        deleteWorkflow: (row: WorkflowListRow) => ({ row }),
    }),
    loaders(({ values, actions, cache }) => ({
        workflows: [
            null as HogFlowListSummaryApi[] | null,
            {
                loadWorkflows: async (_, breakpoint) => {
                    const teamId = String(values.currentTeamId)
                    const workflows = await loadAllPages((offset) =>
                        hogFlowsSummariesList(teamId, { type: WORKFLOWS_PAGE_TYPES, limit: PAGE_LIMIT, offset })
                    )
                    breakpoint()
                    return workflows
                },
            },
        ],
        bulkTagsResult: [
            null as BulkUpdateTagsResult | null,
            {
                bulkUpdateTags: async ({
                    rows,
                    action,
                    tags,
                }: {
                    rows: WorkflowLibraryRow[]
                    action: BulkTagAction
                    tags: string[]
                }) => {
                    const result: BulkUpdateTagsResult = { updated: [], skipped: [] }
                    for (const kind of ['workflow', 'email_template'] as const) {
                        const ids = rows.filter((row) => row.kind === kind).map((row) => row.id)
                        if (!ids.length) {
                            continue
                        }
                        const response =
                            kind === 'workflow'
                                ? await hogFlowsBulkUpdateTagsCreate(String(values.currentTeamId), {
                                      ids,
                                      action,
                                      tags,
                                  })
                                : await messagingTemplatesBulkUpdateTagsCreate(String(values.currentTeamId), {
                                      ids,
                                      action,
                                      tags,
                                  })
                        for (const updated of response.updated) {
                            if (kind === 'workflow') {
                                actions.patchWorkflow(updated.id, { tags: updated.tags })
                            } else {
                                actions.patchEmailTemplate(updated.id, { tags: updated.tags })
                            }
                        }
                        result.updated.push(...response.updated)
                        result.skipped.push(...response.skipped)
                    }
                    return result
                },
            },
        ],
        emailTemplates: [
            null as MessageTemplateApi[] | null,
            {
                loadEmailTemplates: async () =>
                    loadAllPages((offset) =>
                        messagingTemplatesList(String(values.currentTeamId), { limit: PAGE_LIMIT, offset })
                    ),
            },
        ],
        metrics: [
            null as WorkflowStatsRowApi[] | null,
            {
                loadMetrics: async (_, breakpoint) => {
                    try {
                        const metrics = await hogFlowsMetricsGlobalRetrieve(String(values.currentTeamId), {
                            after: '-7d',
                        })
                        breakpoint()
                        return metrics
                    } catch {
                        breakpoint()
                        // The list works without metrics, so a failure shows "Unavailable" in the
                        // metrics columns instead of an error toast.
                        return null
                    }
                },
            },
        ],
        serverSearch: [
            null as ServerSearchResult | null,
            {
                searchWorkflows: async (text: string, breakpoint): Promise<ServerSearchResult> => {
                    await breakpoint(SERVER_SEARCH_DEBOUNCE_MS)
                    cache.searchAbort?.abort()
                    const controller = new AbortController()
                    cache.searchAbort = controller
                    const teamId = String(values.currentTeamId)
                    try {
                        const workflows = await loadAllPages((offset) =>
                            hogFlowsSummariesList(
                                teamId,
                                { type: WORKFLOWS_PAGE_TYPES, search: text, limit: PAGE_LIMIT, offset },
                                { signal: controller.signal }
                            )
                        )
                        breakpoint()
                        return { text, ids: workflows.map((workflow) => workflow.id), failed: false }
                    } catch {
                        // `breakpoint()` drops a search that a newer one aborted. Other failures keep the client
                        // matches and show a notice instead of an error toast.
                        breakpoint()
                        return { text, ids: [], failed: true }
                    }
                },
            },
        ],
    })),
    reducers({
        bulkTagsResult: { bulkUpdateTags: () => null },
        value: [
            EMPTY_VALUE,
            {
                setValue: (_, { value }) => value,
                clearFilters: () => EMPTY_VALUE,
            },
        ],
        requestedSearchText: [
            null as string | null,
            {
                searchWorkflows: (_, text) => text,
                setValue: (state, { value }) => (value.text.trim().length < MIN_SERVER_SEARCH_LENGTH ? null : state),
                clearFilters: () => null,
            },
        ],
        workflowsLoadFailed: [
            false,
            {
                loadWorkflows: () => false,
                loadWorkflowsSuccess: () => false,
                loadWorkflowsFailure: () => true,
            },
        ],
        emailTemplatesLoadFailed: [
            false,
            {
                loadEmailTemplates: () => false,
                loadEmailTemplatesSuccess: () => false,
                loadEmailTemplatesFailure: () => true,
            },
        ],
        visibleColumns: [
            DEFAULT_COLUMNS as OptionalColumn[],
            { persist: true },
            {
                toggleColumn: (state, { column }) =>
                    state.includes(column)
                        ? state.filter((c) => c !== column)
                        : OPTIONAL_COLUMNS.filter((c) => c === column || state.includes(c)),
                resetColumns: () => DEFAULT_COLUMNS,
                setVisibleColumns: (_, { columns }) => OPTIONAL_COLUMNS.filter((column) => columns.includes(column)),
            },
        ],
        pendingRowActions: [
            {} as Record<string, WorkflowRowAction>,
            {
                setRowActionPending: (state, { id, action }) => {
                    const next = { ...state }
                    if (action) {
                        next[id] = action
                    } else {
                        delete next[id]
                    }
                    return next
                },
            },
        ],
        emailTemplates: {
            patchEmailTemplate: (state, { id, patch }) =>
                state?.map((template) => (template.id === id ? { ...template, ...patch } : template)) ?? null,
        },
        workflows: {
            patchWorkflow: (state, { id, patch }) =>
                state && state.map((workflow) => (workflow.id === id ? { ...workflow, ...patch } : workflow)),
            removeWorkflow: (state, { id }) => state && state.filter((workflow) => workflow.id !== id),
        },
    }),
    selectors({
        loadFailed: [
            (s) => [s.workflowsLoadFailed, s.emailTemplatesLoadFailed],
            (workflowsFailed: boolean, templatesFailed: boolean): boolean => workflowsFailed || templatesFailed,
        ],
        hasHealthFilter: [
            (s) => [s.value],
            (value: FacetSearchValue): boolean => value.filters.some((filter) => filter.facet === 'health'),
        ],
        metricsLoaded: [(s) => [s.metrics], (metrics: WorkflowStatsRowApi[] | null): boolean => metrics !== null],
        isUnfilteredAutomationView: [
            (s) => [s.value],
            (value: FacetSearchValue): boolean =>
                !value.text &&
                value.filters.length === 1 &&
                value.filters[0].facet === 'type' &&
                value.filters[0].value === 'automation' &&
                !value.filters[0].negated,
        ],
        templateTypeFilter: [
            (s) => [s.value],
            (value: FacetSearchValue): WorkflowTemplateTypeFilter => {
                const types = value.filters.filter((filter) => filter.facet === 'type')
                const positive = [...new Set(types.filter((filter) => !filter.negated).map((filter) => filter.value))]
                const type = positive.length === 1 ? positive[0] : 'all'
                return (type === 'messaging' || type === 'automation') &&
                    !types.some((filter) => filter.negated && filter.value === type)
                    ? type
                    : 'all'
            },
        ],
        rows: [
            (s) => [s.workflows, s.metrics, s.emailTemplates],
            (
                workflows: HogFlowListSummaryApi[] | null,
                metrics: WorkflowStatsRowApi[] | null,
                templates: MessageTemplateApi[] | null
            ): WorkflowLibraryRow[] => [
                ...buildWorkflowListRows(workflows ?? [], metrics),
                ...buildEmailTemplateRows(templates ?? []),
            ],
        ],
        listLoaded: [
            (s) => [s.workflows, s.emailTemplates],
            (workflows: HogFlowListSummaryApi[] | null, templates: MessageTemplateApi[] | null): boolean =>
                workflows !== null && templates !== null,
        ],
        facets: [
            (s) => [s.rows, s.user],
            (rows: WorkflowLibraryRow[], user: UserType | null): FacetDefinition<WorkflowLibraryRow>[] =>
                buildWorkflowListFacets(rows).map((facet) =>
                    facet.key === 'created-by'
                        ? {
                              ...facet,
                              resolveValue: (value: string): string =>
                                  value.toLowerCase() === 'me' ? (user?.uuid ?? '__signed_out__') : value,
                              formatValue: (value: string): string =>
                                  value === 'me'
                                      ? user?.first_name || user?.email || 'Me'
                                      : (facet.formatValue?.(value) ?? value),
                          }
                        : facet
                ),
        ],
        matchesText: [
            (s) => [s.serverSearch],
            (serverSearch: ServerSearchResult | null): MatchesText<WorkflowLibraryRow> => {
                const serverIds = new Set(serverSearch?.ids ?? [])
                // The server also searches step names and email subjects and bodies, which the rows don't carry.
                return (row, text) =>
                    matchesWorkflowListText(row, text) || (serverSearch?.text === text.trim() && serverIds.has(row.id))
            },
        ],
        serverSearchStatus: [
            (s) => [s.value, s.serverSearch],
            (value: FacetSearchValue, serverSearch: ServerSearchResult | null): ServerSearchStatus => {
                const text = value.text.trim()
                if (text.length < MIN_SERVER_SEARCH_LENGTH) {
                    return 'off'
                }
                if (serverSearch?.text !== text) {
                    return 'pending'
                }
                return serverSearch.failed ? 'failed' : 'done'
            },
        ],
        filteredRows: [
            (s) => [s.rows, s.value, s.facets, s.matchesText],
            (
                rows: WorkflowLibraryRow[],
                value: FacetSearchValue,
                facets: FacetDefinition<WorkflowLibraryRow>[],
                matchesText: MatchesText<WorkflowLibraryRow>
            ): WorkflowLibraryRow[] => rows.filter(createFacetMatcher(value, facets, matchesText)),
        ],
        shownColumns: [
            (s) => [s.visibleColumns],
            // A saved choice can name a column this version doesn't have.
            (visibleColumns: OptionalColumn[]): OptionalColumn[] =>
                OPTIONAL_COLUMNS.filter((column) => visibleColumns.includes(column)),
        ],
    }),
    listeners(({ actions, values }) => {
        /** Runs one network action per row at a time, so a second press can't send a second request. */
        const runRowAction = async (
            row: WorkflowLibraryRow,
            action: WorkflowRowAction,
            run: () => Promise<void>
        ): Promise<void> => {
            if (values.pendingRowActions[row.id]) {
                return
            }
            actions.setRowActionPending(row.id, action)
            try {
                await run()
            } finally {
                actions.setRowActionPending(row.id, null)
            }
        }
        // Not `actionToUrl`: it hands kea-router a URL string, which parses `007` to 7 before writing it back.
        const writeUrl = (): void => {
            if (
                rawSearchParam('q') === serializeFacetQuery(values.value.filters) &&
                rawSearchParam('text') === values.value.text.trim()
            ) {
                return
            }
            router.actions.replace(
                router.values.location.pathname,
                withFacetParams(router.values.searchParams, values.value),
                router.values.hashParams
            )
        }
        return {
            clearFilters: writeUrl,
            setValue: ({ value, fromUrl }) => {
                if (!fromUrl) {
                    writeUrl()
                }
                const text = value.text.trim()
                if (text.length >= MIN_SERVER_SEARCH_LENGTH && values.requestedSearchText !== text) {
                    actions.searchWorkflows(text)
                }
            },
            loadWorkflowsSuccess: () => {
                if (values.metrics === null && !values.metricsLoading) {
                    actions.loadMetrics()
                }
            },
            updateWorkflowTags: async ({ row, tags }) => {
                await runRowAction(row, 'tags', async () => {
                    try {
                        if (row.kind === 'email_template') {
                            const updated = await messagingTemplatesPartialUpdate(
                                String(values.currentTeamId),
                                row.id,
                                { tags }
                            )
                            actions.patchEmailTemplate(row.id, { tags: updated.tags })
                        } else {
                            const updated = await hogFlowsPartialUpdate(String(values.currentTeamId), row.id, { tags })
                            actions.patchWorkflow(row.id, { tags: updated.tags })
                        }
                    } catch (error) {
                        lemonToast.error(`Could not save tags: ${workflowActionErrorDetail(error)}`)
                    }
                })
            },
            toggleWorkflowStatus: async ({ row }) => {
                await runRowAction(row, 'toggle', async () => {
                    const status = row.workflow.status === 'active' ? 'draft' : 'active'
                    const updated = await setWorkflowStatus(String(values.currentTeamId), row.workflow, status)
                    if (updated) {
                        actions.patchWorkflow(row.id, {
                            status: updated.status ?? status,
                            updated_at: updated.updated_at,
                        })
                    }
                })
            },
            duplicateWorkflow: async ({ row }) => {
                await runRowAction(row, 'duplicate', async () => {
                    const teamId = String(values.currentTeamId)
                    try {
                        // The summary row has no step graph, so the copy starts from the full workflow.
                        const full = await hogFlowsRetrieve(teamId, row.id)
                        await hogFlowsCreate(teamId, prepareWorkflowDuplicate(full))
                        lemonToast.success(`Workflow "${row.name}" duplicated`)
                        actions.loadWorkflows()
                    } catch (error) {
                        lemonToast.error(`Failed to duplicate workflow: ${workflowActionErrorDetail(error)}`)
                    }
                })
            },
            archiveWorkflow: ({ row }) => {
                if (values.pendingRowActions[row.id]) {
                    return
                }
                confirmArchiveWorkflow(
                    String(values.currentTeamId),
                    row.workflow,
                    (updated) =>
                        actions.patchWorkflow(row.id, {
                            status: updated.status ?? 'archived',
                            updated_at: updated.updated_at,
                        }),
                    (pending) => actions.setRowActionPending(row.id, pending ? 'archive' : null)
                )
            },
            restoreWorkflow: async ({ row }) => {
                await runRowAction(row, 'restore', async () => {
                    const updated = await restoreWorkflowToDraft(String(values.currentTeamId), row.workflow)
                    if (updated) {
                        actions.patchWorkflow(row.id, {
                            status: updated.status ?? 'draft',
                            updated_at: updated.updated_at,
                        })
                    }
                })
            },
            deleteWorkflow: ({ row }) => {
                if (values.pendingRowActions[row.id]) {
                    return
                }
                confirmDeleteWorkflow(
                    String(values.currentTeamId),
                    row.workflow,
                    () => actions.removeWorkflow(row.id),
                    (pending) => actions.setRowActionPending(row.id, pending ? 'delete' : null)
                )
            },
        }
    }),
    urlToAction(({ actions, values, cache }) => ({
        [urls.workflows()]: (_, searchParams, hashParams) => {
            const current: FacetSearchValue = {
                filters: parseFacetQuery(rawSearchParam('q'), QUERY_FACETS),
                text: rawSearchParam('text'),
            }
            // Old filter links are read once, when the list opens. Later URLs are the list's own.
            if (!cache.legacyChecked) {
                cache.legacyChecked = true
                if (LEGACY_PARAMS.some((param) => param in searchParams)) {
                    const legacy = legacyParamsToValue(searchParams)
                    const next = { ...searchParams }
                    for (const param of LEGACY_PARAMS) {
                        delete next[param]
                    }
                    const merged = {
                        filters: [...current.filters, ...legacy.filters],
                        text: current.text || legacy.text,
                    }
                    router.actions.replace(urls.workflows(), withFacetParams(next, merged), hashParams)
                    return
                }
            }
            if (
                serializeFacetQuery(current.filters) !== serializeFacetQuery(values.value.filters) ||
                current.text !== values.value.text
            ) {
                actions.setValue(current, true)
            }
        },
    })),
    afterMount(({ actions }) => {
        actions.loadEmailTemplates()
        actions.loadWorkflows()
    }),
])
