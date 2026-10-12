import type { WorkflowViewApi, WorkflowViewFilterApi, WorkflowViewStateApi } from '../../generated/api.schemas'
import { WorkflowViewFacetEnumApi } from '../../generated/api.schemas'
import { FacetFilter, FacetSearchValue, facetFilterKey, serializeFacetQuery } from './FacetSearchBar/facetQuery'
import { DEFAULT_COLUMNS, OPTIONAL_COLUMNS, OptionalColumn } from './workflowListLabels'

export type WorkflowSavedView = Pick<WorkflowViewApi, 'id' | 'name' | 'state' | 'version' | 'default_key'> & {
    builtIn?: boolean
}

export const BUILT_IN_WORKFLOW_VIEWS: WorkflowSavedView[] = [
    {
        id: 'all',
        name: 'All',
        state: { filters: [], text: '', columns: DEFAULT_COLUMNS },
        version: 0,
        default_key: null,
        builtIn: true,
    },
    {
        id: 'needs-attention',
        name: 'Needs attention',
        state: {
            filters: [
                { facet: 'health', value: 'failing', negated: false },
                { facet: 'status', value: 'active', negated: false },
            ],
            text: '',
            columns: ['last_7_days', 'health'],
        },
        version: 0,
        default_key: null,
        builtIn: true,
    },
    {
        id: 'drafts',
        name: 'Drafts',
        state: { filters: [{ facet: 'status', value: 'draft', negated: false }], text: '', columns: DEFAULT_COLUMNS },
        version: 0,
        default_key: null,
        builtIn: true,
    },
]

export function normalizeViewColumns(columns: readonly string[]): OptionalColumn[] {
    return OPTIONAL_COLUMNS.filter((column) => columns.includes(column))
}

export function workflowViewValue(state: WorkflowViewStateApi): FacetSearchValue {
    return {
        filters: state.filters.map((filter) => ({ ...filter, negated: filter.negated ?? false })),
        text: state.text,
    }
}

export function savedViewChanges(
    view: WorkflowSavedView,
    value: FacetSearchValue,
    columns: OptionalColumn[]
): string[] {
    const signature = (filters: FacetSearchValue['filters']): string =>
        filters
            .map((filter) => serializeFacetQuery([filter]))
            .sort()
            .join(' ')
    const changes: string[] = []
    if (signature(workflowViewValue(view.state).filters) !== signature(value.filters)) {
        changes.push('filters')
    }
    if (view.state.text !== value.text.trim()) {
        changes.push('search')
    }
    if (normalizeViewColumns(view.state.columns).join(',') !== columns.join(',')) {
        changes.push('columns')
    }
    return changes
}

export function workflowViewState(value: FacetSearchValue, columns: OptionalColumn[]): WorkflowViewStateApi {
    const allowed = Object.values(WorkflowViewFacetEnumApi)
    const filters = value.filters.filter((filter): filter is FacetFilter & { facet: WorkflowViewFilterApi['facet'] } =>
        allowed.some((facet) => facet === filter.facet)
    )
    return { filters, text: value.text.trim(), columns }
}

function overrides(added: FacetFilter, viewFilter: FacetFilter): boolean {
    const bothPositive = !added.negated && !viewFilter.negated
    const sameValue = added.value.toLowerCase() === viewFilter.value.toLowerCase()
    return added.facet === viewFilter.facet && (bothPositive || sameValue)
}

export function mergeAddedFilters(viewFilters: FacetFilter[], added: FacetFilter[]): FacetFilter[] {
    const kept = viewFilters.filter((viewFilter) => !added.some((filter) => overrides(filter, viewFilter)))
    return [...kept, ...added]
}

export function addedFiltersAfterEdit(
    viewFilters: FacetFilter[],
    previouslyAdded: FacetFilter[],
    filters: FacetFilter[]
): FacetFilter[] {
    const viewKeys = new Set(viewFilters.map(facetFilterKey))
    const addedKeys = new Set(previouslyAdded.map(facetFilterKey))
    return filters.filter((filter) => addedKeys.has(facetFilterKey(filter)) || !viewKeys.has(facetFilterKey(filter)))
}

export function filtersFromView(
    viewFilters: FacetFilter[],
    added: FacetFilter[],
    filters: FacetFilter[]
): FacetFilter[] {
    const viewKeys = new Set(viewFilters.map(facetFilterKey))
    const addedKeys = new Set(added.map(facetFilterKey))
    return filters.filter((filter) => viewKeys.has(facetFilterKey(filter)) && !addedKeys.has(facetFilterKey(filter)))
}
