// PROTOTYPE ONLY (silthus/posthog#212). Fills the Workflows tab: the gallery, the workspace for a picked
// template, then the real list once the workflow exists.
import { useValues } from 'kea'

import { WorkflowsTable } from '../../Workflows/WorkflowsTable'
import { EmailWorkspace } from './EmailWorkspace'
import { FirstRunHome } from './FirstRunHome'
import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { WorkflowNextStep } from './WorkflowNextStep'

export function FirstRunWorkflowsTab(): JSX.Element {
    const { workflowCreated, template } = useValues(firstRunPrototypeLogic)

    if (workflowCreated) {
        return (
            <>
                <WorkflowNextStep />
                <WorkflowsTable />
            </>
        )
    }
    return template ? <EmailWorkspace /> : <FirstRunHome />
}
