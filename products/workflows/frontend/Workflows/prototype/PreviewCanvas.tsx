import { BindLogic, useValues } from 'kea'

import { SpinnerOverlay } from '@posthog/lemon-ui'

import { HogFlowEditor } from '../hogflows/HogFlowEditor'
import { workflowLogic } from '../workflowLogic'

export function PreviewCanvas({ workflowId, className = '' }: { workflowId: string; className?: string }): JSX.Element {
    return (
        <BindLogic logic={workflowLogic} props={{ id: workflowId }}>
            <div
                className={`relative flex min-h-[32rem] flex-1 flex-col [&>div]:!h-full [&>div]:!max-h-none ${className}`}
            >
                <LoadedCanvas />
            </div>
        </BindLogic>
    )
}

function LoadedCanvas(): JSX.Element {
    const { originalWorkflow } = useValues(workflowLogic)
    return originalWorkflow ? <HogFlowEditor key={originalWorkflow.id} isTreeView={false} /> : <SpinnerOverlay />
}
