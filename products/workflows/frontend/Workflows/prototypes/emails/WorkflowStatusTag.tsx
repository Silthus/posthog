// PROTOTYPE (throwaway): the workflow status as a tag.
import { LemonTag } from '@posthog/lemon-ui'

import type { WorkflowItemStatus } from '../shared/workflowListItems'

const STATUS_TAGS: Record<WorkflowItemStatus, { label: string; type: 'success' | 'default' | 'muted' | 'highlight' }> =
    {
        active: { label: 'Active', type: 'success' },
        draft: { label: 'Draft', type: 'default' },
        archived: { label: 'Archived', type: 'muted' },
        template: { label: 'Template', type: 'highlight' },
    }

export function WorkflowStatusTag({ status }: { status: WorkflowItemStatus }): JSX.Element {
    return <LemonTag type={STATUS_TAGS[status].type}>{STATUS_TAGS[status].label}</LemonTag>
}
