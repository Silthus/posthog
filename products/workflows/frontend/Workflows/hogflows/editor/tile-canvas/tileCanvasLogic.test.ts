import { expectLogic } from 'kea-test-utils'

import { loadAppMetricsTotals } from 'lib/components/AppMetrics/appMetricsLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { workflowLogic } from '../../../workflowLogic'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import type { HogFlowActionNode } from '../../types'
import { tileCanvasLogic } from './tileCanvasLogic'
import { stepCount } from './tileCanvasModel'

jest.mock('lib/components/AppMetrics/appMetricsLogic', () => ({
    ...jest.requireActual('lib/components/AppMetrics/appMetricsLogic'),
    loadAppMetricsTotals: jest.fn(),
}))

const WORKFLOW_ID = 'flow-1'

const savedWorkflow = {
    id: WORKFLOW_ID,
    name: 'Onboarding',
    version: 1,
    status: 'active',
    trigger: { type: 'event', filters: {} },
    actions: [
        {
            id: 'trigger_node',
            type: 'trigger',
            name: 'Trigger',
            config: { type: 'event', filters: {} },
        },
        { id: 'pause', type: 'delay', name: 'Delay', config: { delay_duration: '1d' } },
        { id: 'exit_node', type: 'exit', name: 'Exit', config: { reason: 'Done' } },
    ],
    edges: [
        { from: 'trigger_node', to: 'pause', type: 'continue' },
        { from: 'pause', to: 'exit_node', type: 'continue' },
    ],
    updated_at: '2026-10-01T00:00:00.000Z',
}

const totals = (rows: [instanceId: string, metric: string, total: number][]): Record<string, unknown> =>
    Object.fromEntries(
        rows.map(([instanceId, metric, total]) => [
            `${instanceId}_${metric}`,
            { total, breakdowns: [instanceId, metric] },
        ])
    )

describe('tileCanvasLogic', () => {
    let logic: ReturnType<typeof tileCanvasLogic.build>

    describe('panels', () => {
        beforeEach(() => {
            initKeaTests()
            logic = tileCanvasLogic()
            logic.mount()
        })

        it('opens a panel mode and closes it again from the same command', async () => {
            await expectLogic(logic, () => logic.actions.togglePanel('logs')).toMatchValues({ panelMode: 'logs' })
            await expectLogic(logic, () => logic.actions.togglePanel('logs')).toMatchValues({
                panelMode: null,
                isPanelOpen: false,
            })
        })

        it('keeps the selected step when the panel switches mode', async () => {
            const stepId = logic.values.workflow.actions[0].id
            logic.actions.selectStep(stepId)

            await expectLogic(logic, () => logic.actions.togglePanel('logs')).toMatchValues({
                panelMode: 'logs',
                selectedNodeId: stepId,
            })
        })

        it('leaves history for the build mode of a step picked on the canvas', async () => {
            const stepId = logic.values.workflow.actions[0].id
            await expectLogic(logic, () => logic.actions.togglePanel('history')).toMatchValues({
                panelMode: 'history',
            })

            await expectLogic(logic, () => logic.actions.selectStep(stepId)).toMatchValues({
                panelMode: 'build',
                selectedNodeId: stepId,
            })
        })
    })

    describe('placing a step', () => {
        const delayStep = { type: 'delay', name: 'Delay', description: '', config: { delay_duration: '1h' } } as const

        beforeEach(() => {
            initKeaTests()
            logic = tileCanvasLogic()
            logic.mount()
        })

        it.each(['startMovingNode', 'startCopyingNode'] as const)(
            'drops a pending %s when someone starts adding a step',
            async (startPending) => {
                const editorLogic = hogFlowEditorLogic()
                const pendingNode = { id: 'exit_node', data: logic.values.workflow.actions[1] } as HogFlowActionNode
                editorLogic.actions[startPending](pendingNode)

                await expectLogic(logic, () => logic.actions.startPlacing(delayStep)).toMatchValues({
                    isMovingNode: false,
                    isCopyingNode: false,
                    nodeToBeAdded: delayStep,
                })
            }
        )
    })

    describe('step counts', () => {
        beforeEach(async () => {
            jest.mocked(loadAppMetricsTotals).mockResolvedValue(
                totals([
                    ['pause', 'succeeded', 40],
                    ['pause', 'filtered', 8],
                ]) as any
            )
            useMocks({
                get: {
                    '/api/environments/:team_id/hog_flows/:id/': savedWorkflow,
                    '/api/projects/:team_id/hog_function_templates/': { results: [], count: 0 },
                },
            })
            initKeaTests()
            const flowLogic = workflowLogic({ id: WORKFLOW_ID })
            flowLogic.mount()
            await expectLogic(flowLogic).toDispatchActions(['loadWorkflowSuccess'])
            logic = tileCanvasLogic({ id: WORKFLOW_ID })
            logic.mount()
            await expectLogic(logic).toDispatchActions(['loadStepCountsSuccess'])
        })

        it('counts the people a step filtered out', () => {
            expect(stepCount(logic.values.stepMetrics, 'pause')).toBe(48)
        })

        it('keeps the canvas counts when the Metrics panel loads another date range', async () => {
            const editorLogic = hogFlowEditorLogic({ id: WORKFLOW_ID })

            await expectLogic(logic, () =>
                editorLogic.actions.loadActionMetricsByIdSuccess({
                    pause: { actionId: 'pause', succeeded: 3, failed: 0, filtered: 0 },
                })
            )

            expect(stepCount(logic.values.stepMetrics, 'pause')).toBe(48)
        })
    })
})
