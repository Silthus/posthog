// PROTOTYPE ONLY (silthus/posthog#212). Fills the Workflows tab: the first-run home until the welcome
// workflow exists, then the real list with the shared-sender banner above it.
import { useValues } from 'kea'

import { WorkflowsTable } from '../../Workflows/WorkflowsTable'
import { FirstRunHome } from './FirstRunHome'
import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { SharedSenderBanner } from './SharedSenderBanner'

export function FirstRunWorkflowsTab(): JSX.Element {
    const { workflowCreated } = useValues(firstRunPrototypeLogic)

    if (!workflowCreated) {
        return <FirstRunHome />
    }
    return (
        <>
            <SharedSenderBanner />
            <WorkflowsTable />
        </>
    )
}
