// PROTOTYPE (ticket #78). Throwaway. Mimics the real WorkflowSceneHeader layout closely enough to
// judge placement and copy, without the scene layout providers the real header needs.
import { useState } from 'react'

import { IconArchive, IconCopy, IconScreen, IconUnlock, IconUpload } from '@posthog/icons'
import { LemonButton, LemonDivider, LemonTag } from '@posthog/lemon-ui'

import { CodeManagedTag } from '../CodeManagedTag'
import { codeManagedReason } from '../codeManagedWorkflow'
import type { HogFlow } from '../hogflows/types'
import { openReleaseFromCodeDialog } from './releaseFromCodeDialog'
import { WorkflowSourceRow } from './WorkflowSourceRow'

export type ReleaseControlPlacement = 'scene-panel' | 'source-row'

export function PrototypeWorkflowHeader({
    workflow: initial,
    releaseControlPlacement = 'scene-panel',
}: {
    workflow: HogFlow
    releaseControlPlacement?: ReleaseControlPlacement
}): JSX.Element {
    const [workflow, setWorkflow] = useState(initial)
    const codeManaged = workflow.managed_by === 'code'
    const reason = codeManaged ? codeManagedReason(workflow) : undefined
    const release = (): void =>
        openReleaseFromCodeDialog(workflow, () => setWorkflow({ ...workflow, managed_by: 'gui' }))

    const releaseButton = (
        <LemonButton
            size="xsmall"
            type="tertiary"
            icon={<IconUnlock />}
            onClick={release}
            data-attr="workflow-release-from-code"
        >
            Stop managing in code
        </LemonButton>
    )

    return (
        <div className="flex flex-col gap-4 p-4 @container">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="mb-0 truncate">{workflow.name}</h2>
                        <CodeManagedTag workflow={workflow} />
                        <LemonTag type={workflow.status === 'active' ? 'success' : 'default'}>
                            {workflow.status === 'active' ? 'Active' : 'Draft'}
                        </LemonTag>
                    </div>
                    <p className="mb-0 text-sm text-secondary">{workflow.description}</p>
                    <WorkflowSourceRow workflow={workflow} />
                    {codeManaged && releaseControlPlacement === 'source-row' && releaseButton}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <LemonButton type="primary" size="small" data-attr="workflow-launch">
                        {workflow.status === 'active' ? 'Disable' : 'Enable'}
                    </LemonButton>
                    <LemonButton type="secondary" size="small" disabledReason={reason} data-attr="workflow-publish">
                        <IconUpload /> Publish draft
                    </LemonButton>
                    <LemonButton
                        type="primary"
                        size="small"
                        disabledReason={reason ?? 'No changes to save'}
                        data-attr="workflow-save"
                    >
                        Save
                    </LemonButton>
                </div>
            </div>
            <LemonDivider />
            <div className="w-60 max-w-full border rounded p-1 flex flex-col gap-px">
                <div className="px-2 py-1 text-xs font-semibold text-secondary uppercase">Scene panel</div>
                <LemonButton size="small" fullWidth icon={<IconCopy />}>
                    Duplicate
                </LemonButton>
                <LemonButton size="small" fullWidth icon={<IconScreen />}>
                    Save as template
                </LemonButton>
                <LemonButton size="small" fullWidth icon={<IconArchive />} status="danger" disabledReason={reason}>
                    Archive
                </LemonButton>
                {codeManaged && releaseControlPlacement === 'scene-panel' && (
                    <LemonButton
                        size="small"
                        fullWidth
                        icon={<IconUnlock />}
                        onClick={release}
                        data-attr="workflow-release-from-code"
                    >
                        Stop managing in code
                    </LemonButton>
                )}
            </div>
        </div>
    )
}
