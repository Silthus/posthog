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

const step = (id: string, type = 'delay', config: Record<string, unknown> = { delay_duration: '1d' }): object => ({
    id,
    type,
    name: id,
    config,
})

// trigger -> split, whose two paths hold two steps each, both ending at exit
const savedWorkflow = {
    id: WORKFLOW_ID,
    name: 'Onboarding',
    version: 1,
    status: 'active',
    trigger: { type: 'event', filters: {} },
    actions: [
        step('trigger_node', 'trigger', { type: 'event', filters: {} }),
        step('split', 'conditional_branch', { conditions: [{ filters: {} }] }),
        step('pause'),
        step('a2'),
        step('b1'),
        step('b2'),
        step('exit_node', 'exit', { reason: 'Done' }),
    ],
    edges: [
        { from: 'trigger_node', to: 'split', type: 'continue' },
        { from: 'split', to: 'pause', type: 'branch', index: 0 },
        { from: 'pause', to: 'a2', type: 'continue' },
        { from: 'a2', to: 'exit_node', type: 'continue' },
        { from: 'split', to: 'b1', type: 'continue' },
        { from: 'b1', to: 'b2', type: 'continue' },
        { from: 'b2', to: 'exit_node', type: 'continue' },
    ],
    updated_at: '2026-10-01T00:00:00.000Z',
}

async function mountSavedCanvas(): Promise<ReturnType<typeof tileCanvasLogic.build>> {
    initKeaTests()
    const flowLogic = workflowLogic({ id: WORKFLOW_ID })
    flowLogic.mount()
    await expectLogic(flowLogic).toDispatchActions(['loadWorkflowSuccess'])
    const canvasLogic = tileCanvasLogic({ id: WORKFLOW_ID })
    canvasLogic.mount()
    await expectLogic(canvasLogic).toDispatchActions(['loadStepCountsSuccess'])
    return canvasLogic
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

    beforeEach(() => {
        useMocks({
            get: {
                '/api/environments/:team_id/hog_flows/:id/': savedWorkflow,
                '/api/projects/:team_id/hog_function_templates/': { results: [], count: 0 },
            },
        })
    })

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

    describe('paths', () => {
        beforeEach(async () => {
            jest.mocked(loadAppMetricsTotals).mockResolvedValue({})
            logic = await mountSavedCanvas()
            jest.useFakeTimers()
        })

        afterEach(() => jest.useRealTimers())

        it('collapses every path someone collapses in quick succession', () => {
            const pathIds = logic.values.pathGroups.map((group) => group.id)
            logic.actions.setOpenPathIds(pathIds)

            pathIds.forEach((pathId) => logic.actions.collapsePath(pathId))
            jest.advanceTimersByTime(1000)

            expect(logic.values.openPathIds).toEqual([])
        })
    })

    describe('step counts', () => {
        beforeEach(async () => {
            jest.mocked(loadAppMetricsTotals).mockResolvedValue(
                totals([
                    ['pause', 'succeeded', 40],
                    ['pause', 'filtered', 8],
                ]) as any
            )
            logic = await mountSavedCanvas()
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
