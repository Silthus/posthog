import { EmailPreviewThumbnail } from 'lib/components/EmailPreviewThumbnail/EmailPreviewThumbnail'

import type { HogFlow, HogFlowAction } from '../../types'
import { conditionText, emailContent, humanDuration, outputKeys, plainVariables, stepInput } from './stepFacts'
import { StepFieldList } from './StepFieldList'
import { outgoingEdges, pathColor, tint } from './tileCanvasModel'
import type { TileStep } from './useTileStep'

const VARIABLE_SPLIT = /(\{\{?[^}]+\}?\})/g
const IS_VARIABLE = /^\{\{?[^}]+\}?\}$/

function TextWithVariables({ text, color }: { text: string; color: string }): JSX.Element {
    return (
        <>
            {text.split(VARIABLE_SPLIT).map((part, index) =>
                IS_VARIABLE.test(part) ? (
                    <span
                        key={index}
                        className="rounded px-1 py-px font-mono text-[11px]"
                        style={{ color, backgroundColor: tint(color, 10) }}
                    >
                        {plainVariables(part)}
                    </span>
                ) : (
                    <span key={index}>{part}</span>
                )
            )}
        </>
    )
}

function EmailPreview({ action }: { action: HogFlowAction }): JSX.Element | null {
    const html = emailContent(action)?.html
    return html ? (
        <div className="flex justify-center overflow-hidden rounded-md border bg-white">
            <EmailPreviewThumbnail html={html} title={`${action.name} preview`} size="card" />
        </div>
    ) : null
}

function SlackPreview({ action, color }: { action: HogFlowAction; color: string }): JSX.Element {
    const text = stepInput(action, 'text').text ?? ''
    return (
        <div className="rounded-md border p-2.5 text-left text-[12.5px] leading-snug">
            <div className="whitespace-pre-wrap break-words">
                {text ? (
                    <TextWithVariables text={text} color={color} />
                ) : (
                    <span className="text-secondary">No message yet</span>
                )}
            </div>
        </div>
    )
}

function AiPreview({ action, color }: { action: HogFlowAction; color: string }): JSX.Element {
    const prompt = stepInput(action, 'prompt').text
    const tools = [...stepInput(action, 'connectors').list, ...stepInput(action, 'skills').list]
    const writes = outputKeys(action)
    return (
        <div className="flex flex-col gap-2 text-left text-[12.5px] leading-snug">
            {prompt && (
                <div
                    className="rounded-md border p-2.5"
                    style={{ borderColor: tint(color, 30), backgroundColor: tint(color, 6) }}
                >
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
                        Instructions
                    </div>
                    <TextWithVariables text={prompt} color={color} />
                </div>
            )}
            {tools.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-secondary">Can use</span>
                    {tools.map((tool) => (
                        <span key={tool} className="rounded-full border px-1.5 text-[11px]">
                            {tool}
                        </span>
                    ))}
                </div>
            )}
            {writes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-secondary">Writes</span>
                    {writes.map((output) => (
                        <span
                            key={output}
                            className="rounded px-1 py-px font-mono text-[11px]"
                            style={{ color, backgroundColor: tint(color, 10) }}
                        >
                            {output}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

function WebhookPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const url = stepInput(action, 'url').text ?? 'URL not set'
    const method = stepInput(action, 'method').text ?? 'POST'
    const body = stepInput(action, 'body').record
    return (
        <div className="rounded-md border bg-surface-secondary p-2.5 text-left font-mono text-[11.5px] leading-relaxed">
            <div className="break-all">
                <span className="font-semibold">{method}</span> {url}
            </div>
            {Object.keys(body).length > 0 && (
                <div className="whitespace-pre-wrap text-secondary">{JSON.stringify(body, null, 2)}</div>
            )}
        </div>
    )
}

function TicketPreview({ action, color }: { action: HogFlowAction; color: string }): JSX.Element {
    const message = stepInput(action, 'message').text
    if (!message) {
        const tags = stepInput(action, 'tags').list
        return (
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-2.5 text-left text-[12.5px]">
                <span className="text-secondary">Ticket</span>
                {tags.map((tag) => (
                    <span key={tag} className="rounded-full px-2" style={{ color, backgroundColor: tint(color, 10) }}>
                        {tag}
                    </span>
                ))}
                {stepInput(action, 'status').text && <span>Status: {stepInput(action, 'status').text}</span>}
            </div>
        )
    }
    const isNote = isPrivate(action)
    return (
        <div className="rounded-md border p-2.5 text-left text-[12.5px] leading-snug">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-secondary">
                {isNote ? 'Private note, only agents see it' : 'Reply, the customer sees it'}
            </div>
            <TextWithVariables text={message} color={color} />
        </div>
    )
}

function isPrivate(action: HogFlowAction): boolean {
    return action.type === 'function' && action.config.inputs?.is_private?.value === true
}

function PersonPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const properties = Object.entries(stepInput(action, 'set_properties').record)
    return (
        <div className="flex flex-col gap-1 rounded-md border p-2.5 text-left font-mono text-[12px]">
            {properties.map(([key, value]) => (
                <div key={key}>
                    <span className="text-secondary">{key}</span> to{' '}
                    <span className="font-semibold">{String(value)}</span>
                </div>
            ))}
        </div>
    )
}

function BranchPreview({ action, workflow }: { action: HogFlowAction; workflow: HogFlow }): JSX.Element {
    const rows: [string, string, string][] =
        action.type === 'random_cohort_branch'
            ? action.config.cohorts.map((cohort, index) => [
                  cohort.name || `Group ${index + 1}`,
                  `${cohort.percentage}% of people`,
                  pathColor({ type: 'branch', index }),
              ])
            : action.type === 'conditional_branch'
              ? [
                    ...action.config.conditions.map((condition, index): [string, string, string] => [
                        condition.name || `Condition ${index + 1}`,
                        conditionText(condition.filters),
                        pathColor({ type: 'branch', index }),
                    ]),
                    ...(outgoingEdges(workflow, action.id).some((edge) => edge.type === 'continue')
                        ? [['No match', 'Everyone else', pathColor({ type: 'continue' })] as [string, string, string]]
                        : []),
                ]
              : []
    return (
        <div className="flex flex-col gap-1 text-left text-[12.5px]">
            {rows.map(([name, rule, color]) => (
                <div key={name} className="flex items-baseline gap-2 rounded-md border px-2.5 py-1">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-semibold">{name}</span>
                    <span className="min-w-0 break-words text-secondary">{rule}</span>
                </div>
            ))}
        </div>
    )
}

function WaitPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const waitsFor =
        action.type === 'wait_until_condition' ? (action.config.condition.name ?? 'the condition') : undefined
    const duration =
        action.type === 'wait_until_condition'
            ? humanDuration(action.config.max_wait_duration)
            : action.type === 'delay'
              ? humanDuration(action.config.delay_duration)
              : ''
    return (
        <div className="flex flex-col gap-1.5 text-left text-[12.5px]">
            <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[var(--color-text-secondary)]" />
                <span className="h-px flex-1 border-t-2 border-dashed" />
                <span className="rounded-full border px-2 text-[11px] font-semibold">{duration || 'Not set'}</span>
                <span className="h-px flex-1 border-t-2 border-dashed" />
            </div>
            {waitsFor ? (
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-success">If</span>
                    <span>{waitsFor} happens, continue right away</span>
                    <span className="font-semibold text-secondary">Else</span>
                    <span>after {duration}, take the other path</span>
                </div>
            ) : (
                <div className="text-secondary">Everyone waits {duration}, then continues</div>
            )}
        </div>
    )
}

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function TimeWindowPreview({ action, color }: { action: HogFlowAction; color: string }): JSX.Element | null {
    if (action.type !== 'wait_until_time_window') {
        return null
    }
    const { day, time } = action.config
    const [start, end] = time === 'any' ? [0, 24] : [parseInt(time[0], 10), parseInt(time[1], 10)]
    const isOpenOn = (index: number): boolean =>
        day === 'any' ||
        (day === 'weekday' && index < 5) ||
        (day === 'weekend' && index >= 5) ||
        (Array.isArray(day) && (day as string[]).includes(WEEKDAY_NAMES[index]))
    return (
        <div className="flex flex-col gap-1 text-left text-[11px]">
            {WEEK.map((name, index) => (
                <div key={name} className="flex items-center gap-1.5">
                    <span className="w-7 text-secondary">{name}</span>
                    <span className="relative h-2 flex-1 rounded-full bg-surface-secondary">
                        {isOpenOn(index) && (
                            <span
                                className="absolute inset-y-0 rounded-full"
                                style={{
                                    backgroundColor: color,
                                    left: `${(start / 24) * 100}%`,
                                    width: `${(Math.max(end - start, 0) / 24) * 100}%`,
                                }}
                            />
                        )}
                    </span>
                </div>
            ))}
        </div>
    )
}

export function StepPreview({
    action,
    workflow,
    tile,
}: {
    action: HogFlowAction
    workflow: HogFlow
    tile: TileStep
}): JSX.Element | null {
    switch (tile.preview) {
        case 'email':
            return <EmailPreview action={action} />
        case 'slack':
            return <SlackPreview action={action} color={tile.color} />
        case 'ai':
            return <AiPreview action={action} color={tile.color} />
        case 'webhook':
            return <WebhookPreview action={action} />
        case 'ticket':
            return <TicketPreview action={action} color={tile.color} />
        case 'person':
            return <PersonPreview action={action} />
        case 'branch':
            return <BranchPreview action={action} workflow={workflow} />
        case 'wait':
            return <WaitPreview action={action} />
        case 'window':
            return <TimeWindowPreview action={action} color={tile.color} />
        default:
            return <StepFieldList facts={tile.facts} />
    }
}
