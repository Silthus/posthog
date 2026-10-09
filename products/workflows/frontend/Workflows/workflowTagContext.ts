import { parseFacetQuery } from './WorkflowsListV2/FacetSearchBar/facetQuery'
import { buildWorkflowListFacets } from './WorkflowsListV2/workflowListFacets'

export function workflowTagContext(searchParams: Record<string, unknown>): string[] {
    if (typeof searchParams.tags === 'string') {
        try {
            const tags: unknown = JSON.parse(searchParams.tags)
            return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string' && !!tag) : []
        } catch {
            return []
        }
    }
    return parseFacetQuery(typeof searchParams.q === 'string' ? searchParams.q : '', buildWorkflowListFacets([]))
        .filter((filter) => filter.facet === 'tag' && !filter.negated)
        .map((filter) => filter.value)
}
