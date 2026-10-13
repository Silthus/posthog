// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// Question: does a graph where nothing truncates, emails show their content, and the palette and
// inspector open only on demand let a newcomer say who gets which email, when, and what ends the flow?
import '@xyflow/react/dist/style.css'

import {
    Background,
    BackgroundVariant,
    Controls,
    EdgeLabelRenderer,
    EdgeProps,
    Handle,
    NodeProps,
    Panel,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
} from '@xyflow/react'
import clsx from 'clsx'
import { BindLogic, useActions, useValues } from 'kea'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { IconChevronDown, IconPerson, IconPlus, IconX } from '@posthog/icons'
import { LemonButton, LemonSegmentedButton, LemonSwitch } from '@posthog/lemon-ui'

import { Popover } from 'lib/lemon-ui/Popover'

import { themeLogic } from '~/layout/navigation-3000/themeLogic'

import { workflowLogic } from '../../../workflowLogic'
import { HogFlowBranchSelectionProvider } from '../../HogFlowBranchSelection'
import { hogFlowEditorLogic, HogFlowEditorMode } from '../../hogFlowEditorLogic'
import { HogFlowEditorPanel } from '../../panel/HogFlowEditorPanel'
import { HogFlowEditorPanelBuild } from '../../panel/HogFlowEditorPanelBuild'
import type { HogFlow } from '../../types'
import { LogsDrawer, simulateRun, TestRunPanel, VariablesPopover } from './CanvasDrawer'
import { SummaryCard } from './GraphFirstCards'
import { Compound, LABEL_HEIGHT, labelWidth, layoutGraph, LayoutResult, Point, PortSpec } from './graphFirstLayout'
import {
    actionById,
    BranchGroup,
    computeGroups,
    computeTrace,
    edgeKey,
    emailContent,
    FlowEdge,
    sampleMetrics,
    SampleMetrics,
    stepSentence,
    Trace,
    VisibleEdge,
    VisibleNode,
    visibleGraph,
} from './graphFirstModel'
import { NODE_STYLES, NodeStyle, StepNode } from './GraphFirstNodeStyles'
import { StepPanel } from './StepPanel'
import { pathColor } from './tileKinds'
import { PEEK_DETAILS, PeekDetail, TILE, TILE_FLOWS, TileFlow, TileGroupNode } from './TileNode'

const PANEL_WIDTH = 460
const FRAME_PADDING = { top: 30, side: 16, bottom: 16 }

export type GroupStyle = 'outline' | 'dashed' | 'tint' | 'bracket'

export const GROUP_STYLES: { value: GroupStyle; label: string; tooltip: string }[] = [
    { value: 'outline', label: 'Outline', tooltip: 'A thin outline in the path color, the name sits on the line.' },
    { value: 'dashed', label: 'Dashed', tooltip: 'A neutral dashed outline, the name inside in the path color.' },
    { value: 'tint', label: 'Tint', tooltip: 'No line, a faint wash of the path color.' },
    { value: 'bracket', label: 'Bracket', tooltip: 'No box, a colored bar down the left side of the path.' },
]
const COLLAPSE_ALL_ABOVE_STEPS = 30
const MIN_READABLE_ZOOM = 0.66

type ViewState = {
    workflow: HogFlow
    groups: BranchGroup[]
    trace: Trace | null
    metrics: SampleMetrics | null
    previews: boolean
    nodeStyle: NodeStyle
    tile: { flow: TileFlow; hover: boolean; peek: PeekDetail }
    groupStyle: GroupStyle
    selectedNodeId: string | null
    openStep: (nodeId: string) => void
    expand: (groupId: string) => void
    collapse: (groupId: string) => void
    choose: (nodeId: string, key: string) => void
}

const ViewContext = { current: null as ViewState | null }

function CardNode({ data }: NodeProps): JSX.Element {
    const view = ViewContext.current!
    const vnode = data.vnode as VisibleNode
    const onPath = view.trace
        ? vnode.kind === 'action'
            ? view.trace.nodeIds.includes(vnode.id)
            : vnode.group.memberIds.some((id) => view.trace!.nodeIds.includes(id))
        : false
    const state = {
        selected: view.selectedNodeId === vnode.id,
        dimmed: !!view.trace && !onPath,
        onPath,
        metrics: view.metrics,
        previews: view.previews,
    }
    return (
        <div {...motionProps(data.motion as NodeMotion | undefined)}>
            <Handle type="target" position={Position.Top} className="!opacity-0" isConnectable={false} />
            {vnode.kind === 'action' ? (
                <StepNode
                    action={vnode.action}
                    workflow={view.workflow}
                    state={state}
                    style={view.nodeStyle}
                    tile={view.tile}
                />
            ) : view.nodeStyle === 'tiles' ? (
                <TileGroupNode
                    group={vnode.group}
                    workflow={view.workflow}
                    state={state}
                    flow={view.tile.flow}
                    color={pathColor(vnode.group.edge)}
                    peekDetail={view.tile.peek}
                    onExpand={() => view.expand(vnode.group.id)}
                />
            ) : (
                <SummaryCard
                    group={vnode.group}
                    workflow={view.workflow}
                    state={state}
                    onExpand={() => view.expand(vnode.group.id)}
                />
            )}
            <Handle type="source" position={Position.Bottom} className="!opacity-0" isConnectable={false} />
        </div>
    )
}

function FrameHeader({
    group,
    color,
    chip,
    onCollapse,
}: {
    group: BranchGroup
    color: string
    chip: boolean
    onCollapse: () => void
}): JSX.Element {
    return (
        <div
            className={clsx(
                'nodrag flex w-max items-center gap-1.5 whitespace-nowrap pr-2.5',
                chip && 'rounded-full border bg-surface-primary shadow-sm'
            )}
            style={chip ? { borderColor: color } : undefined}
        >
            <LemonButton
                size="xsmall"
                icon={<IconChevronDown />}
                tooltip="Collapse this path"
                onClick={(e) => {
                    e.stopPropagation()
                    onCollapse()
                }}
            />
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[13px] font-semibold" style={{ color }}>
                {group.label}
            </span>
            <span className="text-xs text-secondary">when {group.condition}</span>
        </div>
    )
}

function FrameNode({ data, width, height }: NodeProps): JSX.Element {
    const view = ViewContext.current!
    const group = data.group as BranchGroup
    const color = pathColor(group.edge)
    const dimmed = view.trace && !group.memberIds.some((id) => view.trace!.nodeIds.includes(id))
    const style = view.groupStyle
    return (
        <div
            className={clsx(
                'relative transition-opacity',
                dimmed && 'opacity-40',
                motionProps(data.motion as NodeMotion | undefined).className
            )}
            style={{ width, height }}
        >
            {style === 'outline' && (
                <div className="absolute inset-0 rounded-2xl border-[1.5px]" style={{ borderColor: `${color}80` }} />
            )}
            {style === 'dashed' && (
                <div
                    className="absolute inset-0 rounded-2xl border-[1.5px] border-dashed"
                    style={{ borderColor: 'var(--color-border-bold, #9ca3af)' }}
                />
            )}
            {style === 'tint' && (
                <>
                    <div className="absolute inset-0 rounded-2xl" style={{ backgroundColor: `${color}0f` }} />
                    <div
                        className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full"
                        style={{ backgroundColor: color }}
                    />
                </>
            )}
            {style === 'bracket' && (
                <div
                    className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full"
                    style={{ backgroundColor: color }}
                />
            )}
        </div>
    )
}

/** The path name sits on the arrow that enters the path, so the arrow runs into the label, not through text. */
function FrameLabelNode({ data }: NodeProps): JSX.Element {
    const view = ViewContext.current!
    const group = data.group as BranchGroup
    const dimmed = view.trace && !group.memberIds.some((id) => view.trace!.nodeIds.includes(id))
    return (
        <div
            className={clsx(
                '-translate-y-1/2 transition-opacity',
                dimmed && 'opacity-40',
                motionProps(data.motion as NodeMotion | undefined).className
            )}
        >
            <FrameHeader group={group} color={pathColor(group.edge)} chip onCollapse={() => view.collapse(group.id)} />
        </div>
    )
}

const frameLabelWidth = (group: BranchGroup): number =>
    Math.ceil(group.label.length * 7.6 + group.condition.length * 6.6 + 70)

/** Where the path's entry arrow crosses the top of its frame. */
function entryX(points: Point[] | undefined, top: number, fallback: number): number {
    for (let i = 1; i < (points?.length ?? 0); i++) {
        const [a, b] = [points![i - 1], points![i]]
        if (a.x === b.x && Math.min(a.y, b.y) <= top && Math.max(a.y, b.y) >= top) {
            return a.x
        }
    }
    return fallback
}

function roundedPath(points: Point[]): string {
    if (points.length < 2) {
        return ''
    }
    const radius = 8
    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1]
        const point = points[i]
        const next = points[i + 1]
        const inLen = Math.hypot(point.x - prev.x, point.y - prev.y)
        const outLen = Math.hypot(next.x - point.x, next.y - point.y)
        const r = Math.min(radius, inLen / 2, outLen / 2)
        const before = { x: point.x - ((point.x - prev.x) / inLen) * r, y: point.y - ((point.y - prev.y) / inLen) * r }
        const after = { x: point.x + ((next.x - point.x) / outLen) * r, y: point.y + ((next.y - point.y) / outLen) * r }
        d += ` L ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`
    }
    const last = points[points.length - 1]
    return `${d} L ${last.x} ${last.y}`
}

function insertPoint(points: Point[], label?: Point): Point {
    if (label) {
        return label
    }
    let best = { length: -1, point: points[0] }
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]
        const b = points[i]
        const length = Math.abs(b.y - a.y) + Math.abs(b.x - a.x)
        if ((a.x === b.x || a.y === b.y) && length > best.length) {
            best = { length, point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
        }
    }
    return best.point
}

function InsertButton({ edge, at, offsetX }: { edge: FlowEdge; at: Point; offsetX: number }): JSX.Element {
    const [open, setOpen] = useState(false)
    const { isMovingNode, isCopyingNode, nodeToBeAdded, dropzoneNodes } = useValues(hogFlowEditorLogic)
    const {
        setNodeToBeAdded,
        onDrop,
        setHighlightedDropzoneNodeId,
        moveNodeToHighlightedDropzone,
        copyNodeToHighlightedDropzone,
    } = useActions(hogFlowEditorLogic)
    const placing = isMovingNode || isCopyingNode
    const eager = placing || !!nodeToBeAdded

    const place = (): void => {
        const dropzone = dropzoneNodes.find((zone) => zone.data.edge.id === edgeKey(edge))
        if (!dropzone) {
            return
        }
        setHighlightedDropzoneNodeId(dropzone.id)
        if (isMovingNode) {
            moveNodeToHighlightedDropzone()
        } else {
            copyNodeToHighlightedDropzone()
        }
    }

    return (
        <div
            className="nodrag nopan absolute"
            style={{
                transform: `translate(-50%, -50%) translate(${at.x + offsetX}px, ${at.y}px)`,
                pointerEvents: 'all',
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault()
                onDrop(undefined, edge)
            }}
        >
            <Popover
                visible={open}
                onClickOutside={() => setOpen(false)}
                placement="right-start"
                overlay={
                    <div className="w-80">
                        <HogFlowEditorPanelBuild
                            className="max-h-96 p-2"
                            onActionSelect={(action) => {
                                setNodeToBeAdded(action)
                                onDrop(undefined, edge)
                                setOpen(false)
                            }}
                        />
                    </div>
                }
            >
                <button
                    type="button"
                    aria-label="Add a step here"
                    title={placing ? 'Place the step here' : 'Add a step here'}
                    onClick={() => (placing ? place() : setOpen(!open))}
                    className={clsx(
                        'flex size-5 cursor-pointer items-center justify-center rounded-full border bg-surface-primary text-secondary transition-all hover:scale-125 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]',
                        eager
                            ? 'scale-125 border-[var(--color-accent)] text-[var(--color-accent)] shadow'
                            : 'opacity-60'
                    )}
                >
                    <IconPlus className="text-xs" />
                </button>
            </Popover>
        </div>
    )
}

function RoutedEdge({ data }: EdgeProps): JSX.Element | null {
    const view = ViewContext.current!
    const vedge = data?.vedge as VisibleEdge
    const routed = data?.routed as { points: Point[]; label?: Point } | undefined
    const label = data?.label as string | undefined
    if (!routed) {
        return null
    }
    const onPath = view.trace ? vedge.originalKeys.some((key) => view.trace!.edgeKeys.has(key)) : false
    const dimmed = !!view.trace && !onPath
    const people = view.metrics ? (view.metrics.peopleByEdge[vedge.originalKeys[0]] ?? null) : null
    const insertAt = insertPoint(routed.points, label ? routed.label : undefined)
    const canTraceChoice = !!view.trace && !!vedge.original && !!vedge.label && !vedge.timing
    const timingSelected = !!vedge.timing && vedge.timing.stepIds.includes(view.selectedNodeId ?? '')
    const stroke = onPath ? 'var(--color-accent)' : 'var(--color-border-bold, #9ca3af)'

    return (
        <>
            <path
                d={roundedPath(routed.points)}
                fill="none"
                stroke={stroke}
                strokeWidth={onPath ? 2.5 : 1.5}
                opacity={dimmed ? 0.25 : 1}
            />
            <path
                d={arrowHead(routed.points)}
                fill="none"
                stroke={stroke}
                strokeWidth={1.5}
                opacity={dimmed ? 0.25 : 1}
            />
            <EdgeLabelRenderer>
                {label && routed.label && (
                    <div
                        className={clsx(
                            'nodrag nopan absolute flex items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs',
                            vedge.timing ? 'cursor-pointer border-dashed font-medium' : 'font-semibold',
                            onPath && !vedge.timing
                                ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                                : 'bg-surface-primary text-primary',
                            (onPath || timingSelected) && vedge.timing && 'border-[var(--color-accent)]',
                            dimmed && 'opacity-40',
                            (canTraceChoice || vedge.timing) && 'hover:border-[var(--color-accent)]',
                            canTraceChoice && 'cursor-pointer'
                        )}
                        style={{
                            transform: `translate(-50%, -50%) translate(${routed.label.x}px, ${routed.label.y}px)`,
                            height: LABEL_HEIGHT,
                            minWidth: labelWidth(label),
                            pointerEvents: 'all',
                        }}
                        title={vedge.timing ? 'Open this wait' : canTraceChoice ? 'Follow this path' : undefined}
                        onClick={() => {
                            if (vedge.timing) {
                                view.openStep(vedge.timing.stepIds[0])
                            } else if (canTraceChoice) {
                                view.choose(vedge.source, `${vedge.original!.type}:${vedge.original!.index ?? ''}`)
                            }
                        }}
                    >
                        {label.replace('🕘 ', '')}
                        {people !== null && <span className="font-normal opacity-70">· {people.toLocaleString()}</span>}
                    </div>
                )}
                {!label && people !== null && (
                    <div
                        className="absolute rounded bg-surface-primary px-1 text-[11px] text-secondary"
                        style={{ transform: `translate(14px, -50%) translate(${insertAt.x}px, ${insertAt.y}px)` }}
                    >
                        {people.toLocaleString()} people
                    </div>
                )}
                {vedge.original && (
                    <InsertButton
                        edge={vedge.original}
                        at={insertAt}
                        offsetX={label && routed.label ? labelWidth(label) / 2 + 14 : 0}
                    />
                )}
            </EdgeLabelRenderer>
        </>
    )
}

type Size = { width: number; height: number; anchor?: { x: number; y: number; width: number; height: number } }

function SwitchRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
    return (
        <div className="flex items-center gap-2 rounded-lg border bg-surface-primary py-1 pl-2.5 pr-1 shadow-sm">
            <span className="text-xs font-semibold text-secondary">{label}</span>
            {children}
        </div>
    )
}

function arrowHead(points: Point[]): string {
    const end = points[points.length - 1]
    const before = points[points.length - 2] ?? { x: end.x, y: end.y - 1 }
    const length = Math.hypot(end.x - before.x, end.y - before.y) || 1
    const [dx, dy] = [(end.x - before.x) / length, (end.y - before.y) / length]
    const back = { x: end.x - dx * 7, y: end.y - dy * 7 }
    return `M ${back.x - dy * 4} ${back.y + dx * 4} L ${end.x} ${end.y} L ${back.x + dy * 4} ${back.y - dx * 4}`
}

/** Rail and Right flows connect to the tile itself, not to the box around tile and caption. */
function tilePortsFor(size: Size | undefined, flow: TileFlow, count: number): PortSpec | undefined {
    const anchor = size?.anchor
    if (!size || !anchor) {
        return undefined
    }
    const spread = (index: number, step: number): number => (index - (count - 1) / 2) * step
    if (flow === 'rail') {
        return {
            in: { x: anchor.x, y: 0 },
            out: Array.from({ length: count }, (_, index) => ({ x: anchor.x + spread(index, 14), y: size.height })),
        }
    }
    return {
        in: { x: 0, y: anchor.y },
        out: Array.from({ length: count }, (_, index) => ({ x: size.width, y: anchor.y + spread(index, 14) })),
    }
}

/** ELK ends edges at the node box. Pull the ends in to the tile edge so no arrow floats in empty space. */
function attachToTiles(
    result: LayoutResult,
    edges: VisibleEdge[],
    sizes: Record<string, Size>,
    flow: TileFlow
): LayoutResult {
    const ends = Object.fromEntries(edges.map((edge) => [edge.id, [edge.source, edge.target]]))
    const edgePoints = Object.fromEntries(
        Object.entries(result.edgePoints).map(([id, edge]) => {
            const [source, target] = ends[id] ?? []
            const points = edge.points.map((point) => ({ ...point }))
            const from = sizes[source]?.anchor
            const to = sizes[target]?.anchor
            const fromPos = result.positions[source]
            const toPos = result.positions[target]
            if (flow === 'right') {
                if (from && fromPos) {
                    points[0].x = fromPos.x + from.x + from.width / 2
                }
                if (to && toPos) {
                    points[points.length - 1].x = toPos.x + to.x - to.width / 2
                }
            } else if (from && fromPos) {
                points[0].y = fromPos.y + from.y + from.height / 2 + (from.height === TILE ? 10 : 0)
            }
            return [id, { ...edge, points }]
        })
    )
    return { ...result, edgePoints }
}

type Motion = { kind: 'expand' | 'collapse' | 'settle'; groupId: string; origin: Point }
type NodeMotion = { type: 'enter' | 'leave' | 'pop' | 'fade-in' | 'fade-out'; dx?: number; dy?: number }

const LEAVE_MS = 260
const MOTION_MS = 1100

/** Steps fly out of the stack on open and back into it on close; the rest glide to their new places. */
const MOTION_CSS = `
@keyframes gf-enter { from { transform: translate(var(--gf-dx), var(--gf-dy)) scale(0.4); opacity: 0 } }
@keyframes gf-leave { to { transform: translate(var(--gf-dx), var(--gf-dy)) scale(0.4); opacity: 0 } }
@keyframes gf-pop { from { transform: scale(0.6); opacity: 0 } }
@keyframes gf-fade-in { from { opacity: 0 } }
@keyframes gf-fade-out { to { opacity: 0 } }
@keyframes gf-edges { 0%, 55% { opacity: 0 } 100% { opacity: 1 } }
.gf-enter { animation: gf-enter 460ms cubic-bezier(0.2, 0.8, 0.2, 1) both }
.gf-leave { animation: gf-leave ${LEAVE_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards }
.gf-pop { animation: gf-pop 320ms cubic-bezier(0.2, 0.8, 0.2, 1) 200ms both }
.gf-fade-in { animation: gf-fade-in 380ms ease 180ms both }
.gf-fade-out { animation: gf-fade-out 160ms ease forwards }
.gf-moving .react-flow__node { transition: transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1) }
.gf-moving .react-flow__viewport { transition: transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1) }
.gf-moving .react-flow__edges, .gf-moving .react-flow__edgelabel-renderer { animation: gf-edges 760ms ease both }
@media (prefers-reduced-motion: reduce) { .gf-enter, .gf-leave, .gf-pop, .gf-fade-in, .gf-fade-out { animation: none } .gf-moving * { transition: none !important } }
`

function inGroup(groups: BranchGroup[], groupId: string, vnode: VisibleNode): boolean {
    const group = groups.find((candidate) => candidate.id === groupId)
    if (!group) {
        return false
    }
    return vnode.kind === 'action'
        ? group.memberIds.includes(vnode.id)
        : group.memberIds.includes(vnode.group.branchNodeId)
}

function nodeMotion(
    motion: Motion | null,
    vnode: VisibleNode,
    groups: BranchGroup[],
    box: { x: number; y: number; width: number; height: number } | undefined
): NodeMotion | undefined {
    if (!motion || !box) {
        return undefined
    }
    if (motion.kind === 'settle') {
        return vnode.id === motion.groupId ? { type: 'pop' } : undefined
    }
    if (!inGroup(groups, motion.groupId, vnode)) {
        return undefined
    }
    const dx = motion.origin.x - (box.x + box.width / 2)
    const dy = motion.origin.y - (box.y + box.height / 2)
    return { type: motion.kind === 'expand' ? 'enter' : 'leave', dx, dy }
}

function frameMotion(motion: Motion | null, group: BranchGroup, groups: BranchGroup[]): NodeMotion | undefined {
    if (!motion || motion.kind === 'settle') {
        return undefined
    }
    let current: BranchGroup | undefined = group
    while (current && current.id !== motion.groupId) {
        current = groups.find((candidate) => candidate.id === current!.parentId)
    }
    return current ? { type: motion.kind === 'expand' ? 'fade-in' : 'fade-out' } : undefined
}

function motionProps(motion: NodeMotion | undefined): { className?: string; style?: React.CSSProperties } {
    if (!motion) {
        return {}
    }
    return {
        className: `gf-${motion.type}`,
        style: { '--gf-dx': `${motion.dx ?? 0}px`, '--gf-dy': `${motion.dy ?? 0}px` } as React.CSSProperties,
    }
}

const NODE_TYPES = { card: CardNode, frame: FrameNode, frameLabel: FrameLabelNode }
const EDGE_TYPES = { routed: RoutedEdge }

function MeasureLayer({
    nodes,
    workflow,
    metrics,
    previews,
    nodeStyle,
    tile,
    onMeasured,
}: {
    nodes: VisibleNode[]
    workflow: HogFlow
    metrics: SampleMetrics | null
    previews: boolean
    nodeStyle: NodeStyle
    tile: { flow: TileFlow; hover: boolean }
    onMeasured: (sizes: Record<string, Size>) => void
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null)
    useLayoutEffect(() => {
        const measure = (): void => {
            const sizes: Record<string, Size> = {}
            ref.current?.querySelectorAll<HTMLElement>('[data-measure-id]').forEach((el) => {
                const child = el.firstElementChild as HTMLElement
                const anchor = child.querySelector<HTMLElement>('[data-tile-anchor]')
                const box = child.getBoundingClientRect()
                const anchorBox = anchor?.getBoundingClientRect()
                sizes[el.dataset.measureId!] = {
                    width: child.offsetWidth,
                    height: child.offsetHeight,
                    anchor: anchorBox
                        ? {
                              x: anchorBox.left - box.left + anchorBox.width / 2,
                              y: anchorBox.top - box.top + anchorBox.height / 2,
                              width: anchorBox.width,
                              height: anchorBox.height,
                          }
                        : undefined,
                }
            })
            onMeasured(sizes)
        }
        measure()
        let cancelled = false
        void document.fonts.ready.then(() => !cancelled && measure())
        return () => {
            cancelled = true
        }
    }, [nodes, metrics, previews, nodeStyle, tile.flow]) // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <div ref={ref} aria-hidden className="pointer-events-none invisible absolute left-[-20000px] top-0">
            {nodes.map((vnode) => (
                <div key={vnode.id} data-measure-id={vnode.id} className="w-max">
                    {vnode.kind === 'action' ? (
                        <StepNode
                            action={vnode.action}
                            workflow={workflow}
                            state={{ metrics, previews }}
                            style={nodeStyle}
                            tile={{ ...tile, hover: false }}
                        />
                    ) : nodeStyle === 'tiles' ? (
                        <TileGroupNode group={vnode.group} workflow={workflow} flow={tile.flow} />
                    ) : (
                        <SummaryCard group={vnode.group} workflow={workflow} />
                    )}
                </div>
            ))}
        </div>
    )
}

function shownGroups(groups: BranchGroup[], collapsed: Set<string>): BranchGroup[] {
    const isHidden = (group: BranchGroup): boolean => {
        let parent = groups.find((g) => g.id === group.parentId)
        while (parent) {
            if (collapsed.has(parent.id)) {
                return true
            }
            parent = groups.find((g) => g.id === parent!.parentId)
        }
        return false
    }
    return groups.filter((group) => !collapsed.has(group.id) && !isHidden(group))
}

/** Every open path becomes an ELK container holding the steps it owns, nested like the paths are. */
function compoundsFor(groups: BranchGroup[], collapsed: Set<string>, nodes: VisibleNode[]): Compound[] {
    const shown = shownGroups(groups, collapsed)
    return shown.map((group) => ({
        id: `frame:${group.id}`,
        parentId: group.parentId ? `frame:${group.parentId}` : null,
        memberIds: nodes
            .filter((node) =>
                node.kind === 'action'
                    ? group.memberIds.includes(node.id)
                    : group.memberIds.includes(node.group.branchNodeId)
            )
            .map((node) => node.id),
        padding: FRAME_PADDING,
        minWidth: frameLabelWidth(group) + 32,
    }))
}

function PersonTracePanel({
    workflow,
    trace,
    choose,
    onClose,
}: {
    workflow: HogFlow
    trace: Trace
    choose: (nodeId: string, key: string) => void
    onClose: () => void
}): JSX.Element {
    const byId = actionById(workflow)
    const { hogFunctionTemplatesById } = useValues(workflowLogic)
    const decisionByNode = Object.fromEntries(trace.decisions.map((d) => [d.nodeId, d]))
    return (
        <div className="flex max-h-full flex-col overflow-hidden rounded-lg border bg-surface-primary">
            <div className="flex items-center gap-2 border-b px-3 py-2">
                <IconPerson className="text-lg" />
                <div className="flex-1">
                    <div className="text-sm font-semibold">Follow a person</div>
                    <div className="text-xs text-secondary">
                        Pick their answers. Click a path label on the canvas too.
                    </div>
                </div>
                <LemonButton size="small" icon={<IconX />} onClick={onClose} tooltip="Stop following" />
            </div>
            <ol className="m-0 flex flex-col gap-2 overflow-y-auto px-3 py-2 pl-8">
                {trace.nodeIds.map((id) => {
                    const action = byId[id]
                    const decision = decisionByNode[id]
                    const template = (action.config as Record<string, any>).template_id
                    const isEmail = !!emailContent(action)
                    return (
                        <li key={id} className={clsx('text-[13px] leading-snug', isEmail && 'font-semibold')}>
                            {decision ? (
                                <div className="flex flex-col gap-1">
                                    <span>{decision.question}</span>
                                    <LemonSegmentedButton
                                        size="xsmall"
                                        value={decision.chosen}
                                        onChange={(key) => choose(id, key)}
                                        options={decision.options.map((o) => ({ value: o.key, label: o.label }))}
                                    />
                                </div>
                            ) : (
                                stepSentence(
                                    workflow,
                                    action,
                                    template ? hogFunctionTemplatesById[template]?.name : undefined
                                )
                            )}
                        </li>
                    )
                })}
            </ol>
        </div>
    )
}

function ViewMenu({ toggles }: { toggles: [string, boolean, (value: boolean) => void][] }): JSX.Element {
    const [open, setOpen] = useState(false)
    return (
        <Popover
            visible={open}
            onClickOutside={() => setOpen(false)}
            placement="bottom-start"
            overlay={
                <div className="flex flex-col gap-1 p-1">
                    {toggles.map(([label, checked, onChange]) => (
                        <LemonSwitch key={label} label={label} checked={checked} onChange={onChange} fullWidth />
                    ))}
                </div>
            }
        >
            <LemonButton size="small" sideIcon={<IconChevronDown />} onClick={() => setOpen(!open)} active={open}>
                View
            </LemonButton>
        </Popover>
    )
}

function GraphFirstCanvas({
    initialNodeStyle,
    initialTileFlow,
    initialTileHover,
    initialGroupStyle,
    initialCollapsed,
    initialPeek,
    showStyleSwitch,
}: {
    initialNodeStyle: NodeStyle
    initialTileFlow: TileFlow
    initialTileHover: boolean
    initialGroupStyle: GroupStyle
    initialCollapsed: 'all' | 'auto'
    initialPeek: PeekDetail
    showStyleSwitch: boolean
}): JSX.Element {
    const { isDarkModeOn } = useValues(themeLogic)
    const { workflow, selectedNodeId, panelWidth, isMovingNode, isCopyingNode } = useValues(hogFlowEditorLogic)
    const { setSelectedNodeId, setMode, setPanelWidth, handlePaneClick, stopMovingNode, stopCopyingNode } =
        useActions(hogFlowEditorLogic)
    const reactFlow = useReactFlow()
    const wrapperRef = useRef<HTMLDivElement>(null)

    const groups = useMemo(() => computeGroups(workflow), [workflow])
    const [collapsed, setCollapsed] = useState<Set<string>>(
        () =>
            new Set(
                initialCollapsed === 'all' || workflow.actions.length > COLLAPSE_ALL_ABOVE_STEPS
                    ? computeGroups(workflow).map((g) => g.id)
                    : []
            )
    )
    const [traceOn, setTraceOn] = useState(false)
    const [choices, setChoices] = useState<Record<string, string>>({})
    const [showMetrics, setShowMetrics] = useState(true)
    const [previews, setPreviews] = useState(
        () => workflow.actions.filter((action) => emailContent(action)).length <= 3
    )
    const [nodeStyle, setNodeStyle] = useState<NodeStyle>(initialNodeStyle)
    const [tileFlow, setTileFlow] = useState<TileFlow>(initialTileFlow)
    const [tileHover, setTileHover] = useState(initialTileHover)
    const [peekDetail, setPeekDetail] = useState<PeekDetail>(initialPeek)
    const tile = useMemo(
        () => ({ flow: tileFlow, hover: tileHover, peek: peekDetail }),
        [tileFlow, tileHover, peekDetail]
    )
    const [groupStyle] = useState<GroupStyle>(initialGroupStyle)
    const [testOpen, setTestOpen] = useState(false)
    const [logsOpen, setLogsOpen] = useState(false)
    const [motion, setMotion] = useState<Motion | null>(null)
    const motionTimer = useRef<number>()
    const [testTrace, setTestTrace] = useState<Trace | null>(null)
    const direction = nodeStyle === 'tiles' && tileFlow === 'right' ? 'RIGHT' : 'DOWN'
    const [panelOpen, setPanelOpen] = useState(false)
    const [sizes, setSizes] = useState<Record<string, Size> | null>(null)
    const [layout, setLayout] = useState<LayoutResult | null>(null)

    const graph = useMemo(() => visibleGraph(workflow, groups, collapsed), [workflow, groups, collapsed])
    const labels = useMemo(() => {
        const summaryEntries = graph.nodes.flatMap((node) =>
            node.kind === 'summary' ? [edgeKey(node.group.edge)] : []
        )
        const framedEntries = new Set([
            ...shownGroups(groups, collapsed).map((group) => edgeKey(group.edge)),
            ...(nodeStyle === 'tiles' ? summaryEntries : []),
        ])
        return Object.fromEntries(
            graph.edges.map((vedge) => {
                const branch = framedEntries.has(vedge.originalKeys[0]) ? undefined : vedge.label
                const timing = vedge.timing ? `🕘 ${vedge.timing.text}` : undefined
                return [vedge.id, [branch, timing].filter(Boolean).join(' · ') || undefined]
            })
        )
    }, [graph.edges, graph.nodes, groups, collapsed, nodeStyle])
    const followTrace = useMemo(() => (traceOn ? computeTrace(workflow, choices) : null), [traceOn, workflow, choices])
    const trace = (testOpen ? testTrace : null) ?? followTrace
    const metrics = useMemo(() => (showMetrics ? sampleMetrics(workflow) : null), [showMetrics, workflow])
    const sideOpen = panelOpen || !!followTrace
    const selectedAction =
        panelOpen && selectedNodeId ? workflow.actions.find((a) => a.id === selectedNodeId) : undefined
    const compounds = useMemo(() => compoundsFor(groups, collapsed, graph.nodes), [groups, collapsed, graph.nodes])

    useEffect(() => {
        if (panelWidth === null) {
            setPanelWidth(PANEL_WIDTH)
        }
    }, [panelWidth, setPanelWidth])

    useEffect(() => {
        if (!sizes) {
            return
        }
        let cancelled = false
        const portFractions = Object.fromEntries(
            workflow.actions
                .filter((action) => action.type === 'wait_until_condition')
                .map((action) => [action.id, [0.12, 0.5]])
        )
        const tilePorts = nodeStyle === 'tiles' && tileFlow !== 'down'
        void layoutGraph(
            sizes,
            graph.edges,
            labels,
            direction === 'DOWN' && !tilePorts ? portFractions : {},
            direction,
            tilePorts ? (id, count) => tilePortsFor(sizes[id], tileFlow, count) : undefined,
            compounds
        ).then(
            (result) =>
                !cancelled && setLayout(tilePorts ? attachToTiles(result, graph.edges, sizes, tileFlow) : result)
        )
        return () => {
            cancelled = true
        }
    }, [sizes, graph.edges, labels, direction, compounds]) // eslint-disable-line react-hooks/exhaustive-deps

    const view: ViewState = {
        workflow,
        groups,
        trace,
        metrics,
        previews,
        nodeStyle,
        tile,
        groupStyle,
        selectedNodeId: panelOpen ? selectedNodeId : null,
        openStep: (nodeId) => openPanel('build', nodeId),
        expand: (id) => {
            const position = layout?.positions[id]
            const size = sizes?.[id]
            const anchor = size?.anchor
            animate({
                kind: 'expand',
                groupId: id,
                origin: position
                    ? { x: position.x + (anchor?.x ?? (size?.width ?? 0) / 2), y: position.y + (anchor?.y ?? 0) }
                    : { x: 0, y: 0 },
            })
            setCollapsed((prev) => new Set([...prev].filter((g) => g !== id)))
        },
        collapse: (id) => {
            const box = layout?.frames[`frame:${id}`]
            const origin = box ? { x: box.x + box.width / 2, y: box.y + 40 } : { x: 0, y: 0 }
            animate({ kind: 'collapse', groupId: id, origin })
            window.setTimeout(() => {
                setCollapsed((prev) => new Set([...prev, id]))
                animate({ kind: 'settle', groupId: id, origin })
            }, LEAVE_MS)
        },
        choose: (nodeId, key) => {
            setTraceOn(true)
            setChoices((prev) => ({ ...prev, [nodeId]: key }))
        },
    }
    ViewContext.current = view
    const tick = useMemo(
        () => ({}),
        [trace, metrics, previews, nodeStyle, tile, groupStyle, selectedNodeId, panelOpen, workflow]
    ) // eslint-disable-line react-hooks/exhaustive-deps

    const rfNodes = useMemo(() => {
        if (!layout || !sizes) {
            return []
        }
        const boxes = Object.fromEntries(
            graph.nodes
                .filter((n) => layout.positions[n.id] && sizes[n.id])
                .map((n) => [n.id, { ...layout.positions[n.id], ...sizes[n.id] }])
        )
        const frames = shownGroups(groups, collapsed)
            .filter((group) => layout.frames[`frame:${group.id}`])
            .map((group) => {
                const box = layout.frames[`frame:${group.id}`]
                return {
                    id: `frame:${group.id}`,
                    type: 'frame',
                    position: { x: box.x, y: box.y },
                    width: box.width,
                    height: box.height,
                    data: { group, tick, motion: frameMotion(motion, group, groups) },
                    selectable: false,
                    draggable: false,
                    zIndex: -10 + group.depth,
                }
            })
        const frameLabels = shownGroups(groups, collapsed)
            .filter((group) => layout.frames[`frame:${group.id}`])
            .map((group) => {
                const box = layout.frames[`frame:${group.id}`]
                const entry = graph.edges.find((edge) => edge.originalKeys.includes(edgeKey(group.edge)))
                const x = entryX(entry ? layout.edgePoints[entry.id]?.points : undefined, box.y, box.x + box.width / 2)
                const width = frameLabelWidth(group)
                const left = Math.min(Math.max(x - width / 2, box.x + 8), box.x + box.width - width - 8)
                return {
                    id: `frameLabel:${group.id}`,
                    type: 'frameLabel',
                    position: { x: left, y: box.y },
                    data: { group, tick, motion: frameMotion(motion, group, groups) },
                    selectable: false,
                    draggable: false,
                    zIndex: 5,
                }
            })
        return [
            ...frames,
            ...frameLabels,
            ...graph.nodes
                .filter((n) => layout.positions[n.id])
                .map((vnode) => ({
                    id: vnode.id,
                    type: 'card',
                    position: layout.positions[vnode.id],
                    data: { vnode, tick, motion: nodeMotion(motion, vnode, groups, boxes[vnode.id]) },
                    selectable: vnode.kind === 'action',
                    draggable: false,
                })),
        ]
    }, [layout, sizes, graph.nodes, groups, collapsed, tick, motion])

    const rfEdges = useMemo(
        () =>
            graph.edges.map((vedge) => ({
                id: vedge.id,
                source: vedge.source,
                target: vedge.target,
                type: 'routed',
                data: { vedge, routed: layout?.edgePoints[vedge.id], label: labels[vedge.id], tick },
                selectable: false,
            })),
        [graph.edges, layout, labels, tick]
    )

    const fitWidth = (onlyIds?: string[]): void => {
        const width = wrapperRef.current?.clientWidth
        const nodesToFit = onlyIds ? rfNodes.filter((n) => onlyIds.includes(n.id)) : rfNodes
        if (!width || !nodesToFit.length) {
            return
        }
        const height = wrapperRef.current?.clientHeight ?? 800
        const edgePoints = (onlyIds ? [] : Object.values(layout?.edgePoints ?? {})).flatMap((e) => [
            ...e.points,
            ...(e.labelBox
                ? [
                      { x: e.labelBox.x - 30, y: e.labelBox.y },
                      { x: e.labelBox.x + e.labelBox.width + 30, y: e.labelBox.y + e.labelBox.height },
                  ]
                : []),
        ])
        const xs = [
            ...nodesToFit.flatMap((n) => [
                n.position.x,
                n.position.x + ((n as any).width ?? sizes?.[n.id]?.width ?? 260),
            ]),
            ...edgePoints.map((p) => p.x),
        ]
        const ys = [
            ...nodesToFit.flatMap((n) => [
                n.position.y,
                n.position.y + ((n as any).height ?? sizes?.[n.id]?.height ?? 80),
            ]),
            ...edgePoints.map((p) => p.y),
        ]
        const minX = Math.min(...xs) - 24
        const maxX = Math.max(...xs) + 24
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        const widthZoom = (width - 32) / (maxX - minX)
        const heightZoom = (height - 88) / (maxY - minY)
        const zoom =
            direction === 'DOWN'
                ? Math.min(1, widthZoom, Math.max(heightZoom, MIN_READABLE_ZOOM))
                : Math.min(1, heightZoom, Math.max(widthZoom, MIN_READABLE_ZOOM))
        const x = Math.max(16, (width - (maxX - minX) * zoom) / 2) - minX * zoom
        const y =
            direction === 'DOWN' ? 64 - minY * zoom : Math.max(64, (height - (maxY - minY) * zoom) / 2) - minY * zoom
        void reactFlow.setViewport({ x, y, zoom })
    }

    useEffect(() => {
        fitWidth()
    }, [layout]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (panelOpen && selectedNodeId) {
            return
        }
        const pathIds = trace
            ? graph.nodes
                  .filter((n) =>
                      n.kind === 'action'
                          ? trace.nodeIds.includes(n.id)
                          : n.group.memberIds.some((id) => trace.nodeIds.includes(id))
                  )
                  .map((n) => n.id)
            : undefined
        const timer = setTimeout(() => fitWidth(pathIds), 30)
        return () => clearTimeout(timer)
    }, [sideOpen, testOpen, logsOpen]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                setPanelOpen(false)
                setSelectedNodeId(null)
                isMovingNode && stopMovingNode()
                isCopyingNode && stopCopyingNode()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isMovingNode, isCopyingNode, setSelectedNodeId, stopMovingNode, stopCopyingNode])

    const closePanel = (): void => {
        setPanelOpen(false)
        setSelectedNodeId(null)
    }

    const animate = (next: Motion): void => {
        window.clearTimeout(motionTimer.current)
        setMotion(next)
        motionTimer.current = window.setTimeout(() => setMotion(null), MOTION_MS)
    }

    const openPanel = (nextMode: HogFlowEditorMode, nodeId: string | null = null): void => {
        setSelectedNodeId(nodeId)
        setMode(nextMode)
        setPanelOpen(true)
        if (nodeId) {
            setTimeout(() => {
                const node = reactFlow.getNode(nodeId)
                const size = sizes?.[nodeId]
                if (node && size) {
                    void reactFlow.setCenter(node.position.x + size.width / 2, node.position.y + size.height / 2, {
                        zoom: Math.max(reactFlow.getZoom(), 0.85),
                        duration: 250,
                    })
                }
            }, 60)
        }
    }

    const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.id))

    return (
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden" data-attr="workflow-editor">
            <MeasureLayer
                nodes={graph.nodes}
                workflow={workflow}
                metrics={metrics}
                previews={previews}
                nodeStyle={nodeStyle}
                tile={tile}
                onMeasured={setSizes}
            />
            <style>{MOTION_CSS}</style>
            {testOpen && (
                <TestRunPanel
                    workflow={workflow}
                    trace={testTrace}
                    onRun={(run) => {
                        setTraceOn(false)
                        setTestTrace(run)
                    }}
                    onSelectStep={(id) => openPanel('build', id)}
                    onClose={() => {
                        setTestOpen(false)
                        setTestTrace(null)
                    }}
                />
            )}
            <div className={clsx('flex min-h-0 min-w-0 grow flex-col', motion && 'gf-moving')}>
                <div ref={wrapperRef} className="flex min-h-0 min-w-0 grow">
                    <ReactFlow
                        className="grow"
                        nodes={rfNodes}
                        edges={rfEdges}
                        nodeTypes={NODE_TYPES}
                        edgeTypes={EDGE_TYPES}
                        minZoom={0.15}
                        maxZoom={1.5}
                        panOnScroll
                        zoomOnScroll={false}
                        zoomActivationKeyCode={['Meta', 'Control']}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        colorMode={isDarkModeOn ? 'dark' : 'light'}
                        onNodeClick={(_, node) =>
                            node.type === 'card' && node.selectable && openPanel('build', node.id)
                        }
                        onPaneClick={() => {
                            handlePaneClick()
                            setPanelOpen(false)
                        }}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background gap={36} variant={BackgroundVariant.Dots} />
                        <Panel position="top-left" className="!m-3">
                            <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-surface-primary p-1 shadow-sm">
                                <LemonButton
                                    size="small"
                                    type="primary"
                                    icon={<IconPlus />}
                                    onClick={() => openPanel('build')}
                                >
                                    Add step
                                </LemonButton>
                                <VariablesPopover workflow={workflow} />
                                <LemonButton
                                    size="small"
                                    onClick={() => {
                                        setTestOpen(!testOpen)
                                        setTestTrace(null)
                                    }}
                                    active={testOpen}
                                >
                                    Test
                                </LemonButton>
                                <LemonButton size="small" onClick={() => setLogsOpen(!logsOpen)} active={logsOpen}>
                                    Logs
                                </LemonButton>
                                <div className="mx-1 h-5 w-px bg-border" />
                                <LemonButton
                                    size="small"
                                    icon={<IconPerson />}
                                    active={traceOn}
                                    onClick={() => {
                                        setTraceOn(!traceOn)
                                        setPanelOpen(false)
                                    }}
                                >
                                    Follow a person
                                </LemonButton>
                                <ViewMenu
                                    toggles={[
                                        ['Email previews', previews, setPreviews],
                                        ['Sample metrics', showMetrics, setShowMetrics],
                                        ...(nodeStyle === 'tiles'
                                            ? [
                                                  ['Hover cards', tileHover, setTileHover] as [
                                                      string,
                                                      boolean,
                                                      (value: boolean) => void,
                                                  ],
                                              ]
                                            : []),
                                    ]}
                                />
                                {groups.length > 0 && !sideOpen && (
                                    <LemonButton
                                        size="small"
                                        onClick={() =>
                                            setCollapsed(new Set(allCollapsed ? [] : groups.map((g) => g.id)))
                                        }
                                    >
                                        {allCollapsed ? 'Open all paths' : 'Collapse paths'}
                                    </LemonButton>
                                )}
                                <LemonButton size="small" onClick={() => fitWidth()}>
                                    Fit
                                </LemonButton>
                            </div>
                        </Panel>
                        <Panel position="bottom-right" className="!m-3">
                            <div className="flex flex-col items-end gap-1.5">
                                {nodeStyle === 'tiles' && (
                                    <>
                                        {groups.length > 0 && (
                                            <SwitchRow label="Peek">
                                                <LemonSegmentedButton
                                                    size="small"
                                                    value={peekDetail}
                                                    onChange={setPeekDetail}
                                                    options={PEEK_DETAILS}
                                                />
                                            </SwitchRow>
                                        )}
                                        <SwitchRow label="Flow">
                                            <LemonSegmentedButton
                                                size="small"
                                                value={tileFlow}
                                                onChange={setTileFlow}
                                                options={TILE_FLOWS}
                                            />
                                        </SwitchRow>
                                    </>
                                )}
                                {showStyleSwitch && (
                                    <SwitchRow label="Nodes">
                                        <LemonSegmentedButton
                                            size="small"
                                            value={nodeStyle}
                                            onChange={setNodeStyle}
                                            options={NODE_STYLES}
                                        />
                                    </SwitchRow>
                                )}
                            </div>
                        </Panel>
                        {(isMovingNode || isCopyingNode) && (
                            <Panel position="top-center" className="!mt-16">
                                <div className="rounded-full border bg-surface-primary px-3 py-1 text-sm shadow">
                                    Click a highlighted + to {isMovingNode ? 'move' : 'copy'} the step there · Esc to
                                    cancel
                                </div>
                            </Panel>
                        )}
                        <Controls showInteractive={false} />
                    </ReactFlow>
                </div>
                {logsOpen && (
                    <LogsDrawer
                        workflow={workflow}
                        onSelectStep={(id) => openPanel('build', id)}
                        onClose={() => setLogsOpen(false)}
                    />
                )}
            </div>
            {followTrace && !panelOpen && (
                <div className="flex h-full w-[360px] shrink-0 flex-col border-l bg-surface-primary p-2">
                    <PersonTracePanel
                        workflow={workflow}
                        trace={followTrace}
                        choose={view.choose}
                        onClose={() => setTraceOn(false)}
                    />
                </div>
            )}
            {panelOpen && (
                <div
                    className="relative h-full shrink-0 border-l bg-surface-primary"
                    style={{ width: panelWidth ?? PANEL_WIDTH }}
                >
                    {selectedAction ? (
                        <StepPanel
                            key={selectedAction.id}
                            action={selectedAction}
                            workflow={workflow}
                            metrics={metrics}
                            onClose={closePanel}
                            onTest={() => {
                                setTestOpen(true)
                                setTestTrace(simulateRun(workflow, 'ada@example.com'))
                            }}
                        />
                    ) : (
                        <>
                            <HogFlowEditorPanel />
                            <div className="absolute bottom-3 right-3 z-20">
                                <LemonButton
                                    size="small"
                                    type="secondary"
                                    icon={<IconX />}
                                    tooltip="Close panel (Esc)"
                                    className="bg-surface-primary"
                                    onClick={closePanel}
                                />
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

/** Mount inside a bound `workflowLogic`. */
export function PrototypeGraphFirstEditor({
    initialNodeStyle = 'line',
    initialTileFlow = 'rail',
    initialTileHover = true,
    initialGroupStyle = 'tint',
    initialCollapsed = 'auto',
    initialPeek = 'spotlight',
    showStyleSwitch = true,
}: {
    initialNodeStyle?: NodeStyle
    initialTileFlow?: TileFlow
    initialTileHover?: boolean
    initialGroupStyle?: GroupStyle
    initialCollapsed?: 'all' | 'auto'
    initialPeek?: PeekDetail
    showStyleSwitch?: boolean
}): JSX.Element {
    const { logicProps } = useValues(workflowLogic)
    return (
        <BindLogic logic={hogFlowEditorLogic} props={logicProps}>
            <HogFlowBranchSelectionProvider>
                <div className="@container/workflow-editor flex min-h-0 min-w-0 flex-1">
                    <ReactFlowProvider>
                        <GraphFirstCanvas
                            initialNodeStyle={initialNodeStyle}
                            initialTileFlow={initialTileFlow}
                            initialTileHover={initialTileHover}
                            initialGroupStyle={initialGroupStyle}
                            initialCollapsed={initialCollapsed}
                            initialPeek={initialPeek}
                            showStyleSwitch={showStyleSwitch}
                        />
                    </ReactFlowProvider>
                </div>
            </HogFlowBranchSelectionProvider>
        </BindLogic>
    )
}
