// PROTOTYPE ONLY. Renders the read-only canvas of a code-managed workflow, and the alternatives
// the prototype switch can pick, so they can be compared from pictures.

import type { Meta, StoryFn } from '@storybook/react'
import { BindLogic, useActions, useValues } from 'kea'
import { useEffect } from 'react'

import { FEATURE_FLAGS } from 'lib/constants'

import { mswDecorator } from '~/mocks/browser'

import { Workflow } from '../../Workflow'
import { workflowLogic } from '../../workflowLogic'
import { hogFlowEditorLogic, type HogFlowEditorMode } from '../hogFlowEditorLogic'
import { type PrototypeReadOnlyMode, setPrototypeReadOnlyMode } from '../prototypeReadOnlyMode'
import type { HogFlow } from '../types'
import { CODE_MANAGED_WORKFLOW, EDITABLE_WORKFLOW, WORKFLOW_ID } from './codeManagedCanvasFixture'

const WORKFLOWS: Record<string, HogFlow> = {
    [WORKFLOW_ID]: CODE_MANAGED_WORKFLOW,
    'storybook-editable-workflow': EDITABLE_WORKFLOW,
}

const meta: Meta = {
    title: 'Products/Workflows/Prototype/Canvas',
    parameters: {
        layout: 'fullscreen',
        mockDate: '2026-09-04 12:00:00',
        testOptions: { waitForLoadersToDisappear: true },
    },
    decorators: [
        mswDecorator({
            get: {
                '/api/environments/:team_id/hog_flows/:id/': ({ params }) => [
                    200,
                    WORKFLOWS[String(params.id)] ?? CODE_MANAGED_WORKFLOW,
                ],
                '/api/environments/:team_id/messaging_categories': { count: 0, results: [] },
            },
            patch: {
                '/api/environments/:team_id/hog_flows/:id/': ({ params }) => [
                    200,
                    WORKFLOWS[String(params.id)] ?? CODE_MANAGED_WORKFLOW,
                ],
            },
        }),
    ],
}
export default meta

/** Selects a step once the workflow is loaded, so the configuration panel is open in the picture. */
function SelectStep({ actionId }: { actionId: string }): null {
    const { logicProps, originalWorkflow } = useValues(workflowLogic)
    const { setSelectedNodeId } = useActions(hogFlowEditorLogic(logicProps))

    useEffect(() => {
        if (originalWorkflow) {
            setSelectedNodeId(actionId)
        }
    }, [actionId, originalWorkflow, setSelectedNodeId])

    return null
}

/** Opens a panel tab once the workflow is loaded, for the tabs that are not the default. */
function SelectPanelTab({ panelMode }: { panelMode: HogFlowEditorMode }): null {
    const { logicProps, originalWorkflow } = useValues(workflowLogic)
    const { setMode } = useActions(hogFlowEditorLogic(logicProps))

    useEffect(() => {
        if (originalWorkflow) {
            setMode(panelMode)
        }
    }, [panelMode, originalWorkflow, setMode])

    return null
}

function Canvas({
    id = WORKFLOW_ID,
    className,
    mode,
    selectedActionId,
    panelMode,
}: {
    id?: string
    className?: string
    mode?: Partial<PrototypeReadOnlyMode>
    selectedActionId?: string
    panelMode?: HogFlowEditorMode
}): JSX.Element {
    setPrototypeReadOnlyMode(mode)
    return (
        <BindLogic logic={workflowLogic} props={{ id }}>
            <div className={`h-screen ${className ?? ''} [&>div]:!h-full [&>div]:!max-h-none`}>
                {selectedActionId && <SelectStep actionId={selectedActionId} />}
                {panelMode && <SelectPanelTab panelMode={panelMode} />}
                <Workflow id={id} />
            </div>
        </BindLogic>
    )
}

const TREE_PARAMS = { featureFlags: [FEATURE_FLAGS.WORKFLOWS_LINEAR_VIEW] }

export const TreeReadOnly: StoryFn = () => <Canvas />
TreeReadOnly.parameters = TREE_PARAMS

export const TreeReadOnlyNarrow: StoryFn = () => <Canvas className="w-[520px] max-w-full" />
TreeReadOnlyNarrow.parameters = TREE_PARAMS

export const GraphReadOnly: StoryFn = () => <Canvas />

export const GraphReadOnlyNarrow: StoryFn = () => <Canvas className="w-[520px] max-w-full" />

export const NodePanel: StoryFn = () => <Canvas selectedActionId="notify-account-team" />
NodePanel.parameters = TREE_PARAMS

export const NodePanelNarrow: StoryFn = () => (
    <Canvas selectedActionId="notify-account-team" className="w-[520px] max-w-full" />
)
NodePanelNarrow.parameters = TREE_PARAMS

export const VariablesReadOnly: StoryFn = () => <Canvas panelMode="variables" />
VariablesReadOnly.parameters = TREE_PARAMS

export const VariablesReadOnlyNarrow: StoryFn = () => <Canvas panelMode="variables" className="w-[520px] max-w-full" />
VariablesReadOnlyNarrow.parameters = TREE_PARAMS

export const EditableComparison: StoryFn = () => <Canvas id="storybook-editable-workflow" />
EditableComparison.parameters = TREE_PARAMS
