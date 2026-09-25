// PROTOTYPE (throwaway): the tags variant's facets. `tag:` replaces the frame's templates-only facet in every
// variant, and `health:` is new. Both register at module load, which the variant registry triggers.
import api from 'lib/api'

import { registerWorkflowFacet } from '../shared/workflowFacets'
import type { WorkflowListItem } from '../shared/workflowListItems'
import { readTagsStore } from './workflowTagsStore'

let workflowTags: Record<string, string[]> = {}
let requested = false

/** Other variants never mount the tags logic, so the first lookup fetches the stored tags once. */
function requestTagsOnce(): void {
    if (requested) {
        return
    }
    requested = true
    void api
        .get('api/environments/@current/')
        .then((team) => setWorkflowTagsForFacets(readTagsStore(team.extra_settings).tags))
        .catch(() => {
            requested = false
        })
}

/** Tags of a list item: stored tags for a workflow, the template's own tags for a template. */
export function tagsOfItem(item: WorkflowListItem): string[] {
    if (item.kind === 'template') {
        return item.tags
    }
    requestTagsOnce()
    return workflowTags[item.id] ?? []
}

export type WorkflowHealth = 'failing' | 'healthy' | 'idle'

export function healthOfItem(item: WorkflowListItem): WorkflowHealth | null {
    if (item.kind !== 'workflow') {
        return null
    }
    if ((item.metrics?.failed ?? 0) > 0) {
        return 'failing'
    }
    return (item.metrics?.succeeded ?? 0) > 0 ? 'healthy' : 'idle'
}

const HEALTH_LABELS: Record<WorkflowHealth, string> = {
    failing: 'Failing',
    healthy: 'Healthy',
    idle: 'No runs',
}

function registerTagFacet(): void {
    registerWorkflowFacet({
        key: 'tag',
        aliases: ['tags'],
        label: 'Tag',
        description: 'Tags on workflows and templates',
        getValues: tagsOfItem,
        order: 15,
    })
}

/** Swaps in the latest tags. Re-registering the facet tells the shared logic to filter again. */
export function setWorkflowTagsForFacets(tags: Record<string, string[]>): void {
    requested = true
    workflowTags = tags
    registerTagFacet()
}

registerTagFacet()
registerWorkflowFacet({
    key: 'health',
    label: 'Health',
    description: 'Failed runs in the last 7 days',
    getValues: (item) => {
        const health = healthOfItem(item)
        return health ? [health] : []
    },
    formatValue: (value) => HEALTH_LABELS[value as WorkflowHealth] ?? value,
    order: 12,
})
