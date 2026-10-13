import type { AppMetricsTotalsRequest } from 'lib/components/AppMetrics/appMetricsLogic'

import type { CreateActionType, HogFlowEditorActionMetrics } from '../../hogFlowEditorLogic'
import { getWorkflowBranchLabel, isBranchingAction } from '../../tree/workflowTree'
import type { HogFlow, HogFlowAction, HogFlowEdge } from '../../types'

export type FlowGraph = Pick<HogFlow, 'actions' | 'edges'>

/** Matches the edge id `hogFlowEditorLogic` gives its dropzones, so a + on an arrow finds its dropzone. */
export function edgeKey(edge: HogFlowEdge): string {
    return `${edge.from}->${edge.to} ${edge.type} ${edge.index ?? ''}`.trim()
}

interface FlowIndex {
    outgoing: Map<string, HogFlowEdge[]>
}

const flowIndexes = new WeakMap<HogFlowEdge[], FlowIndex>()

function byPathOrder(a: HogFlowEdge, b: HogFlowEdge): number {
    return a.type !== b.type ? (a.type === 'branch' ? -1 : 1) : (a.index ?? 0) - (b.index ?? 0)
}

function buildFlowIndex(edges: HogFlowEdge[]): FlowIndex {
    const outgoing = new Map<string, HogFlowEdge[]>()
    edges.forEach((edge) => outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]))
    outgoing.forEach((list) => list.sort(byPathOrder))
    return { outgoing }
}

function flowIndex(workflow: FlowGraph): FlowIndex {
    let index = flowIndexes.get(workflow.edges)
    if (!index) {
        index = buildFlowIndex(workflow.edges)
        flowIndexes.set(workflow.edges, index)
    }
    return index
}

export function outgoingEdges(workflow: FlowGraph, actionId: string): HogFlowEdge[] {
    return flowIndex(workflow).outgoing.get(actionId) ?? []
}

function reachableFrom(workflow: FlowGraph, start: string): Set<string> {
    const seen = new Set<string>()
    const pending = [start]
    while (pending.length) {
        const id = pending.pop() as string
        if (!seen.has(id)) {
            seen.add(id)
            outgoingEdges(workflow, id).forEach((edge) => pending.push(edge.to))
        }
    }
    return seen
}

function breadthFirstOrder(workflow: FlowGraph, start: string | undefined): string[] {
    const order: string[] = []
    const seen = new Set<string>()
    const queue = start ? [start] : []
    for (let next = 0; next < queue.length; next++) {
        const id = queue[next]
        if (!seen.has(id)) {
            seen.add(id)
            order.push(id)
            outgoingEdges(workflow, id).forEach((edge) => queue.push(edge.to))
        }
    }
    return order
}

/**
 * Every step reachable from the starts, each before the steps it leads to. The paths of a split follow each
 * other in path order, so one path's steps stay together and the step where they join comes after all of them.
 */
export function executionOrder(workflow: FlowGraph, startIds: readonly string[]): string[] {
    const seen = new Set<string>()
    return startIds.flatMap((startId) => {
        const finished: string[] = []
        const pending: [id: string, isDone: boolean][] = [[startId, false]]
        while (pending.length) {
            const [id, isDone] = pending.pop() as [string, boolean]
            if (isDone) {
                finished.push(id)
            } else if (!seen.has(id)) {
                seen.add(id)
                pending.push(
                    [id, true],
                    ...outgoingEdges(workflow, id).map((edge): [string, boolean] => [edge.to, false])
                )
            }
        }
        return finished.reverse()
    })
}

function workflowOrder(workflow: FlowGraph): Map<string, number> {
    const starts = [
        ...workflow.actions.filter((action) => action.type === 'trigger'),
        ...workflow.actions.filter((action) => action.type !== 'trigger'),
    ].map((action) => action.id)
    return new Map(executionOrder(workflow, starts).map((id, index) => [id, index]))
}

export interface PathGroup {
    id: string
    branchActionId: string
    entryEdge: HogFlowEdge
    label: string
    memberIds: string[]
    parentId: string | null
    depth: number
}

const PATH_COLORS = [
    'var(--data-color-1)',
    'var(--data-color-13)',
    'var(--data-color-7)',
    'var(--data-color-4)',
    'var(--data-color-3)',
]

export function pathColor(edge: Pick<HogFlowEdge, 'type' | 'index'>): string {
    return edge.type === 'branch' ? PATH_COLORS[(edge.index ?? 0) % PATH_COLORS.length] : 'var(--color-text-secondary)'
}

export function tint(color: string, percent: number): string {
    return `color-mix(in srgb, ${color} ${percent}%, transparent)`
}

export function pathGroupId(edge: HogFlowEdge): string {
    return `path:${edge.from}:${edge.type}:${edge.index ?? ''}`
}

function pathsOf(workflow: FlowGraph, splitAction: HogFlowAction): PathGroup[] {
    const outgoing = outgoingEdges(workflow, splitAction.id)
    const reaches = outgoing.map((edge) => reachableFrom(workflow, edge.to))
    const joinId = breadthFirstOrder(workflow, outgoing[0]?.to).find((id) => reaches.every((reach) => reach.has(id)))
    const afterJoin = joinId ? reachableFrom(workflow, joinId) : new Set<string>()
    return outgoing.flatMap((edge, index) => {
        const otherPaths = reaches.filter((_, other) => other !== index)
        const memberIds = executionOrder(workflow, [edge.to]).filter(
            (id) => !afterJoin.has(id) && !otherPaths.some((reach) => reach.has(id))
        )
        // A single step reads better on the canvas as itself than inside a group of one.
        if (memberIds.length < 2) {
            return []
        }
        return [
            {
                id: pathGroupId(edge),
                branchActionId: splitAction.id,
                entryEdge: edge,
                label: getWorkflowBranchLabel(splitAction, edge),
                memberIds,
                parentId: null,
                depth: 0,
            },
        ]
    })
}

function loopsBackToItsSplit(group: PathGroup): boolean {
    return group.memberIds.includes(group.branchActionId)
}

function encloses(outer: PathGroup, inner: PathGroup): boolean {
    return (
        outer.memberIds.includes(inner.branchActionId) &&
        outer.memberIds.length > inner.memberIds.length &&
        inner.memberIds.every((id) => outer.memberIds.includes(id))
    )
}

export function computePathGroups(workflow: FlowGraph): PathGroup[] {
    // A path that leads back to its own split has no end to fold into a stack, so its steps stay plain tiles.
    const groups = workflow.actions
        .filter(isBranchingAction)
        .flatMap((action) => pathsOf(workflow, action))
        .filter((group) => !loopsBackToItsSplit(group))
    // A parent must hold strictly more steps than its child, so the parent chain can never loop.
    const parentOf = (group: PathGroup): PathGroup | undefined =>
        groups.filter((other) => encloses(other, group)).sort((a, b) => a.memberIds.length - b.memberIds.length)[0]
    const withParents = groups.map((group) => ({ ...group, parentId: parentOf(group)?.id ?? null }))
    const depthOf = (group: PathGroup): number => {
        const parent = withParents.find((other) => other.id === group.parentId)
        return parent ? depthOf(parent) + 1 : 0
    }
    return withParents.map((group) => ({ ...group, depth: depthOf(group) }))
}

function ancestorsOf(groups: PathGroup[], group: PathGroup): PathGroup[] {
    const parent = groups.find((other) => other.id === group.parentId)
    return parent ? [parent, ...ancestorsOf(groups, parent)] : []
}

export function openPathFrames(groups: PathGroup[], openGroupIds: readonly string[]): PathGroup[] {
    const open = new Set(openGroupIds)
    return groups.filter(
        (group) => open.has(group.id) && ancestorsOf(groups, group).every((ancestor) => open.has(ancestor.id))
    )
}

export function collapsedPathStacks(groups: PathGroup[], openGroupIds: readonly string[]): PathGroup[] {
    const open = new Set(openGroupIds)
    return groups.filter(
        (group) => !open.has(group.id) && ancestorsOf(groups, group).every((ancestor) => open.has(ancestor.id))
    )
}

export function pathActions(workflow: Pick<HogFlow, 'actions'>, group: PathGroup): HogFlowAction[] {
    const actionsById = new Map(workflow.actions.map((action) => [action.id, action]))
    return group.memberIds.flatMap((id) => actionsById.get(id) ?? [])
}

export function isInPathGroup(group: PathGroup, node: VisibleNode): boolean {
    return group.memberIds.includes(node.kind === 'step' ? node.id : node.group.branchActionId)
}

export type VisibleNode =
    | { kind: 'step'; id: string; action: HogFlowAction }
    | { kind: 'stack'; id: string; group: PathGroup }

export interface VisibleEdge {
    id: string
    source: string
    target: string
    portIndex: number
    portCount: number
    label?: string
    /** The workflow edge a step can be inserted into. Absent where the arrow leads into or out of a stack. */
    insertEdge?: HogFlowEdge
    originalEdgeKeys: string[]
}

export interface VisibleGraph {
    nodes: VisibleNode[]
    edges: VisibleEdge[]
}

export function computeVisibleGraph(
    workflow: FlowGraph,
    groups: PathGroup[],
    openGroupIds: readonly string[]
): VisibleGraph {
    const stacks = collapsedPathStacks(groups, openGroupIds)
    const frames = openPathFrames(groups, openGroupIds)
    const stackOf = new Map(stacks.flatMap((group) => group.memberIds.map((id): [string, string] => [id, group.id])))
    const shown = (id: string): string => stackOf.get(id) ?? id
    const namedElsewhere = new Set([...stacks, ...frames].map((group) => edgeKey(group.entryEdge)))
    const actionsById = new Map(workflow.actions.map((action) => [action.id, action]))
    const actionOrder = workflowOrder(workflow)
    const orderOf = (node: VisibleNode): number =>
        actionOrder.get(node.kind === 'step' ? node.id : node.group.memberIds[0]) ?? 0

    const nodes: VisibleNode[] = [
        ...workflow.actions
            .filter((action) => !stackOf.has(action.id))
            .map((action): VisibleNode => ({ kind: 'step', id: action.id, action })),
        ...stacks.map((group): VisibleNode => ({ kind: 'stack', id: group.id, group })),
    ].sort((a, b) => orderOf(a) - orderOf(b))

    const edgesById = new Map<string, VisibleEdge>()
    workflow.edges.forEach((edge) => {
        const source = shown(edge.from)
        const target = shown(edge.to)
        if (source === target) {
            return
        }
        const fromStack = source !== edge.from
        const id = fromStack ? `${source}->${target}` : `${edgeKey(edge)}${target !== edge.to ? `=>${target}` : ''}`
        const existing = edgesById.get(id)
        if (existing) {
            existing.originalEdgeKeys.push(edgeKey(edge))
            existing.insertEdge = undefined
            return
        }
        const isPathChoice = !fromStack && outgoingEdges(workflow, edge.from).length > 1
        edgesById.set(id, {
            id,
            source,
            target,
            portIndex: 0,
            portCount: 1,
            label:
                isPathChoice && !namedElsewhere.has(edgeKey(edge))
                    ? getWorkflowBranchLabel(actionsById.get(edge.from), edge)
                    : undefined,
            insertEdge: fromStack || target !== edge.to ? undefined : edge,
            originalEdgeKeys: [edgeKey(edge)],
        })
    })

    const edges = [...edgesById.values()]
    new Set(edges.map((edge) => edge.source)).forEach((sourceId) => {
        const order = outgoingEdges(workflow, sourceId).map(edgeKey)
        const fromSource = edges
            .filter((edge) => edge.source === sourceId)
            .sort((a, b) => order.indexOf(a.originalEdgeKeys[0]) - order.indexOf(b.originalEdgeKeys[0]))
        fromSource.forEach((edge, index) => {
            edge.portIndex = index
            edge.portCount = fromSource.length
        })
    })
    return { nodes, edges }
}

/** The people a step handled. Unknown until the metrics load, so the tile shows no number rather than a wrong one.
 * A workflow with no runs in the window shows no numbers either, so a draft is not covered in zeros. */
export function stepCount(
    metrics: Record<string, HogFlowEditorActionMetrics> | null,
    actionId: string
): number | undefined {
    if (!metrics || Object.keys(metrics).length === 0) {
        return undefined
    }
    const entry = metrics[actionId]
    return entry ? entry.succeeded + entry.failed + entry.filtered : 0
}

const STEP_COUNT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export type StepCountsRequest = Pick<AppMetricsTotalsRequest, 'appSource' | 'appSourceId' | 'dateFrom' | 'dateTo'>

/** Batch workflows report metrics per run, not per step, so they get no step counts. */
function canCountSteps(workflow: Pick<HogFlow, 'id' | 'trigger'>): boolean {
    return !!workflow.id && workflow.id !== 'new' && workflow.trigger?.type !== 'batch'
}

/** Metrics loaded earlier, or answered late, must not show once the workflow stops qualifying for step counts. */
export function countableStepMetrics(
    workflow: Pick<HogFlow, 'id' | 'trigger'>,
    metrics: Record<string, HogFlowEditorActionMetrics> | null
): Record<string, HogFlowEditorActionMetrics> | null {
    return canCountSteps(workflow) ? metrics : null
}

export function stepCountsRequest(workflow: Pick<HogFlow, 'id' | 'trigger'>, now: Date): StepCountsRequest | null {
    if (!canCountSteps(workflow)) {
        return null
    }
    return {
        appSource: 'hog_flow',
        appSourceId: workflow.id,
        dateFrom: new Date(now.getTime() - STEP_COUNT_WINDOW_MS).toISOString(),
        dateTo: now.toISOString(),
    }
}

export interface Point {
    x: number
    y: number
}

export interface Viewport {
    x: number
    y: number
    zoom: number
}

export interface Size {
    width: number
    height: number
}

const VIEWPORT_MARGIN = 24

function shiftIntoView(offset: number, start: number, length: number, zoom: number, extent: number): number {
    const near = start * zoom + offset
    const far = (start + length) * zoom + offset
    if (near < VIEWPORT_MARGIN) {
        return offset + VIEWPORT_MARGIN - near
    }
    if (far > extent - VIEWPORT_MARGIN) {
        return offset - Math.min(far - (extent - VIEWPORT_MARGIN), near - VIEWPORT_MARGIN)
    }
    return offset
}

export function viewportAfterResize(viewport: Viewport, previous: Size, next: Size, focus?: Point & Size): Viewport {
    const x = viewport.x + (next.width - previous.width) / 2
    const y = viewport.y + (next.height - previous.height) / 2
    if (!focus) {
        return { x, y, zoom: viewport.zoom }
    }
    return {
        x: shiftIntoView(x, focus.x, focus.width, viewport.zoom, next.width),
        y: shiftIntoView(y, focus.y, focus.height, viewport.zoom, next.height),
        zoom: viewport.zoom,
    }
}

export interface MiniFlowLayout {
    nodes: { actionId: string; x: number; y: number; layer: number }[]
    edges: { from: Point; to: Point }[]
    width: number
    height: number
}

export function layoutMiniFlow(
    workflow: FlowGraph,
    memberIds: string[],
    spacing: { tile: number; gapX: number; gapY: number }
): MiniFlowLayout {
    const members = new Set(memberIds)
    const inner = workflow.edges.filter((edge) => members.has(edge.from) && members.has(edge.to))
    const layer = new Map(memberIds.map((id) => [id, 0]))
    memberIds.forEach(() =>
        inner.forEach((edge) => layer.set(edge.to, Math.max(layer.get(edge.to) ?? 0, (layer.get(edge.from) ?? 0) + 1)))
    )
    const columns: string[][] = []
    memberIds.forEach((id) => (columns[layer.get(id) ?? 0] ??= []).push(id))
    const tallest = Math.max(...columns.map((column) => column?.length ?? 0))
    const nodes = columns.flatMap((column, index) =>
        (column ?? []).map((actionId, row) => ({
            actionId,
            layer: index,
            x: index * (spacing.tile + spacing.gapX),
            y: (row - (column.length - 1) / 2 + (tallest - 1) / 2) * spacing.gapY,
        }))
    )
    const at = new Map(nodes.map((node) => [node.actionId, node]))
    const center = spacing.tile / 2
    return {
        nodes,
        edges: inner.map((edge) => {
            const from = at.get(edge.from) as Point
            const to = at.get(edge.to) as Point
            return { from: { x: from.x + spacing.tile, y: from.y + center }, to: { x: to.x, y: to.y + center } }
        }),
        width: columns.length * (spacing.tile + spacing.gapX) - spacing.gapX,
        height: (tallest - 1) * spacing.gapY + spacing.tile,
    }
}

function isInTriangle(point: Point, a: Point, b: Point, c: Point): boolean {
    const side = (p1: Point, p2: Point, p3: Point): number =>
        (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
    const sides = [side(point, a, b), side(point, b, c), side(point, c, a)]
    return !(sides.some((value) => value < 0) && sides.some((value) => value > 0))
}

/**
 * True while the pointer stays inside the triangle between where it left a step and the top edge of
 * that step's open preview. Steps it crosses on the way there must not take the hover away.
 */
export function isHeadingToRect(
    pointer: Point,
    apex: Point,
    rect: { left: number; right: number; top: number },
    slack: number
): boolean {
    return isInTriangle(pointer, apex, { x: rect.left - slack, y: rect.top }, { x: rect.right + slack, y: rect.top })
}

export interface PaletteSection {
    title: string
    steps: CreateActionType[]
}

export interface PaletteCommand {
    id: string
    label: string
    hint?: string
}

export type PaletteItem<Command extends PaletteCommand = PaletteCommand> =
    | { kind: 'step'; key: string; section: string; label: string; description?: string; step: CreateActionType }
    | { kind: 'command'; key: string; section: string; label: string; description?: string; command: Command }

const matches = (query: string, texts: (string | undefined)[]): boolean =>
    !query || texts.some((text) => text?.toLowerCase().includes(query.toLowerCase()))

// With an empty search, commands lead. Once someone types, they are probably after a step, so steps lead.
export function filterPaletteItems<Command extends PaletteCommand>(
    query: string,
    sections: PaletteSection[],
    commands: Command[]
): PaletteItem<Command>[] {
    const trimmed = query.trim()
    const steps = sections.flatMap(({ title, steps }) =>
        steps
            .filter((step) => matches(trimmed, [step.name, step.description, title]))
            .map(
                (step): PaletteItem<Command> => ({
                    kind: 'step',
                    key: `${title}:${step.name}`,
                    section: title,
                    label: step.name,
                    description: step.description,
                    step,
                })
            )
    )
    const commandItems = commands
        .filter((command) => matches(trimmed, [command.label, command.hint]))
        .map(
            (command): PaletteItem<Command> => ({
                kind: 'command',
                key: command.id,
                section: 'Commands',
                label: command.label,
                description: command.hint,
                command,
            })
        )
    return trimmed ? [...steps, ...commandItems] : [...commandItems, ...steps]
}

export interface CanvasMotion {
    kind: 'expand' | 'collapse' | 'settle'
    groupId: string
    origin: Point
}

export interface NodeMotion {
    type: 'enter' | 'leave' | 'pop' | 'fade-in' | 'fade-out'
    dx: number
    dy: number
}

export function nodeMotion(
    motion: CanvasMotion | null,
    node: VisibleNode,
    groups: PathGroup[],
    box: { x: number; y: number; width: number; height: number } | undefined
): NodeMotion | undefined {
    if (!motion || !box) {
        return undefined
    }
    if (motion.kind === 'settle') {
        return node.id === motion.groupId ? { type: 'pop', dx: 0, dy: 0 } : undefined
    }
    const group = groups.find((candidate) => candidate.id === motion.groupId)
    if (!group || !isInPathGroup(group, node)) {
        return undefined
    }
    return {
        type: motion.kind === 'expand' ? 'enter' : 'leave',
        dx: motion.origin.x - (box.x + box.width / 2),
        dy: motion.origin.y - (box.y + box.height / 2),
    }
}

export function frameMotion(
    motion: CanvasMotion | null,
    group: PathGroup,
    groups: PathGroup[]
): NodeMotion | undefined {
    if (!motion || motion.kind === 'settle') {
        return undefined
    }
    const isMoving =
        group.id === motion.groupId || ancestorsOf(groups, group).some((other) => other.id === motion.groupId)
    return isMoving ? { type: motion.kind === 'expand' ? 'fade-in' : 'fade-out', dx: 0, dy: 0 } : undefined
}
