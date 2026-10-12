import { expectLogic } from 'kea-test-utils'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import type { WorkflowNodeApi } from 'products/workflows/frontend/generated/api.schemas'

import { EXIT_NODE_ID, NEW_WORKFLOW, TRIGGER_NODE_ID, workflowLogic } from '../../workflowLogic'
import { HogFlowAction, HogFlowEdge } from '../types'
import { stepNativeLogic } from './stepNativeLogic'

const CATALOG: WorkflowNodeApi[] = [
    {
        key: 'feature_flag',
        name: 'Feature flag',
        operations: [
            {
                key: 'set_rollout_percentage',
                name: 'Set rollout percentage',
                description: '',
                inputs_schema: [],
                outcomes: ['done', 'changed_elsewhere', 'needs_approval', 'failed', 'not_permitted'],
            },
            {
                key: 'create_flag',
                name: 'Create flag',
                description: '',
                inputs_schema: [],
                outcomes: ['done', 'already_exists', 'needs_approval', 'failed', 'not_permitted'],
            },
        ],
    },
]

const FLAG_STEP: HogFlowAction = {
    id: 'flag',
    name: 'Feature flag',
    description: '',
    type: 'native',
    created_at: 1,
    updated_at: 1,
    config: { node: 'feature_flag', operation: 'set_rollout_percentage', inputs: {} },
}

const continueEdge = (from: string, to: string): HogFlowEdge => ({ from, to, type: 'continue' })
const outcomeEdge = (outcome: string): HogFlowEdge => ({
    from: FLAG_STEP.id,
    to: EXIT_NODE_ID,
    type: 'branch',
    outcome,
})

describe('stepNativeLogic', () => {
    let wfLogic: ReturnType<typeof workflowLogic.build>
    let logic: ReturnType<typeof stepNativeLogic.build>

    beforeEach(async () => {
        useMocks({ get: { '/api/projects/:team_id/workflow_nodes/': CATALOG } })
        initKeaTests()

        wfLogic = workflowLogic({ id: 'new' })
        wfLogic.mount()
        await expectLogic(wfLogic).toDispatchActions(['loadWorkflowSuccess'])
        wfLogic.actions.setWorkflowInfo({
            actions: [NEW_WORKFLOW.actions[0], FLAG_STEP, NEW_WORKFLOW.actions[1]],
            edges: [continueEdge(TRIGGER_NODE_ID, FLAG_STEP.id), continueEdge(FLAG_STEP.id, EXIT_NODE_ID)],
        })

        logic = stepNativeLogic({ workflowLogicProps: wfLogic.props, actionId: FLAG_STEP.id })
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadWorkflowNodesSuccess'])
    })

    const flagStepEdges = (): HogFlowEdge[] =>
        wfLogic.values.edgesByActionId[FLAG_STEP.id].filter((e) => e.from === FLAG_STEP.id)

    it('lists every outcome but the primary one, and whether each has a path', async () => {
        logic.actions.addOutcomePath('needs_approval')

        expect(logic.values.outcomePaths).toEqual([
            { outcome: 'changed_elsewhere', label: 'Changed elsewhere', hasPath: false },
            { outcome: 'needs_approval', label: 'Needs approval', hasPath: true, removeDisabledReason: undefined },
            { outcome: 'failed', label: 'Failed', hasPath: false },
            { outcome: 'not_permitted', label: 'Not permitted', hasPath: false },
        ])
    })

    it('adds an outcome path that ends the workflow and removes it again', async () => {
        logic.actions.addOutcomePath('changed_elsewhere')

        expect(flagStepEdges()).toEqual(
            expect.arrayContaining([outcomeEdge('changed_elsewhere'), continueEdge(FLAG_STEP.id, EXIT_NODE_ID)])
        )
        expect(flagStepEdges()).toHaveLength(2)

        logic.actions.removeOutcomePath('changed_elsewhere')

        expect(flagStepEdges()).toEqual([continueEdge(FLAG_STEP.id, EXIT_NODE_ID)])
    })

    it('blocks an operation that lacks a wired outcome, and keeps a removable path removable', async () => {
        logic.actions.addOutcomePath('changed_elsewhere')

        expect(logic.values.operationOptions).toEqual([
            { value: 'set_rollout_percentage', label: 'Set rollout percentage', disabledReason: undefined },
            {
                value: 'create_flag',
                label: 'Create flag',
                disabledReason: 'Remove the Changed elsewhere path first',
            },
        ])
        expect(logic.values.outcomePaths[0]).toMatchObject({
            outcome: 'changed_elsewhere',
            removeDisabledReason: undefined,
        })
    })

    it('refuses to remove an outcome path that still has steps on it', async () => {
        wfLogic.actions.setWorkflowInfo({
            actions: [
                ...wfLogic.values.workflow.actions,
                { ...FLAG_STEP, id: 'notify', type: 'delay', config: { delay_duration: '1m' } } as HogFlowAction,
            ],
            edges: [
                ...wfLogic.values.workflow.edges,
                { from: FLAG_STEP.id, to: 'notify', type: 'branch', outcome: 'needs_approval' },
                continueEdge('notify', EXIT_NODE_ID),
            ],
        })

        expect(logic.values.outcomePaths[1]).toMatchObject({
            outcome: 'needs_approval',
            removeDisabledReason: 'Clean up branching steps first',
        })
    })
})
