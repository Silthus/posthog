import type { HogFlowAction, HogFlowEdge } from '../../types'
import { layoutTileCanvas, NodeSize, pathFrameSpecs } from './tileCanvasLayout'
import { computePathGroups, computeVisibleGraph, PathGroup } from './tileCanvasModel'

const step = (id: string, type: HogFlowAction['type'] = 'function'): HogFlowAction =>
    ({ id, type, name: id, description: '', config: {} }) as HogFlowAction

const pathEdge = (from: string, to: string, index: number, count: number): HogFlowEdge =>
    index < count - 1 ? { from, to, type: 'branch', index } : { from, to, type: 'continue' }

/** A split whose paths hold two steps each and join again at `join`. */
function fanOut(split: string, arms: string[], join: string): { actions: HogFlowAction[]; edges: HogFlowEdge[] } {
    return {
        actions: [step(split, 'conditional_branch'), ...arms.flatMap((arm) => [step(`${arm}1`), step(`${arm}2`)])],
        edges: arms.flatMap((arm, index) => [
            pathEdge(split, `${arm}1`, index, arms.length),
            { from: `${arm}1`, to: `${arm}2`, type: 'continue' },
            { from: `${arm}2`, to: join, type: 'continue' },
        ]),
    }
}

const OUTER = ['a', 'b', 'c', 'd', 'e']
const INNER = ['x', 'y', 'z']

// trigger -> split with five paths; the middle path starts with its own three-way split
const outer = fanOut('split', OUTER, 'exit')
const inner = fanOut('c1', INNER, 'c2')
const workflow = {
    actions: [
        step('trigger', 'trigger'),
        ...outer.actions.map((action) => (action.id === 'c1' ? step('c1', 'conditional_branch') : action)),
        ...inner.actions.filter((action) => action.id !== 'c1'),
        step('exit', 'exit'),
    ],
    edges: [
        { from: 'trigger', to: 'split', type: 'continue' } as HogFlowEdge,
        ...outer.edges.filter((edge) => edge.from !== 'c1'),
        ...inner.edges,
    ],
}

const groups = computePathGroups(workflow)
const outerArms = groups.filter((group) => group.branchActionId === 'split')
const innerArms = groups.filter((group) => group.branchActionId === 'c1')

/** The arms of a split from left to right, by the centre of each one's stack or open frame. */
async function leftToRight(arms: PathGroup[], openIds: string[]): Promise<string[]> {
    const graph = computeVisibleGraph(workflow, groups, openIds)
    const sizes: Record<string, NodeSize> = Object.fromEntries(
        graph.nodes.map((node) => [
            node.id,
            node.kind === 'stack' ? { width: 180, height: 90 } : { width: 64, height: 64 },
        ])
    )
    const layout = await layoutTileCanvas(sizes, graph.edges, pathFrameSpecs(groups, openIds, graph.nodes))
    const centreOf = (group: PathGroup): number => {
        const frame = layout.frames[`frame:${group.id}`]
        return frame ? frame.x + frame.width / 2 : layout.positions[group.id].x + sizes[group.id].width / 2
    }
    return [...arms].sort((one, other) => centreOf(one) - centreOf(other)).map((group) => group.memberIds[0])
}

const OUTER_ORDER = OUTER.map((arm) => `${arm}1`)
const INNER_ORDER = INNER.map((arm) => `${arm}1`)

describe('layoutTileCanvas', () => {
    it.each([
        ['nothing open', [] as PathGroup[], outerArms, OUTER_ORDER],
        ['the middle path open', [outerArms[2]], outerArms, OUTER_ORDER],
        ['the middle path open, for its inner paths', [outerArms[2]], innerArms, INNER_ORDER],
        ['an inner path open', [outerArms[2], innerArms[1]], outerArms, OUTER_ORDER],
        ['an inner path open, for its inner paths', [outerArms[2], innerArms[1]], innerArms, INNER_ORDER],
    ])('keeps each path between the same neighbours with %s', async (_, open, arms, expected) => {
        expect(
            await leftToRight(
                arms,
                open.map((group) => group.id)
            )
        ).toEqual(expected)
    })
})
