import { expectLogic } from 'kea-test-utils'
import posthog from 'posthog-js'

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

    describe('step menu', () => {
        beforeEach(async () => {
            jest.mocked(loadAppMetricsTotals).mockResolvedValue({})
            logic = await mountSavedCanvas()
        })

        it('selects the step under the menu without opening the panel', async () => {
            await expectLogic(logic, () => logic.actions.openStepMenu('b1')).toMatchValues({
                selectedNodeId: 'b1',
                stepMenuActionId: 'b1',
                isPanelOpen: false,
            })
        })

        it('opens the step panel for a step and the path for a stack, from a click or the keyboard', async () => {
            const [stack] = logic.values.visibleGraph.nodes.filter((node) => node.kind === 'stack')

            await expectLogic(logic, () => logic.actions.activateNode('split')).toMatchValues({
                selectedNodeId: 'split',
                isPanelOpen: true,
            })
            await expectLogic(logic, () => logic.actions.activateNode(stack.id)).toMatchValues({
                openPathIds: [stack.id],
            })
        })

        it('opens the panel for a step picked on the canvas', async () => {
            await expectLogic(logic, () => logic.actions.selectStep('b1')).toMatchValues({
                selectedNodeId: 'b1',
                isPanelOpen: true,
            })
        })
    })

    describe('typing anywhere', () => {
        beforeEach(() => {
            initKeaTests()
            logic = tileCanvasLogic()
            logic.mount()
        })

        afterEach(() => {
            document.body.innerHTML = ''
        })

        const typeOn = (target: HTMLElement): void => {
            target.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))
        }

        it.each([
            { name: 'the page itself', place: (): HTMLElement => document.body, opens: true },
            {
                name: 'the canvas',
                place: (): HTMLElement => {
                    const canvas = document.createElement('div')
                    canvas.className = 'TileCanvas__flow'
                    const pane = canvas.appendChild(document.createElement('div'))
                    document.body.appendChild(canvas)
                    return pane
                },
                opens: true,
            },
            {
                name: 'a button in the step panel',
                place: (): HTMLElement => document.body.appendChild(document.createElement('button')),
                opens: false,
            },
        ])('opens the command palette from a key typed on $name: $opens', ({ place, opens }) => {
            typeOn(place())

            expect(logic.values.commandPaletteQuery).toBe(opens ? 'd' : null)
        })
    })

    describe('placing a step', () => {
        const delayStep = { type: 'delay', name: 'Delay', description: '', config: { delay_duration: '1h' } } as const

        beforeEach(() => {
            initKeaTests()
            logic = tileCanvasLogic()
            logic.mount()
        })

        it.each([
            {
                source: 'palette',
                add: (): void => {
                    logic.actions.openCommandPalette('d')
                    logic.actions.startPlacing(delayStep)
                    logic.actions.placeAt(logic.values.workflow.edges[0])
                },
            },
            {
                source: 'command bar',
                add: (): void => {
                    logic.actions.openCommandPalette()
                    logic.actions.startPlacing(delayStep)
                    logic.actions.placeAt(logic.values.workflow.edges[0])
                },
            },
            {
                source: 'quick add',
                add: (): void => logic.actions.addStepAt(delayStep, logic.values.workflow.edges[0]),
            },
        ])('counts a step added from the $source', ({ source, add }) => {
            const capture = jest.spyOn(posthog, 'capture')

            add()

            expect(capture).toHaveBeenCalledWith('workflows tile canvas step added', { source, step_type: 'delay' })
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

        it('asks the canvas to bring an opened path into view once its frame is laid out', () => {
            const [group] = logic.values.pathGroups
            const frame = { x: 40, y: 300, width: 520, height: 260 }

            logic.actions.openPath(group.id)
            logic.actions.setLayout({
                positions: {},
                edges: {},
                frames: { [`frame:${group.id}`]: frame },
                width: 600,
                height: 600,
            })

            expect(logic.values.frameFocus).toEqual({ box: frame, request: 1 })
        })

        it('brings the path of a step picked elsewhere into view', () => {
            const group = logic.values.pathGroups.find((candidate) => candidate.memberIds.includes('a2'))!
            const frame = { x: 0, y: 120, width: 300, height: 200 }

            logic.actions.setSelectedNodeId('a2')
            logic.actions.setLayout({
                positions: {},
                edges: {},
                frames: { [`frame:${group.id}`]: frame },
                width: 0,
                height: 0,
            })

            expect(logic.values.frameFocus?.box).toEqual(frame)
        })

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
