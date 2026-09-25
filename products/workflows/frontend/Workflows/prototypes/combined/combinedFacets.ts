// PROTOTYPE (throwaway): facets the combined variant adds. `kind:` tells workflows and email templates apart.
// `tag:` gains `/` groups, so `tag:team/*` matches every tag in the team group, and it reads tags on email templates
// too once the combined store has loaded.
import '../folders/folderFacet'
import '../tags/workflowTagFacets'

import { extendWorkflowFacet, registerWorkflowFacet } from '../shared/workflowFacets'
import type { WorkflowListItem } from '../shared/workflowListItems'
import { tagsOfItem } from '../tags/workflowTagFacets'
import { TAG_GROUP_SEPARATOR } from './combinedStore'

export type ItemKindValue = 'workflow' | 'email-template' | 'workflow-template'

export function kindOfItem(item: WorkflowListItem): ItemKindValue {
    if (item.kind === 'workflow') {
        return 'workflow'
    }
    // Library email templates come from the folders logic with a `library` scope and no workflow template.
    return item.templateScope === 'library' && !item.template ? 'email-template' : 'workflow-template'
}

const KIND_LABELS: Record<ItemKindValue, string> = {
    workflow: 'Workflow',
    'email-template': 'Email template',
    'workflow-template': 'Workflow template',
}

registerWorkflowFacet({
    key: 'kind',
    label: 'Kind',
    description: 'Workflow or email template',
    getValues: (item) => [kindOfItem(item)],
    formatValue: (value) => KIND_LABELS[value as ItemKindValue] ?? value,
    order: 11,
})

/** Tags by item id, for workflows and email templates alike. `null` until the combined store loads. */
let itemTags: Record<string, string[]> | null = null

function extendTagFacet(): void {
    extendWorkflowFacet('tag', {
        groupSeparator: TAG_GROUP_SEPARATOR,
        description: 'Tags on workflows and email templates',
        getValues: (item) => (itemTags ? (itemTags[item.id] ?? item.tags) : tagsOfItem(item)),
    })
}

/** Swaps in the latest tags. Re-extending the facet re-registers it, which makes every list filter again. */
export function setItemTagsForFacets(tags: Record<string, string[]>): void {
    itemTags = tags
    extendTagFacet()
}

extendTagFacet()
