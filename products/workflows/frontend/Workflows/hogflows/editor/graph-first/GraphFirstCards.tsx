// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
import clsx from 'clsx'
import { useActions, useValues } from 'kea'

import { IconChevronDown, IconChevronRight, IconCopy, IconDrag, IconEllipsis, IconPlusSmall, IconTrash } from '@posthog/icons'
import { LemonButton, LemonMenu, LemonTag, Tooltip } from '@posthog/lemon-ui'

import { EmailPreviewThumbnail } from 'lib/components/EmailPreviewThumbnail/EmailPreviewThumbnail'
import { humanFriendlyLargeNumber } from 'lib/utils/numbers'

import { workflowLogic } from '../../../workflowLogic'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import { useHogFlowStep } from '../../steps/HogFlowSteps'
import type { HogFlow, HogFlowAction } from '../../types'
import {
    BranchGroup,
    conditionText,
    emailContent,
    exitRuleText,
    groupEmails,
    humanDuration,
    SampleMetrics,
    triggerText,
} from './graphFirstModel'

export const CARD_WIDTH = 288
export const EMAIL_CARD_WIDTH = 312

type AnyConfig = Record<string, any>

export type CardState = {
    selected?: boolean
    previews?: boolean
    dimmed?: boolean
    onPath?: boolean
    metrics?: SampleMetrics | null
}

const KICKERS: Partial<Record<HogFlowAction['type'], string>> = {
    trigger: 'Start',
    exit: 'End',
    delay: 'Wait',
    wait_until_time_window: 'Wait for a time',
    wait_until_condition: 'Wait for an event',
    conditional_branch: 'Split by condition',
    random_cohort_branch: 'Random split',
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
    return (
        <div className="flex gap-2 text-[13px] leading-snug">
            <span className="w-16 shrink-0 text-secondary">{label}</span>
            <span className="min-w-0 flex-1 break-words">{children}</span>
        </div>
    )
}

function MetricsStrip({ action, metrics }: { action: HogFlowAction; metrics: SampleMetrics }): JSX.Element | null {
    const entered = metrics.enteredByNode[action.id]
    if (entered === undefined) {
        return null
    }
    const rates = metrics.emailRates[action.id]
    return (
        <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-1.5 text-xs">
            <LemonTag size="small" type="muted">
                {humanFriendlyLargeNumber(entered)} {action.type === 'exit' ? 'finished' : 'entered'}
            </LemonTag>
            {rates && (
                <>
                    <LemonTag size="small" type="success">
                        {Math.round(rates.opened * 100)}% opened
                    </LemonTag>
                    <LemonTag size="small" type="highlight">
                        {Math.round(rates.clicked * 100)}% clicked
                    </LemonTag>
                </>
            )}
            <span className="ml-auto text-[10px] uppercase tracking-wide text-tertiary">sample</span>
        </div>
    )
}

function CardBody({
    action,
    workflow,
    previews,
}: {
    action: HogFlowAction
    workflow: HogFlow
    previews?: boolean
}): JSX.Element | null {
    const config = action.config as AnyConfig
    const { hogFunctionTemplatesById } = useValues(workflowLogic)
    const email = emailContent(action)

    if (email) {
        return (
            <div className="flex flex-col gap-1.5">
                {email.to !== "the person's email address" && <Row label="To">{email.to}</Row>}
                <Tooltip
                    title={
                        !previews && email.html ? (
                            <EmailPreviewThumbnail html={email.html} title={`${action.name} preview`} size="listItem" />
                        ) : undefined
                    }
                >
                    <div className="break-words text-[16px] font-semibold leading-snug">“{email.subject}”</div>
                </Tooltip>
                {email.preheader && <div className="text-[13px] leading-snug text-secondary">{email.preheader}</div>}
                {previews && email.html && (
                    <div className="mt-1 h-28 overflow-hidden rounded border">
                        <EmailPreviewThumbnail html={email.html} title={`${action.name} preview`} size="listItem" />
                    </div>
                )}
            </div>
        )
    }

    switch (action.type) {
        case 'trigger':
            return <p className="m-0 text-[13px] leading-snug">{triggerText(workflow)}</p>
        case 'exit':
            return (
                <div className="flex flex-col gap-1">
                    <p className="m-0 text-[15px] font-semibold leading-snug">{config.reason || 'End of workflow'}</p>
                    <p className="m-0 text-[13px] leading-snug text-secondary">{exitRuleText(workflow)}</p>
                    {workflow.conversion?.window && (
                        <p className="m-0 text-[13px] leading-snug text-secondary">
                            Conversion goal window: {humanDuration(workflow.conversion.window)}
                        </p>
                    )}
                </div>
            )
        case 'delay':
            return (
                <p className="m-0 text-[15px] font-semibold leading-snug">
                    {humanDuration(config.delay_duration) || 'Not set'}
                </p>
            )
        case 'wait_until_time_window':
            return (
                <p className="m-0 text-[13px] leading-snug">
                    Until a <strong>{config.day === 'weekday' ? 'weekday' : config.day ?? 'day'}</strong> between{' '}
                    <strong>
                        {config.time?.[0]}–{config.time?.[1]}
                    </strong>{' '}
                    ({config.timezone ?? 'UTC'})
                </p>
            )
        case 'wait_until_condition':
            return (
                <p className="m-0 text-[13px] leading-snug">
                    Up to <strong>{humanDuration(config.max_wait_duration)}</strong> for{' '}
                    <strong>{config.condition?.name ?? 'a condition'}</strong>
                </p>
            )
        case 'conditional_branch':
            return (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {(config.conditions ?? []).map((condition: AnyConfig, index: number) => (
                        <li key={index} className="text-[13px] leading-snug">
                            <strong>{condition.name || `Condition ${index + 1}`}</strong>
                            <span className="text-secondary">: {conditionText(condition.filters)}</span>
                        </li>
                    ))}
                    <li className="text-[13px] leading-snug">
                        <strong>No match</strong>
                        <span className="text-secondary">: everyone else</span>
                    </li>
                </ul>
            )
        case 'random_cohort_branch':
            return (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {(config.cohorts ?? []).map((cohort: AnyConfig, index: number) => (
                        <li key={index} className="text-[13px] leading-snug">
                            <strong>{cohort.percentage}%</strong> {cohort.name}
                        </li>
                    ))}
                </ul>
            )
        default: {
            const template = config.template_id ? hogFunctionTemplatesById[config.template_id] : undefined
            return (
                <p className="m-0 text-[13px] leading-snug">
                    {template?.name ?? action.type}
                    {action.description ? <span className="text-secondary"> · {action.description}</span> : null}
                </p>
            )
        }
    }
}

function StepActionsMenu({ action }: { action: HogFlowAction }): JSX.Element | null {
    const { nodesById, selectedNodeCanBeDeleted, selectedNodeCanBeCopiedOrMoved } = useValues(hogFlowEditorLogic)
    const { startCopyingNode, startMovingNode, onNodesDelete, duplicateNodeBelow, setSelectedNodeId } =
        useActions(hogFlowEditorLogic)
    const node = nodesById[action.id]
    if (!node?.deletable) {
        return null
    }
    return (
        <div className="nodrag" onClick={(e) => e.stopPropagation()}>
            <LemonMenu
                items={[
                    {
                        label: 'Duplicate below',
                        icon: <IconPlusSmall />,
                        onClick: () => duplicateNodeBelow(action.id),
                    },
                    selectedNodeCanBeCopiedOrMoved
                        ? { label: 'Copy to…', icon: <IconCopy />, onClick: () => startCopyingNode(node) }
                        : null,
                    selectedNodeCanBeCopiedOrMoved
                        ? { label: 'Move to…', icon: <IconDrag />, onClick: () => startMovingNode(node) }
                        : null,
                    {
                        label: 'Delete',
                        status: 'danger',
                        icon: <IconTrash />,
                        disabledReason: selectedNodeCanBeDeleted ? undefined : 'Clean up branching steps first',
                        onClick: () => {
                            onNodesDelete([node])
                            setSelectedNodeId(null)
                        },
                    },
                ]}
            >
                <LemonButton size="xsmall" icon={<IconEllipsis />} tooltip="Step actions" />
            </LemonMenu>
        </div>
    )
}

export function ActionCard({
    action,
    workflow,
    state = {},
}: {
    action: HogFlowAction
    workflow: HogFlow
    state?: CardState
}): JSX.Element {
    const Step = useHogFlowStep(action)
    const { actionValidationErrorsById } = useValues(workflowLogic)
    const isEmail = !!emailContent(action)
    const isEnd = action.type === 'exit'
    const color = Step?.color || 'var(--color-text-secondary)'
    const invalid = actionValidationErrorsById[action.id]?.valid === false
    const kicker = isEmail ? 'Email' : KICKERS[action.type] ?? 'Action'

    return (
        <div
            className={clsx(
                'flex flex-col overflow-hidden rounded-lg border bg-surface-primary text-primary transition-opacity',
                state.selected && 'ring-2 ring-[var(--color-accent)]',
                state.dimmed && 'opacity-30',
                isEnd && 'border-2'
            )}
            style={{
                width: isEmail ? EMAIL_CARD_WIDTH : CARD_WIDTH,
                borderColor: state.onPath ? 'var(--color-accent)' : isEnd ? color : undefined,
                boxShadow: `0 2px 0 0 ${state.onPath ? 'var(--color-accent)' : `${color}33`}`,
            }}
        >
            <div className="flex items-start gap-2 px-3 pt-2.5">
                <div
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded text-base"
                    style={{ backgroundColor: `${color}22`, color }}
                >
                    {Step?.icon}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
                        {kicker}
                    </div>
                    <div className="break-words text-[14px] font-semibold leading-tight">{action.name}</div>
                </div>
                {invalid && (
                    <Tooltip title="This step needs attention. Open it to see what is missing.">
                        <span className="mt-1 size-2 shrink-0 rounded-full bg-warning" />
                    </Tooltip>
                )}
                {state.selected && <StepActionsMenu action={action} />}
            </div>
            <div className="px-3 pb-3 pt-1.5">
                <CardBody action={action} workflow={workflow} previews={state.previews} />
            </div>
            {state.metrics && <MetricsStrip action={action} metrics={state.metrics} />}
        </div>
    )
}

export function SummaryCard({
    group,
    workflow,
    state = {},
    onExpand,
}: {
    group: BranchGroup
    workflow: HogFlow
    state?: CardState
    onExpand?: () => void
}): JSX.Element {
    const emails = groupEmails(workflow, group)
    return (
        <div
            className={clsx(
                'flex flex-col gap-2 rounded-lg border-2 border-dashed bg-surface-secondary p-3 text-primary transition-opacity',
                state.dimmed && 'opacity-30'
            )}
            style={{ width: EMAIL_CARD_WIDTH, borderColor: state.onPath ? 'var(--color-accent)' : undefined }}
        >
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-secondary">
                        Path, collapsed
                    </div>
                    <div className="break-words text-[15px] font-semibold leading-tight">{group.label}</div>
                    <div className="text-[13px] text-secondary">When {group.condition}</div>
                </div>
                <LemonButton
                    size="small"
                    type="secondary"
                    icon={<IconChevronRight />}
                    className="nodrag"
                    onClick={(e) => {
                        e.stopPropagation()
                        onExpand?.()
                    }}
                >
                    Open
                </LemonButton>
            </div>
            <div className="text-xs text-secondary">
                {group.memberIds.length} steps · {emails.reduce((sum, e) => sum + e.count, 0)} emails
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {emails.map((email) => (
                    <li key={email.subject} className="flex gap-1.5 text-[13px] leading-snug">
                        <span aria-hidden>✉</span>
                        <span className="min-w-0 flex-1 break-words">
                            {email.subject}
                            {email.count > 1 && <span className="text-secondary"> · {email.count} paths</span>}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

export function GroupFrameHeader({
    group,
    onCollapse,
}: {
    group: BranchGroup
    onCollapse: () => void
}): JSX.Element {
    return (
        <div className="flex items-center gap-1.5">
            <LemonButton
                size="xsmall"
                icon={<IconChevronDown />}
                tooltip="Collapse this path"
                className="nodrag"
                onClick={(e) => {
                    e.stopPropagation()
                    onCollapse()
                }}
            />
            <span className="text-[13px] font-semibold">{group.label}</span>
            <span className="text-xs text-secondary">when {group.condition}</span>
        </div>
    )
}

export function NoteCard({ workflow }: { workflow: HogFlow }): JSX.Element {
    return (
        <div
            className="flex flex-col gap-1 rounded-md border p-3 text-[13px] leading-snug shadow-sm"
            style={{ width: 260, background: '#fff6d5', borderColor: '#ecd99a', color: '#3d3520' }}
        >
            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Note</div>
            <div className="font-semibold">{workflow.name}</div>
            <div>{workflow.description || 'No description yet.'}</div>
        </div>
    )
}
