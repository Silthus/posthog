import type { WorkflowViewApi, WorkflowViewFilterApi, WorkflowViewStateApi } from '../../generated/api.schemas'
import { WorkflowViewFacetEnumApi } from '../../generated/api.schemas'
import { FacetFilter, FacetSearchValue, serializeFacetQuery } from './FacetSearchBar/facetQuery'
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
