import { useActions, useValues } from 'kea'

import { LemonBanner } from '@posthog/lemon-ui'

import { workflowsEmailSuspensionLogic } from '../workflowsEmailSuspensionLogic'
import { workflowLogic } from './workflowLogic'

export function WorkflowStartedSendingNotice(): JSX.Element | null {
    const { showStartedSendingNotice } = useValues(workflowLogic)

    // Mount the project's sending status only when a notice is due, so other editor visits skip the request.
    return showStartedSendingNotice ? <StartedSendingBanner /> : null
}

function StartedSendingBanner(): JSX.Element | null {
    const { dismissStartedSendingNotice } = useActions(workflowLogic)
    const { emailSendingSuspended } = useValues(workflowsEmailSuspensionLogic)

    if (emailSendingSuspended) {
        return null
    }

    return (
        <LemonBanner
            type="success"
            action={{
                children: 'Dismiss',
                onClick: dismissStartedSendingNotice,
                'data-attr': 'workflow-started-sending-dismiss',
            }}
        >
            <strong>Started sending.</strong> This workflow was waiting for its email domain and is live now.
        </LemonBanner>
    )
}
