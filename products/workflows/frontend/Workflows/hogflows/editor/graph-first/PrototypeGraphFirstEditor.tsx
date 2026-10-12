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
import { LemonBadge, LemonButton, LemonSegmentedButton, LemonSwitch } from '@posthog/lemon-ui'

import { Popover } from 'lib/lemon-ui/Popover'

import { themeLogic } from '~/layout/navigation-3000/themeLogic'

import { workflowLogic } from '../../../workflowLogic'
import { HogFlowBranchSelectionProvider } from '../../HogFlowBranchSelection'
import { hogFlowEditorLogic, HogFlowEditorMode } from '../../hogFlowEditorLogic'
import { HogFlowEditorPanel } from '../../panel/HogFlowEditorPanel'
import { HogFlowEditorPanelBuild } from '../../panel/HogFlowEditorPanelBuild'
import type { HogFlow } from '../../types'
import { GroupFrameHeader, NoteCard, SummaryCard } from './GraphFirstCards'
import { LABEL_HEIGHT, labelWidth, layoutGraph, LayoutResult, Point } from './graphFirstLayout'
import {
    actionById,
    BranchGroup,
    computeGroups,
    computeTrace,
    edgeKey,
    emailContent,
    FlowEdge,
    foldWaits,
    sampleMetrics,
    SampleMetrics,
    stepSentence,
    Trace,
    VisibleEdge,
    VisibleNode,
    visibleGraph,
} from './graphFirstModel'
import { NODE_STYLES, NodeStyle, StepNode } from './GraphFirstNodeStyles'

const PANEL_WIDTH = 460
const FRAME_PAD = 14
const FRAME_HEADER = 30
const COLLAPSE_ALL_ABOVE_STEPS = 30
const MIN_READABLE_ZOOM = 0.66

type ViewState = {
    workflow: HogFlow
    groups: BranchGroup[]
    trace: Trace | null
    metrics: SampleMetrics | null
    previews: boolean
    nodeStyle: NodeStyle
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
        <div>
            <Handle type="target" position={Position.Top} className="!opacity-0" isConnectable={false} />
            {vnode.kind === 'action' ? (
                <StepNode action={vnode.action} workflow={view.workflow} state={state} style={view.nodeStyle} />
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

function FrameNode({ data, width, height }: NodeProps): JSX.Element {
    const view = ViewContext.current!
    const group = data.group as BranchGroup
    const dimmed = view.trace && !group.memberIds.some((id) => view.trace!.nodeIds.includes(id))
    return (
        <div
            className={clsx('rounded-xl border bg-surface-secondary/60 transition-opacity', dimmed && 'opacity-40')}
            style={{ width, height, borderColor: 'var(--color-border-primary)' }}
        >
            <div className="px-2 pt-1">
                <GroupFrameHeader group={group} onCollapse={() => view.collapse(group.id)} />
            </div>
        </div>
    )
}

function NoteNode(): JSX.Element {
    return <NoteCard workflow={ViewContext.current!.workflow} />
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
        const length = Math.abs(b.y - a.y)
        if (a.x === b.x && length > best.length) {
            best = { length, point: { x: a.x, y: (a.y + b.y) / 2 } }
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
    const end = routed.points[routed.points.length - 1]
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
                d={`M ${end.x - 4} ${end.y - 7} L ${end.x} ${end.y} L ${end.x + 4} ${end.y - 7}`}
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

const NODE_TYPES = { card: CardNode, frame: FrameNode, note: NoteNode }
const EDGE_TYPES = { routed: RoutedEdge }

function MeasureLayer({
    nodes,
    workflow,
    metrics,
    previews,
    nodeStyle,
    onMeasured,
}: {
    nodes: VisibleNode[]
    workflow: HogFlow
    metrics: SampleMetrics | null
    previews: boolean
    nodeStyle: NodeStyle
    onMeasured: (sizes: Record<string, { width: number; height: number }>) => void
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null)
    useLayoutEffect(() => {
        const measure = (): void => {
            const sizes: Record<string, { width: number; height: number }> = {}
            ref.current?.querySelectorAll<HTMLElement>('[data-measure-id]').forEach((el) => {
                const child = el.firstElementChild as HTMLElement
                sizes[el.dataset.measureId!] = { width: child.offsetWidth, height: child.offsetHeight }
            })
            onMeasured(sizes)
        }
        measure()
        let cancelled = false
        void document.fonts.ready.then(() => !cancelled && measure())
        return () => {
            cancelled = true
        }
    }, [nodes, metrics, previews, nodeStyle]) // eslint-disable-line react-hooks/exhaustive-deps
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
                        />
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

function frameBoxes(
    groups: BranchGroup[],
    collapsed: Set<string>,
    boxes: Record<string, { x: number; y: number; width: number; height: number }>
): { group: BranchGroup; box: { x: number; y: number; width: number; height: number } }[] {
    const shown = shownGroups(groups, collapsed)
    const result: Record<string, { x: number; y: number; width: number; height: number }> = {}
    const order = [...shown].sort((a, b) => b.depth - a.depth)
    order.forEach((group) => {
        const parts = [
            ...group.memberIds.map((id) => boxes[id]).filter(Boolean),
            ...shown.filter((child) => child.parentId === group.id).map((child) => result[child.id]),
            ...groups
                .filter((child) => child.parentId === group.id && collapsed.has(child.id))
                .map((child) => boxes[child.id]),
        ].filter(Boolean)
        if (!parts.length) {
            return
        }
        const minX = Math.min(...parts.map((b) => b.x)) - FRAME_PAD
        const minY = Math.min(...parts.map((b) => b.y)) - FRAME_PAD - FRAME_HEADER
        const maxX = Math.max(...parts.map((b) => b.x + b.width)) + FRAME_PAD
        const maxY = Math.max(...parts.map((b) => b.y + b.height)) + FRAME_PAD
        result[group.id] = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    })
    return shown.filter((group) => result[group.id]).map((group) => ({ group, box: result[group.id] }))
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

function GraphFirstCanvas({ initialNodeStyle }: { initialNodeStyle: NodeStyle }): JSX.Element {
    const { isDarkModeOn } = useValues(themeLogic)
    const { workflow, selectedNodeId, mode, panelWidth, isMovingNode, isCopyingNode } = useValues(hogFlowEditorLogic)
    const { setSelectedNodeId, setMode, setPanelWidth, handlePaneClick, stopMovingNode, stopCopyingNode } =
        useActions(hogFlowEditorLogic)
    const reactFlow = useReactFlow()
    const wrapperRef = useRef<HTMLDivElement>(null)

    const groups = useMemo(() => computeGroups(workflow), [workflow])
    const [collapsed, setCollapsed] = useState<Set<string>>(
        () =>
            new Set(workflow.actions.length > COLLAPSE_ALL_ABOVE_STEPS ? computeGroups(workflow).map((g) => g.id) : [])
    )
    const [traceOn, setTraceOn] = useState(false)
    const [choices, setChoices] = useState<Record<string, string>>({})
    const [showMetrics, setShowMetrics] = useState(false)
    const [showNote, setShowNote] = useState(true)
    const [previews, setPreviews] = useState(
        () => workflow.actions.filter((action) => emailContent(action)).length <= 3
    )
    const [nodeStyle, setNodeStyle] = useState<NodeStyle>(initialNodeStyle)
    const [panelOpen, setPanelOpen] = useState(false)
    const [sizes, setSizes] = useState<Record<string, { width: number; height: number }> | null>(null)
    const [layout, setLayout] = useState<LayoutResult | null>(null)

    const [waitsOnArrows, setWaitsOnArrows] = useState(true)
    const graph = useMemo(() => {
        const base = visibleGraph(workflow, groups, collapsed)
        return waitsOnArrows ? foldWaits(base) : base
    }, [workflow, groups, collapsed, waitsOnArrows])
    const labels = useMemo(() => {
        const framedEntries = new Set(shownGroups(groups, collapsed).map((group) => edgeKey(group.edge)))
        return Object.fromEntries(
            graph.edges.map((vedge) => {
                const branch = framedEntries.has(vedge.originalKeys[0]) ? undefined : vedge.label
                const timing = vedge.timing ? `🕘 ${vedge.timing.text}` : undefined
                return [vedge.id, [branch, timing].filter(Boolean).join(' · ') || undefined]
            })
        )
    }, [graph.edges, groups, collapsed])
    const trace = useMemo(() => (traceOn ? computeTrace(workflow, choices) : null), [traceOn, workflow, choices])
    const metrics = useMemo(() => (showMetrics ? sampleMetrics(workflow) : null), [showMetrics, workflow])
    const sideOpen = panelOpen || !!trace

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
        void layoutGraph(sizes, graph.edges, labels, portFractions).then((result) => !cancelled && setLayout(result))
        return () => {
            cancelled = true
        }
    }, [sizes, graph.edges, labels]) // eslint-disable-line react-hooks/exhaustive-deps

    const view: ViewState = {
        workflow,
        groups,
        trace,
        metrics,
        previews,
        nodeStyle,
        selectedNodeId: panelOpen ? selectedNodeId : null,
        openStep: (nodeId) => openPanel('build', nodeId),
        expand: (id) => setCollapsed((prev) => new Set([...prev].filter((g) => g !== id))),
        collapse: (id) => setCollapsed((prev) => new Set([...prev, id])),
        choose: (nodeId, key) => {
            setTraceOn(true)
            setChoices((prev) => ({ ...prev, [nodeId]: key }))
        },
    }
    ViewContext.current = view
    const tick = useMemo(() => ({}), [trace, metrics, previews, nodeStyle, selectedNodeId, panelOpen, workflow]) // eslint-disable-line react-hooks/exhaustive-deps

    const rfNodes = useMemo(() => {
        if (!layout || !sizes) {
            return []
        }
        const boxes = Object.fromEntries(
            graph.nodes
                .filter((n) => layout.positions[n.id] && sizes[n.id])
                .map((n) => [n.id, { ...layout.positions[n.id], ...sizes[n.id] }])
        )
        const frames = frameBoxes(groups, collapsed, boxes).map(({ group, box }) => ({
            id: `frame:${group.id}`,
            type: 'frame',
            position: { x: box.x, y: box.y },
            width: box.width,
            height: box.height,
            data: { group, tick },
            selectable: false,
            draggable: false,
            zIndex: -10 + group.depth,
        }))
        const trigger = graph.nodes.find((n) => n.kind === 'action' && n.action.type === 'trigger')
        const triggerBox = trigger ? boxes[trigger.id] : undefined
        const note =
            showNote && triggerBox
                ? [
                      {
                          id: 'note',
                          type: 'note',
                          position: { x: triggerBox.x - 260 - 48, y: triggerBox.y },
                          data: { tick },
                          selectable: false,
                          draggable: false,
                      },
                  ]
                : []
        return [
            ...frames,
            ...note,
            ...graph.nodes
                .filter((n) => layout.positions[n.id])
                .map((vnode) => ({
                    id: vnode.id,
                    type: 'card',
                    position: layout.positions[vnode.id],
                    data: { vnode, tick },
                    selectable: vnode.kind === 'action',
                    draggable: false,
                })),
        ]
    }, [layout, sizes, graph.nodes, groups, collapsed, showNote, tick])

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
        const zoom = Math.min(1, widthZoom, Math.max(heightZoom, MIN_READABLE_ZOOM))
        void reactFlow.setViewport({ x: (width - (maxX - minX) * zoom) / 2 - minX * zoom, y: 64 - minY * zoom, zoom })
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
    }, [sideOpen]) // eslint-disable-line react-hooks/exhaustive-deps

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

    const variablesCount = workflow.variables?.length ?? 0
    const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.id))

    return (
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden" data-attr="workflow-editor">
            <MeasureLayer
                nodes={graph.nodes}
                workflow={workflow}
                metrics={metrics}
                previews={previews}
                nodeStyle={nodeStyle}
                onMeasured={setSizes}
            />
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
                    onNodeClick={(_, node) => node.type === 'card' && node.selectable && openPanel('build', node.id)}
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
                            {!sideOpen && (
                                <>
                                    <LemonButton
                                        size="small"
                                        onClick={() => openPanel('variables')}
                                        active={panelOpen && mode === 'variables'}
                                        sideIcon={
                                            variablesCount ? (
                                                <LemonBadge.Number count={variablesCount} size="small" status="muted" />
                                            ) : undefined
                                        }
                                    >
                                        Variables
                                    </LemonButton>
                                    <LemonButton
                                        size="small"
                                        onClick={() => openPanel('test')}
                                        active={panelOpen && mode === 'test'}
                                    >
                                        Test
                                    </LemonButton>
                                    <LemonButton
                                        size="small"
                                        onClick={() => openPanel('logs')}
                                        active={panelOpen && mode === 'logs'}
                                    >
                                        Logs
                                    </LemonButton>
                                </>
                            )}
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
                                    ['Waits on arrows', waitsOnArrows, setWaitsOnArrows],
                                    ['Sample metrics', showMetrics, setShowMetrics],
                                    ['Workflow note', showNote, setShowNote],
                                ]}
                            />
                            {groups.length > 0 && !sideOpen && (
                                <LemonButton
                                    size="small"
                                    onClick={() => setCollapsed(new Set(allCollapsed ? [] : groups.map((g) => g.id)))}
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
                        <div className="flex items-center gap-2 rounded-lg border bg-surface-primary py-1 pl-2.5 pr-1 shadow-sm">
                            <span className="text-xs font-semibold text-secondary">Nodes</span>
                            <LemonSegmentedButton
                                size="small"
                                value={nodeStyle}
                                onChange={setNodeStyle}
                                options={NODE_STYLES}
                            />
                        </div>
                    </Panel>
                    {(isMovingNode || isCopyingNode) && (
                        <Panel position="top-center" className="!mt-16">
                            <div className="rounded-full border bg-surface-primary px-3 py-1 text-sm shadow">
                                Click a highlighted + to {isMovingNode ? 'move' : 'copy'} the step there · Esc to cancel
                            </div>
                        </Panel>
                    )}
                    <Controls showInteractive={false} />
                </ReactFlow>
            </div>
            {trace && !panelOpen && (
                <div className="flex h-full w-[360px] shrink-0 flex-col border-l bg-surface-primary p-2">
                    <PersonTracePanel
                        workflow={workflow}
                        trace={trace}
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
                    <HogFlowEditorPanel />
                    <div className="absolute bottom-3 right-3 z-20">
                        <LemonButton
                            size="small"
                            type="secondary"
                            icon={<IconX />}
                            tooltip="Close panel (Esc)"
                            className="bg-surface-primary"
                            onClick={() => {
                                setPanelOpen(false)
                                setSelectedNodeId(null)
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

/** Mount inside a bound `workflowLogic`. */
export function PrototypeGraphFirstEditor({
    initialNodeStyle = 'line',
}: {
    initialNodeStyle?: NodeStyle
}): JSX.Element {
    const { logicProps } = useValues(workflowLogic)
    return (
        <BindLogic logic={hogFlowEditorLogic} props={logicProps}>
            <HogFlowBranchSelectionProvider>
                <div className="@container/workflow-editor flex min-h-0 min-w-0 flex-1">
                    <ReactFlowProvider>
                        <GraphFirstCanvas initialNodeStyle={initialNodeStyle} />
                    </ReactFlowProvider>
                </div>
            </HogFlowBranchSelectionProvider>
        </BindLogic>
    )
}
