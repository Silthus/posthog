// PROTOTYPE (throwaway): loads everything the workflows list prototypes need in one go and filters on the
// client. Fine at prototype scale (hundreds of workflows); the real build needs server-side filters.
import {
    MakeLogicType,
    actions,
    afterMount,
    beforeUnmount,
    connect,
    kea,
    listeners,
    path,
    reducers,
    selectors,
} from 'kea'
import { loaders } from 'kea-loaders'
import { actionToUrl, router, urlToAction } from 'kea-router'

import api, { ApiRequest } from 'lib/api'
import { objectsEqual } from 'lib/utils/objects'
import { teamLogic } from 'scenes/teamLogic'
import { urls } from 'scenes/urls'

import type { IntegrationType } from '~/types'

import { hogFlowsMetricsGlobalRetrieve } from '../../../generated/api'
import type { MessageTemplate } from '../../../TemplateLibrary/types'
import type { HogFlow, HogFlowTemplate } from '../../hogflows/types'
import {
    FacetFilter,
    WorkflowQuery,
    applyWorkflowQuery,
    filterKey,
    onWorkflowFacetsChanged,
    parseFilters,
    serializeFilters,
} from './workflowFacets'
import { WorkflowListItem, WorkflowsPrototypeSources, buildWorkflowListItems } from './workflowListItems'

const EMPTY_SOURCES: WorkflowsPrototypeSources = {
    workflows: [],
    workflowTemplates: [],
    libraryTemplates: [],
    emailIntegrations: [],
    metrics: [],
}

const PAGE_SIZE = 500

async function loadAllWorkflows(): Promise<HogFlow[]> {
    const all: HogFlow[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await api.hogFlows.getHogFlows({
            limit: PAGE_SIZE,
            offset,
            type: ['messaging', 'automation', 'loop'],
        })
        all.push(...page.results)
        if (all.length >= page.count || page.results.length === 0) {
            return all
        }
    }
}

async function orEmpty<T>(promise: Promise<T[]>): Promise<T[]> {
    try {
        return await promise
    } catch {
        return []
    }
}

interface workflowsPrototypeLogicValues {
    currentProjectId: number | null
    sources: WorkflowsPrototypeSources
    sourcesLoading: boolean
    hasLoaded: boolean
    filters: FacetFilter[]
    search: string
    facetsVersion: number
    query: WorkflowQuery
    items: WorkflowListItem[]
    workflowItems: WorkflowListItem[]
    templateItems: WorkflowListItem[]
    filteredItems: WorkflowListItem[]
    hasActiveQuery: boolean
}

interface workflowsPrototypeLogicActions {
    loadSources: () => {}
    loadSourcesSuccess: (sources: WorkflowsPrototypeSources) => { sources: WorkflowsPrototypeSources }
    loadSourcesFailure: (error: string) => { error: string }
    addFilter: (filter: FacetFilter) => { filter: FacetFilter }
    removeFilter: (filter: FacetFilter) => { filter: FacetFilter }
    removeLastFilter: () => { value: true }
    setFilters: (filters: FacetFilter[]) => { filters: FacetFilter[] }
    setSearch: (search: string) => { search: string }
    clearAll: () => { value: true }
    facetsChanged: () => { value: true }
}

type workflowsPrototypeLogicType = MakeLogicType<workflowsPrototypeLogicValues, workflowsPrototypeLogicActions>

export const workflowsPrototypeLogic = kea<workflowsPrototypeLogicType>([
    path(['products', 'workflows', 'frontend', 'Workflows', 'prototypes', 'shared', 'workflowsPrototypeLogic']),
    connect(() => ({ values: [teamLogic, ['currentProjectId']] })),
    actions({
        addFilter: (filter: FacetFilter) => ({ filter }),
        removeFilter: (filter: FacetFilter) => ({ filter }),
        removeLastFilter: true,
        setFilters: (filters: FacetFilter[]) => ({ filters }),
        setSearch: (search: string) => ({ search }),
        clearAll: true,
        facetsChanged: true,
    }),
    loaders(({ values }) => ({
        sources: [
            EMPTY_SOURCES,
            {
                loadSources: async () => {
                    const projectId = String(values.currentProjectId)
                    const [workflows, workflowTemplates, libraryTemplates, emailIntegrations, metrics] =
                        await Promise.all([
                            loadAllWorkflows(),
                            orEmpty(api.hogFlowTemplates.getHogFlowTemplates().then((r) => r.results)),
                            orEmpty(api.messaging.getTemplates().then((r) => r.results as MessageTemplate[])),
                            orEmpty(
                                new ApiRequest()
                                    .integrations()
                                    .withQueryString({ kind: 'email' })
                                    .get()
                                    .then((r: { results: IntegrationType[] }) => r.results)
                            ),
                            orEmpty(hogFlowsMetricsGlobalRetrieve(projectId, { after: '-7d' })),
                        ])
                    return {
                        workflows,
                        workflowTemplates: workflowTemplates as HogFlowTemplate[],
                        libraryTemplates,
                        emailIntegrations,
                        metrics,
                    }
                },
            },
        ],
    })),
    reducers({
        hasLoaded: [false, { loadSourcesSuccess: () => true }],
        filters: [
            [] as FacetFilter[],
            {
                addFilter: (state, { filter }) =>
                    state.some((existing) => filterKey(existing) === filterKey(filter)) ? state : [...state, filter],
                removeFilter: (state, { filter }) =>
                    state.filter((existing) => filterKey(existing) !== filterKey(filter)),
                removeLastFilter: (state) => state.slice(0, -1),
                setFilters: (_, { filters }) => filters,
                clearAll: () => [],
            },
        ],
        search: [
            '',
            {
                setSearch: (_, { search }) => search,
                clearAll: () => '',
            },
        ],
        facetsVersion: [0, { facetsChanged: (state) => state + 1 }],
    }),
    selectors({
        query: [(s) => [s.filters, s.search], (filters, search): WorkflowQuery => ({ filters, search })],
        items: [(s) => [s.sources], (sources) => buildWorkflowListItems(sources)],
        workflowItems: [
            (s) => [s.items],
            (items): WorkflowListItem[] => items.filter((item: WorkflowListItem) => item.kind === 'workflow'),
        ],
        templateItems: [
            (s) => [s.items],
            (items): WorkflowListItem[] => items.filter((item: WorkflowListItem) => item.kind === 'template'),
        ],
        filteredItems: [
            (s) => [s.items, s.query, s.facetsVersion],
            // Workflows first, then templates, each newest first. A column sorter in the table overrides this.
            (items, query): WorkflowListItem[] =>
                applyWorkflowQuery(items, query).sort(
                    (a, b) =>
                        (a.kind === b.kind ? 0 : a.kind === 'workflow' ? -1 : 1) ||
                        (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
                ),
        ],
        hasActiveQuery: [(s) => [s.query], (query) => query.filters.length > 0 || query.search.trim().length > 0],
    }),
    listeners(() => ({
        loadSourcesFailure: ({ error }) => {
            console.error('Workflows prototype failed to load', error)
        },
    })),
    actionToUrl(({ values }) => {
        const buildURL = (): [string, Record<string, any>, Record<string, any>, { replace: boolean }] => {
            const { q: _q, text: _text, ...searchParams } = router.values.searchParams
            const q = serializeFilters(values.filters)
            if (q) {
                searchParams.q = q
            }
            if (values.search) {
                searchParams.text = values.search
            }
            return [router.values.location.pathname, searchParams, router.values.hashParams, { replace: true }]
        }
        return {
            addFilter: buildURL,
            removeFilter: buildURL,
            removeLastFilter: buildURL,
            setFilters: buildURL,
            setSearch: buildURL,
            clearAll: buildURL,
        }
    }),
    urlToAction(({ actions, values }) => {
        const sync = (_: Record<string, string | undefined>, searchParams: Record<string, any>): void => {
            const filters = parseFilters(searchParams.q ? String(searchParams.q) : '')
            const search = searchParams.text ? String(searchParams.text) : ''
            if (!objectsEqual(filters, values.filters)) {
                actions.setFilters(filters)
            }
            if (search !== values.search) {
                actions.setSearch(search)
            }
        }
        return { [urls.workflows()]: sync, [urls.workflows('workflows')]: sync }
    }),
    afterMount(({ actions, cache }) => {
        actions.loadSources()
        cache.unsubscribeFacets = onWorkflowFacetsChanged(() => actions.facetsChanged())
    }),
    beforeUnmount(({ cache }) => {
        cache.unsubscribeFacets?.()
    }),
])
