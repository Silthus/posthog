// PROTOTYPE (throwaway): facets the combined variant adds. `kind:` tells workflows, email templates and workflow
// templates apart. `tag:` gains `/` groups, so `tag:team/*` matches every tag in the team group, in every variant.
import '../folders/folderFacet'
import '../tags/workflowTagFacets'

import { extendWorkflowFacet, registerWorkflowFacet } from '../shared/workflowFacets'
import type { WorkflowListItem } from '../shared/workflowListItems'
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
    description: 'Workflow, email template or workflow template',
    getValues: (item) => [kindOfItem(item)],
    formatValue: (value) => KIND_LABELS[value as ItemKindValue] ?? value,
    order: 11,
})

extendWorkflowFacet('tag', { groupSeparator: TAG_GROUP_SEPARATOR })
