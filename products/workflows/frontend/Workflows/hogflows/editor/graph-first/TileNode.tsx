// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// n8n-style tiles. On hover a tile grows into a card centered on its own icon: the icon stays exactly
// where it was and the card opens out around it, so the eye does not have to move. The side panel
// shows the same card, so hovering and selecting a step read as one object.
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'

import { IconSparkles } from '@posthog/icons'
import { LemonTag, Tooltip } from '@posthog/lemon-ui'

import { EmailPreviewThumbnail } from 'lib/components/EmailPreviewThumbnail/EmailPreviewThumbnail'
import { humanFriendlyLargeNumber } from 'lib/utils/numbers'

import type { HogFlow, HogFlowAction } from '../../types'
import { CardState } from './GraphFirstCards'
import { BranchGroup, emailContent, groupEmails } from './graphFirstModel'
import { FieldList, pathSummary, TileKind, TilePreview, useTileKind } from './tileKinds'

export type TileFlow = 'down' | 'rail' | 'right'

export const TILE_FLOWS: { value: TileFlow; label: string; tooltip: string }[] = [
    { value: 'down', label: 'Down', tooltip: 'Top to bottom, text under the tile. Arrows leave below the text.' },
    { value: 'rail', label: 'Rail', tooltip: 'Top to bottom, text beside the tile. Arrows run tile to tile.' },
    { value: 'right', label: 'Right', tooltip: 'Left to right like n8n. Arrows meet the tile sides.' },
]

export const TILE = 64
const PAD = 14
const CARD_WIDTH = 400
// The email thumbnail at card size, plus its 2px border on each side.
const EMAIL_FACE = { width: 164, height: 116 }
const SIDE_CARD_WIDTH = 440
const KIND_LABEL_ROOM = 72
const CAPTION_WIDTH = 220
const RAIL_CAPTION_WIDTH = 230
const OPEN_DELAY_MS = 260
const CLOSE_MS = 200

function tileRadius(kind: Pick<TileKind, 'isStart' | 'isEnd'>): string {
    if (kind.isStart) {
        return `${TILE / 2}px ${TILE / 2}px 12px 12px`
    }
    if (kind.isEnd) {
        return `12px 12px ${TILE / 2}px ${TILE / 2}px`
    }
    return '12px'
}

const percent = (value: number): string => `${Math.round(value * 100)}%`

function Badge({ children, className }: { children: React.ReactNode; className: string }): JSX.Element {
    return (
        <span
            className={clsx(
                'absolute whitespace-nowrap rounded-full border bg-surface-primary px-1.5 text-[11px] font-semibold leading-[18px] shadow-sm',
                className
            )}
        >
            {children}
        </span>
    )
}

export function TileFace({
    kind,
    state,
    entered,
    showEmail = false,
    action,
}: {
    kind: TileKind
    state: CardState
    entered?: number
    showEmail?: boolean
    action: HogFlowAction
}): JSX.Element {
    const border = state.onPath ? 'var(--color-accent)' : kind.color
    const email = emailContent(action)
    return (
        <div className="relative" data-tile-anchor>
            {showEmail && email?.html ? (
                <div
                    className="overflow-hidden rounded-xl border-2 bg-surface-primary shadow-sm"
                    style={{ borderColor: border }}
                >
                    <EmailPreviewThumbnail html={email.html} title={`${action.name} preview`} size="card" />
                </div>
            ) : (
                <div
                    className="flex items-center justify-center border-2 bg-surface-primary shadow-sm"
                    style={{
                        width: TILE,
                        height: TILE,
                        borderRadius: tileRadius(kind),
                        borderColor: border,
                        color: kind.color,
                        fontSize: 30,
                    }}
                >
                    {kind.icon}
                </div>
            )}
            {entered !== undefined && <Badge className="-right-3 -top-2.5">{humanFriendlyLargeNumber(entered)}</Badge>}
            {kind.badge && (
                <Badge className="-bottom-2 left-1/2 -translate-x-1/2">
                    <span style={{ color: kind.color }}>{kind.badge}</span>
                </Badge>
            )}
            {kind.invalid && (
                <Tooltip title="This step needs attention. Open it to see what is missing.">
                    <span className="absolute -left-1 -top-1 size-2.5 rounded-full border-2 border-[var(--color-bg-3000)] bg-warning" />
                </Tooltip>
            )}
        </div>
    )
}

function Caption({ kind, side }: { kind: TileKind; side: boolean }): JSX.Element {
    return (
        <div
            className={clsx('flex flex-col gap-0.5', side ? 'pt-1 text-left' : 'items-center text-center')}
            style={{ width: side ? RAIL_CAPTION_WIDTH : CAPTION_WIDTH }}
        >
            <div className="break-words text-[13px] font-semibold leading-tight">{kind.facts.headline}</div>
            {kind.facts.detail && (
                <div className="break-words text-xs leading-snug text-secondary">{kind.facts.detail}</div>
            )}
        </div>
    )
}

export function MetricsLine({ action, state }: { action: HogFlowAction; state: CardState }): JSX.Element | null {
    const entered = state.metrics?.enteredByNode[action.id]
    const rates = state.metrics?.emailRates[action.id]
    if (entered === undefined) {
        return null
    }
    return (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="font-semibold">{entered.toLocaleString()} people</span>
            <span className="text-secondary">reached this step in the sample</span>
            {rates && (
                <>
                    <LemonTag size="small" type="success">
                        {percent(rates.opened)} opened
                    </LemonTag>
                    <LemonTag size="small" type="highlight">
                        {percent(rates.clicked)} clicked
                    </LemonTag>
                </>
            )}
        </div>
    )
}

const PREVIEW_COVERS_FIELDS = ['slack', 'ai', 'ticket', 'person', 'webhook', 'report', 'branch', 'wait', 'window']

/** The body of the Mixed card: what the step does, the settings the preview does not show, and numbers. */
export function StepCardBody({
    action,
    workflow,
    kind,
    state,
    emailShown = false,
}: {
    action: HogFlowAction
    workflow: HogFlow
    kind: TileKind
    state: CardState
    emailShown?: boolean
}): JSX.Element {
    const hasPreview = kind.preview !== 'fields' && !(emailShown && kind.preview === 'email')
    return (
        <div className="flex flex-col gap-2.5">
            {hasPreview && <TilePreview action={action} workflow={workflow} kind={kind} />}
            {(!hasPreview || !PREVIEW_COVERS_FIELDS.includes(kind.preview)) && <FieldList facts={kind.facts} />}
            <MetricsLine action={action} state={state} />
        </div>
    )
}

/** The icon, centered, with the kind label in the corner and the caption under it. */
export function StepCardHead({
    action,
    kind,
    state,
    width,
    side = false,
    showEmail = false,
    trailing,
}: {
    action: HogFlowAction
    kind: TileKind
    state: CardState
    width: number
    side?: boolean
    showEmail?: boolean
    trailing?: React.ReactNode
}): JSX.Element {
    const face = (
        <TileFace
            kind={kind}
            state={state}
            entered={state.metrics?.enteredByNode[action.id]}
            action={action}
            showEmail={showEmail}
        />
    )
    const label = (
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: kind.color }}>
            {kind.label}
        </div>
    )
    if (side) {
        return (
            <div className="relative flex items-start gap-3">
                {face}
                <Caption kind={kind} side />
                <div className="absolute right-0 top-0 flex items-center gap-1">
                    {label}
                    {trailing}
                </div>
            </div>
        )
    }
    return (
        <div className="relative flex flex-col items-center gap-1.5">
            {face}
            <Caption kind={kind} side={false} />
            <div className="absolute left-0 top-0" style={{ maxWidth: (width - TILE) / 2 - PAD - 8 }}>
                {label}
            </div>
            {trailing && <div className="absolute right-0 top-0 flex gap-1">{trailing}</div>}
        </div>
    )
}

function HoverCard({
    open,
    side,
    action,
    workflow,
    kind,
    state,
    showEmail,
}: {
    open: boolean
    side: boolean
    action: HogFlowAction
    workflow: HogFlow
    kind: TileKind
    state: CardState
    showEmail: boolean
}): JSX.Element {
    const face = showEmail ? EMAIL_FACE : { width: TILE, height: TILE }
    const width = side
        ? Math.max(SIDE_CARD_WIDTH, face.width + 12 + RAIL_CAPTION_WIDTH + PAD * 2 + KIND_LABEL_ROOM)
        : CARD_WIDTH
    const inset = (width - face.width) / 2
    const [right, left] = side ? [width - PAD - face.width, PAD] : [inset, inset]
    const closedClip = `inset(${PAD}px ${right}px calc(100% - ${PAD + face.height}px) ${left}px round 12px)`
    return (
        <div
            className="absolute z-10 rounded-2xl border bg-surface-primary text-primary shadow-xl"
            style={{
                left: side ? -PAD : face.width / 2 - width / 2,
                top: -PAD,
                width,
                padding: PAD,
                clipPath: open ? 'inset(0px 0px 0px 0px round 16px)' : closedClip,
                transition: `clip-path ${open ? 240 : CLOSE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
                borderColor: kind.color,
            }}
        >
            <StepCardHead action={action} kind={kind} state={state} width={width} side={side} showEmail={showEmail} />
            <div
                className="mt-3 border-t pt-3 transition-opacity"
                style={{
                    opacity: open ? 1 : 0,
                    transitionDuration: open ? '180ms' : '80ms',
                    transitionDelay: open ? '90ms' : '0ms',
                }}
            >
                <StepCardBody action={action} workflow={workflow} kind={kind} state={state} emailShown={showEmail} />
                <div className="mt-2.5 border-t pt-2 text-[11px] text-secondary">Click to open the step</div>
            </div>
        </div>
    )
}

function useHoverExpansion(
    enabled: boolean,
    forceOpen: boolean
): {
    ref: React.RefObject<HTMLDivElement>
    mounted: boolean
    open: boolean
    onMouseEnter: () => void
    onMouseLeave: () => void
} {
    const ref = useRef<HTMLDivElement>(null)
    const [mounted, setMounted] = useState(forceOpen)
    const [open, setOpen] = useState(forceOpen)
    const timer = useRef<number>()

    useEffect(() => {
        const node = ref.current?.closest<HTMLElement>('.react-flow__node')
        if (node && mounted) {
            const previous = node.style.zIndex
            node.style.zIndex = '1000'
            return () => {
                node.style.zIndex = previous
            }
        }
    }, [mounted])

    useEffect(() => () => window.clearTimeout(timer.current), [])

    if (!enabled || forceOpen) {
        return { ref, mounted: forceOpen, open: forceOpen, onMouseEnter: () => {}, onMouseLeave: () => {} }
    }
    return {
        ref,
        mounted,
        open,
        onMouseEnter: () => {
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(
                () => {
                    setMounted(true)
                    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
                },
                mounted ? 0 : OPEN_DELAY_MS
            )
        },
        onMouseLeave: () => {
            window.clearTimeout(timer.current)
            setOpen(false)
            timer.current = window.setTimeout(() => setMounted(false), CLOSE_MS)
        },
    }
}

export function TileNode({
    action,
    workflow,
    state,
    flow = 'down',
    hover = false,
    forceOpen = false,
}: {
    action: HogFlowAction
    workflow: HogFlow
    state: CardState
    flow?: TileFlow
    hover?: boolean
    forceOpen?: boolean
}): JSX.Element {
    const kind = useTileKind(action, workflow)
    const side = flow === 'rail'
    const showEmail = !!state.previews && !!emailContent(action)?.html
    const entered = state.metrics?.enteredByNode[action.id]
    const rates = state.metrics?.emailRates[action.id]
    const expansion = useHoverExpansion(hover && !state.dimmed && !state.selected, forceOpen)
    return (
        <div
            ref={expansion.ref}
            className={clsx(
                'flex text-primary transition-opacity',
                side ? 'items-start gap-3' : 'flex-col items-center gap-1.5 text-center',
                state.dimmed && 'opacity-30'
            )}
            title={expansion.mounted ? undefined : action.name}
            onMouseEnter={expansion.onMouseEnter}
            onMouseLeave={expansion.onMouseLeave}
        >
            <div
                className={clsx(
                    'relative rounded-xl',
                    state.selected && 'ring-2 ring-[var(--color-accent)] ring-offset-4'
                )}
            >
                <TileFace kind={kind} state={state} entered={entered} showEmail={showEmail} action={action} />
                {expansion.mounted && (
                    <HoverCard
                        showEmail={showEmail}
                        open={expansion.open}
                        side={side}
                        action={action}
                        workflow={workflow}
                        kind={kind}
                        state={state}
                    />
                )}
            </div>
            <div className={clsx('flex flex-col gap-1', !side && 'items-center')}>
                <Caption kind={kind} side={side} />
                {rates && (
                    <div className="flex gap-1">
                        <LemonTag size="small" type="success">
                            {percent(rates.opened)} opened
                        </LemonTag>
                        <LemonTag size="small" type="highlight">
                            {percent(rates.clicked)} clicked
                        </LemonTag>
                    </div>
                )}
            </div>
        </div>
    )
}

export type PeekDetail = 'spotlight' | 'unfold'

export const PEEK_DETAILS: { value: PeekDetail; label: string; tooltip: string }[] = [
    {
        value: 'spotlight',
        label: 'Spotlight',
        tooltip: 'Hover a step in the peek for its label. Keep hovering for a preview.',
    },
    { value: 'unfold', label: 'Unfold', tooltip: 'Keep hovering the peek and every step gets its label.' },
]

const MINI = 32
const GAPS = { compact: { x: 30, y: 52 }, unfolded: { x: 112, y: 96 } }
const UNFOLDED_LABEL = 132
const DWELL_MS = 650
const UNFOLD_MS = 450

function MiniTile({
    action,
    workflow,
    entered,
    dimmed,
    label,
    highlighted,
}: {
    action: HogFlowAction
    workflow: HogFlow
    entered?: number
    dimmed?: boolean
    label?: 'brief' | 'full'
    highlighted?: boolean
}): JSX.Element {
    const kind = useTileKind(action, workflow)
    return (
        <div className="relative transition-opacity duration-150" style={{ opacity: dimmed ? 0.35 : 1 }}>
            <div
                className={clsx(
                    'flex items-center justify-center rounded-lg border-2 bg-surface-primary transition-transform duration-150',
                    highlighted && 'scale-110 shadow-md'
                )}
                style={{ width: MINI, height: MINI, borderColor: kind.color, color: kind.color, fontSize: 15 }}
            >
                {kind.icon}
            </div>
            {kind.badge && (
                <span
                    className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded-full border bg-surface-primary px-1 text-[9.5px] font-semibold leading-[14px]"
                    style={{ color: kind.color }}
                >
                    {kind.badge}
                </span>
            )}
            {entered !== undefined && (
                <span className="absolute -right-2.5 -top-2 rounded-full border bg-surface-primary px-1 text-[9.5px] font-semibold leading-[14px] shadow-sm">
                    {humanFriendlyLargeNumber(entered)}
                </span>
            )}
            <div
                className="absolute left-1/2 -translate-x-1/2 text-center leading-tight transition-opacity duration-200"
                style={{ top: MINI + (kind.badge ? 18 : 6), width: UNFOLDED_LABEL, opacity: label ? 1 : 0 }}
            >
                {label && (
                    <>
                        <div className="break-words text-[10.5px] font-semibold">{kind.facts.headline}</div>
                        {label === 'full' && kind.facts.detail && (
                            <div className="break-words text-[10px] text-secondary">{kind.facts.detail}</div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

/** The step a person dwells on inside the peek: label first, then a compact preview of what it does. */
function SpotlightCard({
    action,
    workflow,
    state,
    deep,
}: {
    action: HogFlowAction
    workflow: HogFlow
    state: CardState
    deep: boolean
}): JSX.Element {
    const kind = useTileKind(action, workflow)
    const email = emailContent(action)
    return (
        <div
            className="w-[260px] rounded-xl border bg-surface-primary p-2.5 text-left shadow-lg"
            style={{ borderColor: kind.color }}
        >
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: kind.color }}>
                {kind.label}
            </div>
            <div className="break-words text-[12.5px] font-semibold leading-snug">{kind.facts.headline}</div>
            {kind.facts.detail && (
                <div className="break-words text-[11.5px] leading-snug text-secondary">{kind.facts.detail}</div>
            )}
            <div
                className="grid transition-[grid-template-rows,opacity] duration-200"
                style={{ gridTemplateRows: deep ? '1fr' : '0fr', opacity: deep ? 1 : 0 }}
            >
                <div className="min-h-0 overflow-hidden">
                    <div className="mt-2 flex flex-col gap-2 border-t pt-2 text-[12px]">
                        {email?.html ? (
                            <div className="flex justify-center overflow-hidden rounded border bg-white">
                                <EmailPreviewThumbnail html={email.html} title={`${action.name} preview`} size="card" />
                            </div>
                        ) : kind.preview !== 'fields' ? (
                            <TilePreview action={action} workflow={workflow} kind={kind} />
                        ) : (
                            <FieldList facts={kind.facts} />
                        )}
                        <MetricsLine action={action} state={state} />
                    </div>
                </div>
            </div>
        </div>
    )
}

type MiniLayout = {
    nodes: { action: HogFlowAction; x: number; y: number; layer: number }[]
    edges: { from: { x: number; y: number }; to: { x: number; y: number } }[]
    width: number
    height: number
}

/** A small left-to-right layout of a path's own steps: layers by depth, forks stacked and centered. */
function miniLayout(
    workflow: HogFlow,
    members: HogFlowAction[],
    gap: { x: number; y: number },
    extra: number
): MiniLayout {
    const ids = new Set(members.map((action) => action.id))
    const inner = workflow.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    const layer: Record<string, number> = Object.fromEntries(members.map((action) => [action.id, 0]))
    for (let pass = 0; pass < members.length; pass++) {
        inner.forEach((edge) => (layer[edge.to] = Math.max(layer[edge.to], layer[edge.from] + 1)))
    }
    const byLayer: HogFlowAction[][] = []
    members.forEach((action) => (byLayer[layer[action.id]] ??= []).push(action))
    const tallest = Math.max(...byLayer.map((column) => column?.length ?? 0))
    const nodes = byLayer.flatMap((column, index) =>
        (column ?? []).map((action, row) => ({
            action,
            layer: index,
            x: index * (MINI + gap.x) + extra / 2,
            y: (row - (column.length - 1) / 2 + (tallest - 1) / 2) * gap.y,
        }))
    )
    const at = Object.fromEntries(nodes.map((node) => [node.action.id, node]))
    return {
        nodes,
        edges: inner.map((edge) => ({
            from: { x: at[edge.from].x + MINI, y: at[edge.from].y + MINI / 2 },
            to: { x: at[edge.to].x, y: at[edge.to].y + MINI / 2 },
        })),
        width: byLayer.length * (MINI + gap.x) - gap.x + extra,
        height: (tallest - 1) * gap.y + MINI + (extra ? 72 : 16),
    }
}

type Pt = { x: number; y: number }

function inTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
    const side = (p1: Pt, p2: Pt, p3: Pt): number => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
    const d1 = side(p, a, b)
    const d2 = side(p, b, c)
    const d3 = side(p, c, a)
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

const SAFE_TRIANGLE_SLACK = 12
const SWITCH_AFTER_MS = 140

function MiniFlow({
    workflow,
    members,
    state,
    open,
    detail,
}: {
    workflow: HogFlow
    members: HogFlowAction[]
    state: CardState
    open: boolean
    detail: PeekDetail
}): JSX.Element {
    const [hovered, setHovered] = useState<string | null>(null)
    const [deep, setDeep] = useState(false)
    const [unfolded, setUnfolded] = useState(false)
    const dwell = useRef<number>()
    const unfoldTimer = useRef<number>()
    const switchTimer = useRef<number>()
    const pointer = useRef<Pt>({ x: 0, y: 0 })
    const apex = useRef<Pt | null>(null)
    const over = useRef<string | null>(null)
    const cardRef = useRef<HTMLDivElement>(null)

    // While the pointer travels from a step toward its open preview, it stays inside the triangle between
    // where it left the step and the preview's top edge. Steps it crosses on the way do not steal the hover.
    const headingToCard = (): boolean => {
        const card = cardRef.current?.getBoundingClientRect()
        if (!card || !apex.current) {
            return false
        }
        return inTriangle(
            pointer.current,
            apex.current,
            { x: card.left - SAFE_TRIANGLE_SLACK, y: card.top },
            { x: card.right + SAFE_TRIANGLE_SLACK, y: card.top }
        )
    }

    const enterStep = (id: string): void => {
        over.current = id
        window.clearTimeout(switchTimer.current)
        if (hovered && hovered !== id && headingToCard()) {
            switchTimer.current = window.setTimeout(() => {
                if (over.current === id) {
                    setHovered(id)
                }
            }, SWITCH_AFTER_MS)
            return
        }
        setHovered(id)
    }

    useEffect(() => {
        window.clearTimeout(dwell.current)
        setDeep(false)
        if (hovered && detail === 'spotlight') {
            dwell.current = window.setTimeout(() => setDeep(true), DWELL_MS)
        }
        return () => window.clearTimeout(dwell.current)
    }, [hovered, detail])

    useEffect(() => {
        if (!open) {
            window.clearTimeout(unfoldTimer.current)
            setUnfolded(false)
            setHovered(null)
        }
    }, [open])

    const spread = detail === 'unfold' && unfolded
    const layout = miniLayout(
        workflow,
        members,
        spread ? GAPS.unfolded : GAPS.compact,
        spread ? UNFOLDED_LABEL - MINI : 0
    )
    const spotlight =
        detail === 'spotlight' && hovered ? layout.nodes.find((node) => node.action.id === hovered) : undefined

    return (
        <div
            className="relative transition-[width,height] duration-300 ease-out"
            style={{ width: layout.width, height: layout.height }}
            onMouseEnter={() => {
                if (detail === 'unfold') {
                    unfoldTimer.current = window.setTimeout(() => setUnfolded(true), UNFOLD_MS)
                }
            }}
            onMouseMove={(e) => {
                pointer.current = { x: e.clientX, y: e.clientY }
                if (over.current && over.current === hovered) {
                    apex.current = pointer.current
                }
            }}
            onMouseLeave={() => {
                window.clearTimeout(unfoldTimer.current)
                window.clearTimeout(switchTimer.current)
                over.current = null
                setHovered(null)
            }}
        >
            <svg className="absolute inset-0 overflow-visible" width={layout.width} height={layout.height}>
                {layout.edges.map((edge, index) => {
                    const midX = (edge.from.x + edge.to.x) / 2
                    return (
                        <g
                            key={index}
                            style={{
                                opacity: open ? (spotlight ? 0.35 : 1) : 0,
                                transition: `opacity 200ms ease ${open ? 120 + index * 25 : 0}ms`,
                            }}
                        >
                            <path
                                d={`M ${edge.from.x} ${edge.from.y} H ${midX} V ${edge.to.y} H ${edge.to.x - 1}`}
                                fill="none"
                                stroke="var(--color-border-bold, #9ca3af)"
                                strokeWidth={1.25}
                                style={{ transition: 'd 300ms ease-out' }}
                            />
                            <path
                                d={`M ${edge.to.x - 5} ${edge.to.y - 3} L ${edge.to.x - 1} ${edge.to.y} L ${edge.to.x - 5} ${edge.to.y + 3}`}
                                fill="none"
                                stroke="var(--color-border-bold, #9ca3af)"
                                strokeWidth={1.25}
                                style={{ transition: 'd 300ms ease-out' }}
                            />
                        </g>
                    )
                })}
            </svg>
            {layout.nodes.map((node) => (
                <div
                    key={node.action.id}
                    className="absolute"
                    data-mini-step={node.action.id}
                    onMouseEnter={() => enterStep(node.action.id)}
                    onMouseLeave={() => {
                        if (over.current === node.action.id) {
                            over.current = null
                        }
                    }}
                    style={{
                        left: node.x,
                        top: node.y,
                        opacity: open ? 1 : 0,
                        transform: open ? 'none' : 'translateX(-10px) scale(0.85)',
                        transition: `left 300ms ease-out, top 300ms ease-out, transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1) ${node.layer * 40}ms, opacity 180ms ease ${node.layer * 40}ms`,
                    }}
                >
                    <MiniTile
                        action={node.action}
                        workflow={workflow}
                        entered={state.metrics?.enteredByNode[node.action.id]}
                        dimmed={!!spotlight && spotlight.action.id !== node.action.id}
                        highlighted={hovered === node.action.id}
                        label={spread ? (hovered === node.action.id ? 'full' : 'brief') : undefined}
                    />
                </div>
            ))}
            {spotlight && (
                <div
                    className="absolute z-20 animate-[gf-fade-in_160ms_ease_both] pt-[22px]"
                    style={{ left: spotlight.x + MINI / 2, top: spotlight.y + MINI, transform: 'translateX(-50%)' }}
                    onMouseEnter={() => {
                        over.current = spotlight.action.id
                        window.clearTimeout(switchTimer.current)
                    }}
                >
                    <div ref={cardRef}>
                        <SpotlightCard action={spotlight.action} workflow={workflow} state={state} deep={deep} />
                    </div>
                </div>
            )}
        </div>
    )
}

const VIEW_MARGIN = 12
const PEEK_CLOSE_MS = 220

/** Moves a growing card back inside the canvas when it would run past an edge. */
function useKeepInView(ref: React.RefObject<HTMLElement>, active: boolean): { x: number; y: number } {
    const [shift, setShift] = useState({ x: 0, y: 0 })
    useEffect(() => {
        const card = ref.current
        if (!card || !active) {
            setShift({ x: 0, y: 0 })
            return
        }
        const measure = (): void => {
            const canvas = card.closest('.react-flow')?.getBoundingClientRect()
            const box = card.getBoundingClientRect()
            if (!canvas || !card.offsetWidth) {
                return
            }
            const scale = box.width / card.offsetWidth
            setShift((current) => {
                const left = box.left - current.x * scale
                const top = box.top - current.y * scale
                const overRight = left + box.width - (canvas.right - VIEW_MARGIN)
                const overBottom = top + box.height - (canvas.bottom - VIEW_MARGIN)
                const x = overRight > 0 ? -Math.min(overRight, left - canvas.left - VIEW_MARGIN) : 0
                const y = overBottom > 0 ? -Math.min(overBottom, top - canvas.top - VIEW_MARGIN) : 0
                return Math.abs(x / scale - current.x) < 1 && Math.abs(y / scale - current.y) < 1
                    ? current
                    : { x: x / scale, y: y / scale }
            })
        }
        const observer = new ResizeObserver(measure)
        observer.observe(card)
        measure()
        return () => observer.disconnect()
    }, [ref, active])
    return shift
}

/**
 * A collapsed path. At rest the cover shows the first steps' icons like a folder. On hover the cover
 * fades and the stack fans out, so you can peek at every step inside before you open it.
 */
export function TileGroupNode({
    group,
    workflow,
    state = {},
    flow = 'down',
    color,
    peekDetail = 'spotlight',
    onExpand,
}: {
    group: BranchGroup
    workflow: HogFlow
    state?: CardState
    flow?: TileFlow
    color?: string
    peekDetail?: PeekDetail
    onExpand?: () => void
}): JSX.Element {
    const side = flow === 'rail'
    const ref = useRef<HTMLDivElement>(null)
    const [peek, setPeek] = useState(false)
    const members = workflow.actions.filter((action) => group.memberIds.includes(action.id))
    const emails = groupEmails(workflow, group).reduce((sum, email) => sum + email.count, 0)
    const summary = pathSummary(workflow, group)
    const border = state.onPath ? 'var(--color-accent)' : (color ?? 'var(--color-border-bold, #9ca3af)')
    const entered = state.metrics?.enteredByNode[members[0]?.id]
    const cardRef = useRef<HTMLDivElement>(null)
    const closeTimer = useRef<number>()
    useEffect(() => () => window.clearTimeout(closeTimer.current), [])
    const shift = useKeepInView(cardRef, peek)

    useEffect(() => {
        const node = ref.current?.closest<HTMLElement>('.react-flow__node')
        if (node && peek) {
            const previous = node.style.zIndex
            node.style.zIndex = '1000'
            return () => {
                node.style.zIndex = previous
            }
        }
    }, [peek])

    return (
        <div
            ref={ref}
            className={clsx(
                'flex cursor-pointer text-primary transition-opacity',
                side ? 'items-start gap-3' : 'flex-col items-center gap-1.5 text-center',
                state.dimmed && 'opacity-30'
            )}
            title={peek ? undefined : 'Open this path'}
            onMouseEnter={() => {
                window.clearTimeout(closeTimer.current)
                setPeek(true)
            }}
            onMouseLeave={() => {
                closeTimer.current = window.setTimeout(() => setPeek(false), PEEK_CLOSE_MS)
            }}
            onClick={(e) => {
                e.stopPropagation()
                onExpand?.()
            }}
        >
            <div className="relative" data-tile-anchor style={{ width: TILE, height: TILE }}>
                {[8, 4].map((offset) => (
                    <div
                        key={offset}
                        className="absolute inset-0 rounded-xl border-2 bg-surface-primary"
                        style={{ transform: `translate(${offset}px, ${-offset}px)`, borderColor: border, opacity: 0.5 }}
                    />
                ))}
                <div
                    className="absolute inset-0 grid grid-cols-2 place-items-center gap-0.5 rounded-xl border-2 border-dashed bg-surface-primary p-1.5"
                    style={{ borderColor: border }}
                >
                    {members.slice(0, 4).map((action) => (
                        <CoverIcon key={action.id} action={action} workflow={workflow} />
                    ))}
                </div>
                {entered !== undefined && (
                    <Badge className="-right-3 -top-3.5 z-[4]">{humanFriendlyLargeNumber(entered)}</Badge>
                )}
                <div
                    ref={cardRef}
                    className="absolute z-10 rounded-2xl border bg-surface-primary p-3 shadow-xl"
                    style={{
                        left: side ? TILE + 12 : TILE / 2,
                        top: -14,
                        transform: `${side ? '' : 'translateX(-50%) '}translate(${shift.x}px, ${shift.y}px)`,
                        borderColor: color,
                        opacity: peek ? 1 : 0,
                        visibility: peek ? 'visible' : 'hidden',
                        transition: 'opacity 160ms ease',
                    }}
                >
                    <div className="mb-3 flex items-center gap-1.5 whitespace-nowrap text-[11px]">
                        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="font-semibold" style={{ color }}>
                            {group.label}
                        </span>
                        <span className="text-secondary">· {members.length} steps · click to open</span>
                    </div>
                    <div className="px-1 pt-1">
                        <MiniFlow workflow={workflow} members={members} state={state} open={peek} detail={peekDetail} />
                    </div>
                </div>
            </div>
            <div
                className={clsx('flex flex-col gap-0.5', side ? 'pt-1 text-left' : 'items-center')}
                style={{ width: side ? RAIL_CAPTION_WIDTH : CAPTION_WIDTH }}
            >
                <div className="break-words text-[13px] font-semibold leading-tight" style={{ color }}>
                    {group.label}
                </div>
                <div className="break-words text-xs leading-snug">
                    {summary.ai && (
                        <Tooltip title="Written by PostHog AI when it built this workflow">
                            <IconSparkles className="mr-1 inline align-[-2px] text-[#7c3aed]" />
                        </Tooltip>
                    )}
                    {summary.text}
                </div>
                <div className="text-[11px] text-secondary">
                    {members.length} steps{emails ? ` · ${emails} ${emails === 1 ? 'email' : 'emails'}` : ''} · hover to
                    peek, click to open
                </div>
            </div>
        </div>
    )
}

function CoverIcon({ action, workflow }: { action: HogFlowAction; workflow: HogFlow }): JSX.Element {
    const kind = useTileKind(action, workflow)
    return (
        <span
            className="flex size-[22px] items-center justify-center rounded text-[14px]"
            style={{ color: kind.color, backgroundColor: `${kind.color}1a` }}
        >
            {kind.icon}
        </span>
    )
}
