import type { HogFlow, HogFlowAction, HogFlowEdge } from '../../types'
import {
    computePathGroups,
    computeVisibleGraph,
    countableStepMetrics,
    filterPaletteItems,
    isHeadingToRect,
    layoutMiniFlow,
    PaletteCommand,
    PaletteSection,
    stepCount,
    stepCountsRequest,
    viewportAfterResize,
} from './tileCanvasModel'

const step = (id: string, type: HogFlowAction['type'] = 'function'): HogFlowAction =>
    ({ id, type, name: id, description: '', config: {} }) as HogFlowAction

const next = (from: string, to: string): HogFlowEdge => ({ from, to, type: 'continue' })
const branch = (from: string, to: string, index = 0): HogFlowEdge => ({ from, to, type: 'branch', index })

const flow = (actions: HogFlowAction[], edges: HogFlowEdge[]): Pick<HogFlow, 'actions' | 'edges'> => ({
    actions,
    edges,
})

// trigger -> split, whose branch path holds two steps and whose other path holds one, both joining at exit
const splitWithLongAndShortPath = (splitType: HogFlowAction['type']): Pick<HogFlow, 'actions' | 'edges'> =>
    flow(
        [
            step('trigger', 'trigger'),
            step('split', splitType),
            step('a1'),
            step('a2'),
            step('b1'),
            step('exit', 'exit'),
        ],
        [
            next('trigger', 'split'),
            branch('split', 'a1'),
            next('a1', 'a2'),
            next('a2', 'exit'),
            next('split', 'b1'),
            next('b1', 'exit'),
        ]
    )

// The outer split's branch path holds an inner split with two paths of two steps each
const nestedSplits = flow(
    [
        step('trigger', 'trigger'),
        step('outer', 'conditional_branch'),
        step('inner', 'conditional_branch'),
        step('x1'),
        step('x2'),
        step('y1'),
        step('y2'),
        step('other'),
        step('exit', 'exit'),
    ],
    [
        next('trigger', 'outer'),
        branch('outer', 'inner'),
        branch('inner', 'x1'),
        next('x1', 'x2'),
        next('x2', 'exit'),
        next('inner', 'y1'),
        next('y1', 'y2'),
        next('y2', 'exit'),
        next('outer', 'other'),
        next('other', 'exit'),
    ]
)

describe('tileCanvasModel', () => {
    it.each(['conditional_branch', 'random_cohort_branch', 'wait_until_condition'] as const)(
        'groups a %s path only when it holds two or more steps',
        (splitType) => {
            const groups = computePathGroups(splitWithLongAndShortPath(splitType))

            expect(groups.map((group) => ({ branch: group.branchActionId, members: group.memberIds }))).toEqual([
                { branch: 'split', members: ['a1', 'a2'] },
            ])
        }
    )

    it('gives a nested path its enclosing path as parent', () => {
        const groups = computePathGroups(nestedSplits)
        const outer = groups.find((group) => group.branchActionId === 'outer')
        const inner = groups.filter((group) => group.branchActionId === 'inner')

        expect(outer?.memberIds).toEqual(expect.arrayContaining(['inner', 'x1', 'x2', 'y1', 'y2']))
        expect(inner.map((group) => [group.memberIds, group.parentId, group.depth])).toEqual([
            [['x1', 'x2'], outer?.id, 1],
            [['y1', 'y2'], outer?.id, 1],
        ])
    })

    it.each([
        {
            name: 'steps stored out of flow order',
            workflow: flow(
                [
                    step('exit', 'exit'),
                    step('a2'),
                    step('b1'),
                    step('a1'),
                    step('split', 'conditional_branch'),
                    step('trigger', 'trigger'),
                ],
                splitWithLongAndShortPath('conditional_branch').edges
            ),
            splitId: 'split',
            members: ['a1', 'a2'],
        },
        {
            name: 'a step inserted before the first step of the path',
            workflow: flow(
                [...splitWithLongAndShortPath('conditional_branch').actions, step('first')],
                [
                    next('trigger', 'split'),
                    branch('split', 'first'),
                    next('first', 'a1'),
                    next('a1', 'a2'),
                    next('a2', 'exit'),
                    next('split', 'b1'),
                    next('b1', 'exit'),
                ]
            ),
            splitId: 'split',
            members: ['first', 'a1', 'a2'],
        },
        {
            name: 'a nested split, one inner path after the other',
            workflow: flow([...nestedSplits.actions].reverse(), nestedSplits.edges),
            splitId: 'outer',
            members: ['inner', 'x1', 'x2', 'y1', 'y2'],
        },
    ])('orders a path the way people move through it: $name', ({ workflow, splitId, members }) => {
        const group = computePathGroups(workflow).find((candidate) => candidate.branchActionId === splitId)

        expect(group?.memberIds).toEqual(members)
    })

    it('lists the visible steps in flow order, whatever order they are stored in', () => {
        const workflow = flow([...nestedSplits.actions].reverse(), nestedSplits.edges)

        const graph = computeVisibleGraph(workflow, [], [])

        expect(graph.nodes.map((node) => node.id)).toEqual([
            'trigger',
            'outer',
            'inner',
            'x1',
            'x2',
            'y1',
            'y2',
            'other',
            'exit',
        ])
    })

    it('leaves paths that loop back into each other ungrouped', () => {
        const loop = flow(
            [
                step('trigger', 'trigger'),
                step('s', 'conditional_branch'),
                step('a'),
                step('t', 'conditional_branch'),
                step('b'),
                step('exit', 'exit'),
            ],
            [
                next('trigger', 's'),
                branch('s', 'a'),
                next('a', 't'),
                next('s', 'exit'),
                branch('t', 'b'),
                next('b', 's'),
                next('t', 'exit'),
            ]
        )

        const groups = computePathGroups(loop)

        expect(groups).toEqual([])
        expect(computeVisibleGraph(loop, groups, []).nodes.map((node) => node.id)).toEqual([
            'trigger',
            's',
            'a',
            't',
            'b',
            'exit',
        ])
    })

    it('draws a collapsed path as one stack that takes over its arrows', () => {
        const workflow = splitWithLongAndShortPath('conditional_branch')
        const [group] = computePathGroups(workflow)

        const graph = computeVisibleGraph(workflow, [group], [])

        expect(graph.nodes.map((node) => node.id)).toEqual(['trigger', 'split', group.id, 'b1', 'exit'])
        expect(graph.edges.map((edge) => [edge.source, edge.target])).toEqual(
            expect.arrayContaining([
                ['split', group.id],
                [group.id, 'exit'],
            ])
        )
    })

    it('hides the paths inside a collapsed path, and shows the steps of an open one', () => {
        const groups = computePathGroups(nestedSplits)
        const outer = groups.find((group) => group.branchActionId === 'outer')!
        const inner = groups.filter((group) => group.branchActionId === 'inner')

        const outerCollapsed = computeVisibleGraph(nestedSplits, groups, [])
        expect(outerCollapsed.nodes.filter((node) => node.kind === 'stack').map((node) => node.id)).toEqual([outer.id])

        const outerOpen = computeVisibleGraph(nestedSplits, groups, [outer.id])
        expect(outerOpen.nodes.map((node) => node.id)).toEqual(
            expect.arrayContaining(['inner', inner[0].id, inner[1].id])
        )
        expect(outerOpen.nodes.map((node) => node.id)).not.toContain('x1')
    })

    it('lays a path out left to right, stacking a fork in one column around its split', () => {
        const workflow = flow(
            [step('split', 'conditional_branch'), step('yes'), step('no'), step('after')],
            [branch('split', 'yes'), next('split', 'no'), next('yes', 'after')]
        )

        const layout = layoutMiniFlow(workflow, ['split', 'yes', 'no', 'after'], { tile: 32, gapX: 30, gapY: 50 })
        const at = Object.fromEntries(layout.nodes.map((node) => [node.actionId, { x: node.x, y: node.y }]))

        expect(at).toEqual({
            split: { x: 0, y: 25 },
            yes: { x: 62, y: 0 },
            no: { x: 62, y: 50 },
            after: { x: 124, y: 25 },
        })
        expect(layout.edges).toHaveLength(3)
        expect(layout.width).toBe(156)
    })

    it.each([
        ['straight toward the preview', { x: 100, y: 150 }, true],
        ['sideways away from the preview', { x: 10, y: 110 }, false],
        ['past the side of the preview', { x: 400, y: 190 }, false],
    ])('keeps the open preview while the pointer moves %s', (_, pointer, expected) => {
        const apex = { x: 100, y: 100 }
        const preview = { left: 40, right: 260, top: 200 }

        expect(isHeadingToRect(pointer, apex, preview, 12)).toBe(expected)
    })

    it.each([
        ['an empty search lists commands first', '', ['Fit to screen', 'Email', 'Delay']],
        ['a search matches step descriptions and section names', 'wait', ['Delay']],
        ['a search matches commands too', 'screen', ['Fit to screen']],
        ['a search with no match lists nothing', 'zebra', []],
    ])('filters the palette: %s', (_, query, expected) => {
        const sections: PaletteSection[] = [
            {
                title: 'Send',
                steps: [
                    {
                        type: 'function_email',
                        name: 'Email',
                        description: 'Send an email.',
                        config: { template_id: 'template-email', inputs: {} },
                    },
                ],
            },
            {
                title: 'Wait',
                steps: [{ type: 'delay', name: 'Delay', description: 'Pause.', config: { delay_duration: '1h' } }],
            },
        ]
        const commands: PaletteCommand[] = [{ id: 'fit', label: 'Fit to screen', hint: 'Show every step' }]

        expect(filterPaletteItems(query, sections, commands).map((item) => item.label)).toEqual(expected)
    })

    it('counts every person a step handled once metrics load', () => {
        const metrics = { email: { actionId: 'email', succeeded: 40, failed: 2, filtered: 8 } }

        expect(stepCount(metrics, 'email')).toBe(50)
        expect(stepCount(metrics, 'delay')).toBe(0)
        expect(stepCount(null, 'email')).toBeUndefined()
        expect(stepCount({}, 'email')).toBeUndefined()
    })

    it.each([
        {
            name: 'keeps the middle of the view when the panel opens',
            startX: 100,
            previousWidth: 1200,
            nextWidth: 600,
            focus: undefined,
            expected: { x: -200, y: 50, zoom: 0.5 },
        },
        {
            name: 'gives the view back when the panel closes',
            startX: -200,
            previousWidth: 600,
            nextWidth: 1200,
            focus: undefined,
            expected: { x: 100, y: 50, zoom: 0.5 },
        },
        {
            name: 'leaves a selected step that is still in view alone',
            startX: 100,
            previousWidth: 1200,
            nextWidth: 600,
            focus: { x: 1000, y: 0, width: 64, height: 64 },
            expected: { x: -200, y: 50, zoom: 0.5 },
        },
        {
            name: 'pulls a selected step back in from the right edge',
            startX: 100,
            previousWidth: 1200,
            nextWidth: 600,
            focus: { x: 1600, y: 0, width: 64, height: 64 },
            expected: { x: -256, y: 50, zoom: 0.5 },
        },
        {
            name: 'pulls a selected step back in from the left edge',
            startX: 100,
            previousWidth: 1200,
            nextWidth: 600,
            focus: { x: 0, y: 0, width: 64, height: 64 },
            expected: { x: 24, y: 50, zoom: 0.5 },
        },
    ])('moves the viewport on a canvas resize: $name', ({ startX, previousWidth, nextWidth, focus, expected }) => {
        const viewport = { x: startX, y: 50, zoom: 0.5 }

        expect(
            viewportAfterResize(
                viewport,
                { width: previousWidth, height: 800 },
                { width: nextWidth, height: 800 },
                focus
            )
        ).toEqual(expected)
    })
})

describe('stepCountsRequest', () => {
    const now = new Date('2026-10-13T12:00:00Z')

    it('asks for the last seven days of a saved workflow', () => {
        expect(stepCountsRequest({ id: 'flow-1', trigger: { type: 'event' } } as HogFlow, now)).toEqual({
            appSource: 'hog_flow',
            appSourceId: 'flow-1',
            dateFrom: '2026-10-06T12:00:00.000Z',
            dateTo: '2026-10-13T12:00:00.000Z',
        })
    })

    it.each([
        { name: 'an unsaved workflow', workflow: { id: 'new', trigger: { type: 'event' } } },
        { name: 'a batch workflow', workflow: { id: 'flow-1', trigger: { type: 'batch' } } },
    ])('skips $name', ({ workflow }) => {
        expect(stepCountsRequest(workflow as HogFlow, now)).toBeNull()
    })

    it.each([
        { name: 'keeps the counts of a saved workflow', trigger: 'event', expected: 50 },
        { name: 'drops counts loaded before the trigger became a batch', trigger: 'batch', expected: undefined },
    ])('$name', ({ trigger, expected }) => {
        const metrics = { email: { actionId: 'email', succeeded: 40, failed: 2, filtered: 8 } }
        const workflow = { id: 'flow-1', trigger: { type: trigger } } as HogFlow

        expect(stepCount(countableStepMetrics(workflow, metrics), 'email')).toBe(expected)
    })
})
