import { BulkUpdateTagsButton } from 'lib/components/BulkActions/BulkUpdateTagsButton'

import { WorkflowLibraryRow } from './workflowListRows'
import { workflowsListV2Logic } from './workflowsListV2Logic'

export function WorkflowBulkTagsButton({ rows }: { rows: WorkflowLibraryRow[] }): JSX.Element {
    const logic = workflowsListV2Logic()
    return (
        <BulkUpdateTagsButton
            resource="hog_flows"
            selectedIds={rows.map((row) => row.id)}
            onSubmit={async (action, tags) => {
                await logic.asyncActions.bulkUpdateTags({ rows, action, tags })
                const result = logic.values.bulkTagsResult
                if (!result) {
                    throw new Error('Could not update tags. Some items may have been updated; retry to finish.')
                }
                return result
            }}
        />
    )
}
