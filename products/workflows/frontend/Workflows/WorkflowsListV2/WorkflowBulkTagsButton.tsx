import { BulkUpdateTagsButton } from 'lib/components/BulkActions/BulkUpdateTagsButton'

import { WorkflowLibraryRow } from './workflowListRows'
import { workflowsListV2Logic } from './workflowsListV2Logic'

export function WorkflowBulkTagsButton({
    rows,
    onSuccess,
}: {
    rows: WorkflowLibraryRow[]
    onSuccess?: () => void
}): JSX.Element {
    const logic = workflowsListV2Logic()
    return (
        <BulkUpdateTagsButton
            resource="hog_flows"
            onSuccess={onSuccess}
            selectedIds={rows.map((row) => row.id)}
            onSubmit={async (action, tags) => {
                await logic.asyncActions.bulkUpdateTags({ rows, action, tags })
                const result = logic.values.bulkTagsResult
                if (!result) {
                    throw new Error(logic.values.bulkTagsError)
                }
                return result
            }}
        />
    )
}
