// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// n8n-style tiles. On hover a tile grows into a card around its own icon: the icon and caption stay
// exactly where they were, and the card opens out around them, so the eye does not have to move.
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'

import { IconStack } from '@posthog/icons'
import { LemonTag, Tooltip } from '@posthog/lemon-ui'

import { EmailPreviewThumbnail } from 'lib/components/EmailPreviewThumbnail/EmailPreviewThumbnail'
import { humanFriendlyLargeNumber } from 'lib/utils/numbers'

import type { HogFlow, HogFlowAction } from '../../types'
import { CardState, StepActionsMenu } from './GraphFirstCards'
import { BranchGroup, emailContent, groupEmails } from './graphFirstModel'
import { FieldList, TileKind, TilePreview, useTileKind } from './tileKinds'

export type TileFlow = 'down' | 'rail' | 'right'
export type TileHover = 'off' | 'fields' | 'preview' | 'mixed'

export const TILE_FLOWS: { value: TileFlow; label: string; tooltip: string }[] = [
    { value: 'down', label: 'Down', tooltip: 'Top to bottom. Arrows leave below the text.' },
    { value: 'rail', label: 'Rail', tooltip: 'Top to bottom, text beside the tile. Arrows never touch text.' },
    {
        value: 'right',
        label: 'Right',
        tooltip: 'Left to right like n8n. Arrows run beside the tiles, text sits below.',
    },
]

export const TILE_HOVERS: { value: TileHover; label: string; tooltip: string }[] = [
    { value: 'mixed', label: 'Mixed', tooltip: 'Preview, settings, and numbers.' },
    { value: 'preview', label: 'Preview', tooltip: 'What the step sends or does.' },
    { value: 'fields', label: 'Fields', tooltip: 'Every setting of the step.' },
    { value: 'off', label: 'Off', tooltip: 'No hover cards.' },
]

export const TILE = 64
const PAD = 14
const CAPTION_WIDTH = 220
const RAIL_CAPTION_WIDTH = 230
const OPEN_DELAY_MS = 260
const CLOSE_MS = 200
const WIDTHS: Record<Exclude<TileHover, 'off'>, number> = { fields: 340, preview: 380, mixed: 400 }

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

function TileFace({
    kind,
    state,
    entered,
    showEmail,
    action,
}: {
    kind: TileKind
    state: CardState
    entered?: number
    showEmail: boolean
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
                <Badge className="-bottom-2 left-1/2 -translate-x-1/2 text-secondary">
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

function MetricsLine({ action, state }: { action: HogFlowAction; state: CardState }): JSX.Element | null {
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

function ExpandedContent({
    variant,
    action,
    workflow,
    kind,
    state,
}: {
    variant: Exclude<TileHover, 'off'>
    action: HogFlowAction
    workflow: HogFlow
    kind: TileKind
    state: CardState
}): JSX.Element {
    const preview = kind.preview !== 'fields'
    const previewCoversFields = [
        'slack',
        'ai',
        'ticket',
        'person',
        'webhook',
        'report',
        'branch',
        'wait',
        'window',
    ].includes(kind.preview)
    return (
        <div className="flex flex-col gap-2.5">
            {variant !== 'fields' && preview && <TilePreview action={action} workflow={workflow} kind={kind} />}
            {(variant === 'fields' || (variant === 'mixed' && !previewCoversFields) || !preview) && (
                <FieldList facts={kind.facts} />
            )}
            {variant !== 'preview' && <MetricsLine action={action} state={state} />}
            {variant === 'mixed' && (
                <div className="flex items-center gap-2 border-t pt-2 text-[11px] text-secondary">
                    <span>Click the step to edit it</span>
                </div>
            )}
        </div>
    )
}

function Expansion({
    variant,
    side,
    open,
    action,
    workflow,
    kind,
    state,
}: {
    variant: Exclude<TileHover, 'off'>
    side: boolean
    open: boolean
    action: HogFlowAction
    workflow: HogFlow
    kind: TileKind
    state: CardState
}): JSX.Element {
    const width = side ? Math.max(WIDTHS[variant], TILE + 12 + RAIL_CAPTION_WIDTH + PAD * 2) : WIDTHS[variant]
    const left = side ? -PAD : TILE / 2 - width / 2
    const [horizontalRight, horizontalLeft] = side
        ? [width - PAD - TILE, PAD]
        : [(width - TILE) / 2, (width - TILE) / 2]
    const closedClip = `inset(${PAD}px ${horizontalRight}px calc(100% - ${PAD + TILE}px) ${horizontalLeft}px round 12px)`
    const entered = state.metrics?.enteredByNode[action.id]
    return (
        <div
            className="absolute z-10 rounded-2xl border bg-surface-primary text-primary shadow-xl"
            style={{
                left,
                top: -PAD,
                width,
                padding: PAD,
                clipPath: open ? 'inset(0px 0px 0px 0px round 16px)' : closedClip,
                transition: `clip-path ${open ? 240 : CLOSE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
                borderColor: kind.color,
            }}
        >
            <div
                className={clsx('relative flex', side ? 'items-start gap-3' : 'flex-col items-center gap-1.5')}
                style={side ? undefined : { marginLeft: 'auto', marginRight: 'auto' }}
            >
                <TileFace kind={kind} state={state} entered={entered} showEmail={false} action={action} />
                <Caption kind={kind} side={side} />
                {!side && (
                    <div
                        className="absolute left-0 top-0 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: kind.color, maxWidth: (width - TILE) / 2 - PAD - 8 }}
                    >
                        {kind.label}
                    </div>
                )}
            </div>
            <div
                className="mt-3 border-t pt-3 transition-opacity"
                style={{
                    opacity: open ? 1 : 0,
                    transitionDuration: open ? '180ms' : '80ms',
                    transitionDelay: open ? '90ms' : '0ms',
                }}
            >
                {side && (
                    <div
                        className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: kind.color }}
                    >
                        {kind.label}
                    </div>
                )}
                <ExpandedContent variant={variant} action={action} workflow={workflow} kind={kind} state={state} />
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
    hover = 'off',
    forceOpen = false,
}: {
    action: HogFlowAction
    workflow: HogFlow
    state: CardState
    flow?: TileFlow
    hover?: TileHover
    forceOpen?: boolean
}): JSX.Element {
    const kind = useTileKind(action, workflow)
    const side = flow === 'rail'
    const showEmail = !!state.previews && !!emailContent(action)?.html
    const entered = state.metrics?.enteredByNode[action.id]
    const rates = state.metrics?.emailRates[action.id]
    const expansion = useHoverExpansion(hover !== 'off' && !state.dimmed, forceOpen && hover !== 'off')
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
                    state.selected && 'ring-2 ring-[var(--color-accent)] ring-offset-2'
                )}
            >
                <TileFace kind={kind} state={state} entered={entered} showEmail={showEmail} action={action} />
                {state.selected && (
                    <span className="absolute -right-9 top-0">
                        <StepActionsMenu action={action} />
                    </span>
                )}
                {expansion.mounted && hover !== 'off' && !showEmail && (
                    <Expansion
                        variant={hover}
                        side={side}
                        open={expansion.open}
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

export function TileGroupNode({
    group,
    workflow,
    state = {},
    flow = 'down',
    onExpand,
}: {
    group: BranchGroup
    workflow: HogFlow
    state?: CardState
    flow?: TileFlow
    onExpand?: () => void
}): JSX.Element {
    const side = flow === 'rail'
    const emails = groupEmails(workflow, group).reduce((sum, email) => sum + email.count, 0)
    const border = state.onPath ? 'var(--color-accent)' : 'var(--color-border-bold, #9ca3af)'
    return (
        <div
            className={clsx(
                'flex cursor-pointer text-primary transition-opacity',
                side ? 'items-start gap-3' : 'flex-col items-center gap-1.5 text-center',
                state.dimmed && 'opacity-30'
            )}
            title="Open this path"
            onClick={(e) => {
                e.stopPropagation()
                onExpand?.()
            }}
        >
            <div className="relative" data-tile-anchor style={{ width: TILE, height: TILE }}>
                {[8, 4].map((offset) => (
                    <div
                        key={offset}
                        className="absolute rounded-xl border-2 bg-surface-primary"
                        style={{
                            inset: 0,
                            transform: `translate(${offset}px, ${-offset}px)`,
                            borderColor: border,
                            opacity: 0.5,
                        }}
                    />
                ))}
                <div
                    className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed bg-surface-primary text-2xl text-secondary"
                    style={{ borderColor: border }}
                >
                    <IconStack />
                </div>
                <Badge className="-right-3 -top-3.5">{group.memberIds.length}</Badge>
            </div>
            <div
                className={clsx('flex flex-col gap-0.5', side ? 'pt-1 text-left' : 'items-center')}
                style={{ width: side ? RAIL_CAPTION_WIDTH : CAPTION_WIDTH }}
            >
                <div className="break-words text-[13px] font-semibold leading-tight">{group.label}</div>
                <div className="break-words text-xs leading-snug text-secondary">
                    {group.memberIds.length} steps{emails ? `, ${emails} ${emails === 1 ? 'email' : 'emails'}` : ''}.
                    Click to open
                </div>
            </div>
        </div>
    )
}
