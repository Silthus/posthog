import { useMountedLogic, useValues } from 'kea'

import { Spinner } from 'lib/lemon-ui/Spinner'

import { workflowsSetupLogic } from '../emptyState/workflowsSetupLogic'
import { WorkflowsTable } from '../Workflows/WorkflowsTable'
import { firstRunWelcomeHoldLogic } from './firstRunWelcomeHoldLogic'
import { WorkflowsFirstRunGallery } from './WorkflowsFirstRunGallery'

export function WorkflowsFirstRunTab(): JSX.Element {
    const { setupStatus } = useValues(workflowsSetupLogic)
    useMountedLogic(firstRunWelcomeHoldLogic({ setupStatus }))

    if (setupStatus === 'loading') {
        return (
            <div className="flex justify-center p-8">
                <Spinner className="text-2xl" />
            </div>
        )
    }
    return setupStatus === 'needs-setup' ? <WorkflowsFirstRunGallery /> : <WorkflowsTable />
}
