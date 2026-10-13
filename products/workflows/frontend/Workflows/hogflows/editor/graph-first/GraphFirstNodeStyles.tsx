// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// Node style variations: none of them shows the step name or description. The icon says what kind of
// step it is, and the step's own data (subject, event, wait, split key, end reason) is the headline.
import clsx from 'clsx'
import { useValues } from 'kea'

import { LemonTag, Tooltip } from '@posthog/lemon-ui'

import { EmailPreviewThumbnail } from 'lib/components/EmailPreviewThumbnail/EmailPreviewThumbnail'
import { humanFriendlyLargeNumber } from 'lib/utils/numbers'

import { workflowLogic } from '../../../workflowLogic'
import { useHogFlowStep } from '../../steps/HogFlowSteps'
import type { HogFlow, HogFlowAction } from '../../types'
import { ActionCard, CardState, MetricsStrip, StepActionsMenu } from './GraphFirstCards'
import { emailContent, nodeFacts, NodeFacts } from './graphFirstModel'
import { TileFlow, TileHover, TileNode as HoverTileNode } from './TileNode'

export type NodeStyle = 'cards' | 'line' | 'tiles' | 'fields'

export const NODE_STYLES: { value: NodeStyle; label: string; tooltip: string }[] = [
    { value: 'line', label: 'Line', tooltip: 'Icon and one line of data. Fastest to scan.' },
    { value: 'tiles', label: 'Tiles', tooltip: 'n8n-style icon tiles with the data underneath.' },
    { value: 'fields', label: 'Fields', tooltip: 'Every setting on the node, no need to open it.' },
    { value: 'cards', label: 'Cards', tooltip: 'The previous version: kicker, name, and content.' },
]

type AnyConfig = Record<string, any>

type Look = {
    color: string
    icon: React.ReactNode
    facts: NodeFacts
    invalid: boolean
    email: ReturnType<typeof emailContent>
    isStart: boolean
    isEnd: boolean
}

function useLook(action: HogFlowAction, workflow: HogFlow): Look {
    const Step = useHogFlowStep(action)
    const { hogFunctionTemplatesById, actionValidationErrorsById } = useValues(workflowLogic)
    const config = action.config as AnyConfig
    const template = config.template_id ? hogFunctionTemplatesById[config.template_id] : undefined
    return {
        color: Step?.color || 'var(--color-text-secondary)',
        icon: Step?.icon,
        facts: nodeFacts(workflow, action, template?.name),
        invalid: actionValidationErrorsById[action.id]?.valid === false,
        email: emailContent(action),
        isStart: action.type === 'trigger',
        isEnd: action.type === 'exit',
    }
}

function IconChip({ look, size }: { look: Look; size: number }): JSX.Element {
    return (
        <div
            className="flex shrink-0 items-center justify-center rounded-md"
            style={{
                width: size,
                height: size,
                fontSize: size * 0.55,
                backgroundColor: `${look.color}1f`,
                color: look.color,
            }}
        >
            {look.icon}
        </div>
    )
}

function InvalidDot(): JSX.Element {
    return (
        <Tooltip title="This step needs attention. Open it to see what is missing.">
            <span className="size-2 shrink-0 rounded-full bg-warning" />
        </Tooltip>
    )
}

const percent = (value: number): string => `${Math.round(value * 100)}%`

function frameStyle(look: Look, state: CardState): React.CSSProperties {
    return {
        borderColor: state.onPath ? 'var(--color-accent)' : look.isEnd || look.isStart ? look.color : undefined,
    }
}

function LineNode({ action, workflow, state }: NodeProps): JSX.Element {
    const look = useLook(action, workflow)
    const entered = state.metrics?.enteredByNode[action.id]
    const rates = state.metrics?.emailRates[action.id]
    return (
        <div
            className={clsx(
                'flex items-center gap-2.5 rounded-lg border bg-surface-primary px-2.5 py-2 text-primary transition-opacity',
                state.selected && 'ring-2 ring-[var(--color-accent)]',
                state.dimmed && 'opacity-30',
                (look.isStart || look.isEnd) && 'border-2'
            )}
            style={{ width: look.email && state.previews ? 360 : 300, ...frameStyle(look, state) }}
            title={action.name}
        >
            <IconChip look={look} size={34} />
            <div className="min-w-0 flex-1">
                <div className="break-words text-[14px] font-semibold leading-snug">{look.facts.headline}</div>
                {look.facts.detail && (
                    <div className="break-words text-xs leading-snug text-secondary">{look.facts.detail}</div>
                )}
            </div>
            {look.email?.html && state.previews && (
                <EmailPreviewThumbnail
                    html={look.email.html}
                    title={`${action.name} preview`}
                    size="attachment"
                    className="rounded border"
                />
            )}
            {entered !== undefined && (
                <div className="shrink-0 text-right leading-tight">
                    <div className="text-[13px] font-semibold">{humanFriendlyLargeNumber(entered)}</div>
                    <div className="text-[11px] text-secondary">
                        {rates ? `${percent(rates.opened)} open` : look.isEnd ? 'done' : 'in'}
                    </div>
                </div>
            )}
            {look.invalid && <InvalidDot />}
            {state.selected && <StepActionsMenu action={action} />}
        </div>
    )
}

const TILE = 64

function tileRadius(look: Look): string {
    if (look.isStart) {
        return `${TILE / 2}px ${TILE / 2}px 12px 12px`
    }
    if (look.isEnd) {
        return `12px 12px ${TILE / 2}px ${TILE / 2}px`
    }
    return '12px'
}

function TileNode({ action, workflow, state }: NodeProps): JSX.Element {
    const look = useLook(action, workflow)
    const entered = state.metrics?.enteredByNode[action.id]
    const rates = state.metrics?.emailRates[action.id]
    const border = state.onPath ? 'var(--color-accent)' : look.color
    const showEmail = !!look.email?.html && state.previews
    return (
        <div
            className={clsx(
                'flex w-[220px] flex-col items-center gap-1.5 text-center text-primary transition-opacity',
                state.dimmed && 'opacity-30'
            )}
            title={action.name}
        >
            <div className="relative">
                {showEmail ? (
                    <div
                        className={clsx(
                            'overflow-hidden rounded-xl border-2 bg-surface-primary shadow-sm',
                            state.selected && 'ring-2 ring-[var(--color-accent)] ring-offset-2'
                        )}
                        style={{ borderColor: border }}
                    >
                        <EmailPreviewThumbnail html={look.email!.html!} title={`${action.name} preview`} size="card" />
                    </div>
                ) : (
                    <div
                        className={clsx(
                            'flex items-center justify-center border-2 bg-surface-primary shadow-sm',
                            state.selected && 'ring-2 ring-[var(--color-accent)] ring-offset-2'
                        )}
                        style={{
                            width: TILE,
                            height: TILE,
                            borderRadius: tileRadius(look),
                            borderColor: border,
                            color: look.color,
                            fontSize: 30,
                        }}
                    >
                        {look.icon}
                    </div>
                )}
                {showEmail && (
                    <div
                        className="absolute -left-2.5 -top-2.5 flex size-6 items-center justify-center rounded-full border bg-surface-primary text-sm"
                        style={{ color: look.color }}
                    >
                        {look.icon}
                    </div>
                )}
                {entered !== undefined && (
                    <span className="absolute -right-3 -top-2.5 rounded-full border bg-surface-primary px-1.5 text-[11px] font-semibold shadow-sm">
                        {humanFriendlyLargeNumber(entered)}
                    </span>
                )}
                {look.invalid && (
                    <span className="absolute -bottom-1 -right-1">
                        <InvalidDot />
                    </span>
                )}
                {state.selected && (
                    <span className="absolute -right-9 top-0">
                        <StepActionsMenu action={action} />
                    </span>
                )}
            </div>
            <div className="break-words text-[13px] font-semibold leading-tight">{look.facts.headline}</div>
            {look.facts.detail && (
                <div className="-mt-1 break-words text-xs leading-snug text-secondary">{look.facts.detail}</div>
            )}
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
    )
}

function FieldsNode({ action, workflow, state }: NodeProps): JSX.Element {
    const look = useLook(action, workflow)
    return (
        <div
            className={clsx(
                'flex flex-col overflow-hidden rounded-lg border bg-surface-primary text-primary transition-opacity',
                state.selected && 'ring-2 ring-[var(--color-accent)]',
                state.dimmed && 'opacity-30',
                (look.isStart || look.isEnd) && 'border-2'
            )}
            style={{ width: 320, ...frameStyle(look, state) }}
            title={action.name}
        >
            <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: `${look.color}14` }}>
                <IconChip look={look} size={26} />
                <div className="min-w-0 flex-1 break-words text-[14px] font-semibold leading-snug">
                    {look.facts.headline}
                </div>
                {look.invalid && <InvalidDot />}
                {state.selected && <StepActionsMenu action={action} />}
            </div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-2 text-[12.5px] leading-snug">
                {look.facts.fields.map(([label, value]) => (
                    <div key={label} className="contents">
                        <dt className="text-secondary">{label}</dt>
                        <dd className="m-0 min-w-0 break-words">{value}</dd>
                    </div>
                ))}
            </dl>
            {look.email?.html && state.previews && (
                <div className="mx-3 mb-3 h-28 overflow-hidden rounded border">
                    <EmailPreviewThumbnail html={look.email.html} title={`${action.name} preview`} size="listItem" />
                </div>
            )}
            {state.metrics && <MetricsStrip action={action} metrics={state.metrics} />}
        </div>
    )
}

type NodeProps = { action: HogFlowAction; workflow: HogFlow; state: CardState }

export function StepNode({
    action,
    workflow,
    state,
    style,
    tile,
}: NodeProps & { style: NodeStyle; tile?: { flow: TileFlow; hover: TileHover } }): JSX.Element {
    if (style === 'tiles' && tile) {
        return <HoverTileNode action={action} workflow={workflow} state={state} flow={tile.flow} hover={tile.hover} />
    }
    switch (style) {
        case 'line':
            return <LineNode action={action} workflow={workflow} state={state} />
        case 'tiles':
            return <TileNode action={action} workflow={workflow} state={state} />
        case 'fields':
            return <FieldsNode action={action} workflow={workflow} state={state} />
        default:
            return <ActionCard action={action} workflow={workflow} state={state} />
    }
}
