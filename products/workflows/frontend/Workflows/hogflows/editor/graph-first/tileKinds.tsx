// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// What each step kind looks like as a tile: icon, color, a corner badge with its key setting,
// the caption facts, and a small preview of what the step does.
import { useValues } from 'kea'

import {
    IconCalendar,
    IconChat,
    IconGraph,
    IconPerson,
    IconRewind,
    IconSearch,
    IconSparkles,
    IconGithub,
    IconPlay,
    IconFlag,
    IconWebhooks,
} from '@posthog/icons'

import { EmailPreviewThumbnail } from 'lib/components/EmailPreviewThumbnail/EmailPreviewThumbnail'
import { IconSlack } from 'lib/lemon-ui/icons'

import { workflowLogic } from '../../../workflowLogic'
import { useHogFlowStep } from '../../steps/HogFlowSteps'
import { PATH_SUMMARIES } from '../../tree/prototypeTileWorkflows'
import type { HogFlow, HogFlowAction } from '../../types'
import {
    BranchGroup,
    conditionText,
    emailContent,
    humanDuration,
    nodeFacts,
    NodeFacts,
    outgoingEdges,
} from './graphFirstModel'

type AnyConfig = Record<string, any>

export type PreviewKind =
    | 'email'
    | 'slack'
    | 'ai'
    | 'replay'
    | 'report'
    | 'webhook'
    | 'ticket'
    | 'person'
    | 'branch'
    | 'wait'
    | 'window'
    | 'fields'
    | 'flag'

export type TileKind = {
    label: string
    icon: React.ReactNode
    color: string
    badge?: string
    facts: NodeFacts
    preview: PreviewKind
    invalid: boolean
    isStart: boolean
    isEnd: boolean
}

const AI_COLOR = '#7c3aed'

export const PATH_COLORS = ['#2f80fa', '#e08a00', '#16a34a', '#db2777', '#0e7490']
export const NO_MATCH_COLOR = '#78716c'

/** The color of a branch path, so a split's legend, its frames, and its collapsed tiles match. */
export function pathColor(edge: { type: string; index?: number }): string {
    return edge.type === 'branch' ? PATH_COLORS[(edge.index ?? 0) % PATH_COLORS.length] : NO_MATCH_COLOR
}

const BASE_LABELS: Partial<Record<HogFlowAction['type'], string>> = {
    trigger: 'Trigger',
    exit: 'End',
    function_email: 'Email',
    delay: 'Delay',
    wait_until_condition: 'Wait for an event',
    wait_until_time_window: 'Time window',
    conditional_branch: 'Split',
    random_cohort_branch: 'Random split',
    function: 'Action',
}

const inputsOf = (action: HogFlowAction): AnyConfig =>
    Object.fromEntries(
        Object.entries(((action.config as AnyConfig).inputs ?? {}) as AnyConfig).map(([key, input]) => [
            key,
            input?.value,
        ])
    )

/** `{event.properties.subject}` reads as `subject` in captions. */
export const plainVariables = (text: string): string =>
    text.replace(/\{(?:[a-z]+\.properties\.|variables\.|event\.properties\.)?([a-z_]+)\}/gi, (_, key) =>
        key.replace(/_/g, ' ')
    )

const firstSentence = (text: string): string => text.split(/(?<=\.)\s/)[0]
const list = (items: string[]): string => items.map((item) => item.replace(/_/g, ' ')).join(', ')

function functionKind(action: HogFlowAction): Omit<TileKind, 'invalid' | 'isStart' | 'isEnd'> | undefined {
    const config = action.config as AnyConfig
    const inputs = inputsOf(action)
    switch (config.template_id) {
        case 'template-slack':
            return {
                label: 'Slack message',
                icon: <IconSlack />,
                color: '#611f69',
                facts: {
                    headline: `Post to ${inputs.channel}`,
                    detail: plainVariables(String(inputs.text ?? '')).split('\n')[0],
                    fields: [
                        ['Channel', inputs.channel],
                        ['Message', plainVariables(String(inputs.text ?? ''))],
                        ['Workspace', 'Connected workspace'],
                    ],
                },
                preview: 'slack',
            }
        case 'template-webhook': {
            const host = String(inputs.url ?? '')
                .replace(/^https?:\/\//, '')
                .split('/')[0]
            return {
                label: 'Webhook',
                icon: <IconWebhooks />,
                color: '#475569',
                badge: String(inputs.method ?? 'POST'),
                facts: {
                    headline: `Call ${host}`,
                    detail: `Sends ${list(Object.keys(inputs.body ?? {}))}`,
                    fields: [
                        ['Request', `${inputs.method ?? 'POST'} ${inputs.url}`],
                        ['Sends', list(Object.keys(inputs.body ?? {}))],
                    ],
                },
                preview: 'webhook',
            }
        }
        case 'prototype-ai-prompt': {
            const outputs: string[] = inputs.outputs ?? []
            const tools: string[] = inputs.tools ?? []
            return {
                label: 'AI step',
                icon: <IconSparkles />,
                color: AI_COLOR,
                badge: tools.length ? `${tools.length} tools` : undefined,
                facts: {
                    headline: `Decides ${list(outputs)}`,
                    detail: plainVariables(firstSentence(String(inputs.prompt ?? ''))),
                    fields: [
                        ['Prompt', plainVariables(String(inputs.prompt ?? ''))],
                        ['Writes', list(outputs)],
                        ...(tools.length ? [['Can use', tools.join(', ')] as [string, string]] : []),
                    ],
                },
                preview: 'ai',
            }
        }
        case 'template-posthog-create-task': {
            const outputs: string[] = inputs.outputs ?? []
            return {
                label: 'AI task',
                icon: <IconSparkles />,
                color: AI_COLOR,
                badge: 'Agent',
                facts: {
                    headline: plainVariables(String(inputs.title ?? 'AI task')),
                    detail: plainVariables(firstSentence(String(inputs.instructions ?? ''))),
                    fields: [
                        ['Task', plainVariables(String(inputs.title ?? ''))],
                        ['Instructions', plainVariables(String(inputs.instructions ?? ''))],
                        ['Writes', list(outputs)],
                    ],
                },
                preview: 'ai',
            }
        }
        case 'template-posthog-run-scout': {
            const outputs: string[] = inputs.outputs ?? []
            const scout = String(inputs.skill_name ?? 'scout').replace(/-/g, ' ')
            return {
                label: 'AI scout',
                icon: <IconSearch />,
                color: AI_COLOR,
                badge: 'Scout',
                facts: {
                    headline: `Investigate with the ${scout}`,
                    detail: `Finds ${list(outputs)}`,
                    fields: [
                        ['Scout', scout],
                        ['Looks at', 'Errors, logs, recent deploys, and replays'],
                        ['Writes', list(outputs)],
                    ],
                },
                preview: 'ai',
            }
        }
        case 'prototype-summarize-replay':
            return {
                label: 'Replay summary',
                icon: <IconRewind />,
                color: '#f54e00',
                badge: inputs.lookback,
                facts: {
                    headline: 'Summarize their last session',
                    detail: `Latest replay from the last ${humanDuration(inputs.lookback)}`,
                    fields: [
                        ['Session', `Latest in the last ${humanDuration(inputs.lookback)}`],
                        ['Writes', String(inputs.output ?? '').replace(/_/g, ' ')],
                    ],
                },
                preview: 'replay',
            }
        case 'prototype-update-flag': {
            const rollout = Number(inputs.rollout ?? 0)
            return {
                label: 'Feature flag',
                icon: <IconFlag />,
                color: '#0e9f6e',
                badge: `${rollout}%`,
                facts: {
                    headline: rollout === 0 ? `Turn ${inputs.flag} off` : `Roll ${inputs.flag} out to ${rollout}%`,
                    detail: rollout === 0 ? 'Rolls back for everyone' : `${rollout}% of people get it`,
                    fields: [
                        ['Flag', inputs.flag],
                        ['Rollout', `${rollout}% of people`],
                    ],
                },
                preview: 'flag',
            }
        }
        case 'prototype-run-insight': {
            const insights: string[] = inputs.insights ?? []
            return {
                label: 'Run insights',
                icon: <IconGraph />,
                color: '#1d4aff',
                badge: String(insights.length),
                facts: {
                    headline: insights.length > 1 ? `${insights[0]} and ${insights.length - 1} more` : insights[0],
                    detail: inputs.range,
                    fields: [
                        ['Insights', insights.join(', ')],
                        ['Range', inputs.range],
                        ['Writes', String(inputs.output ?? '')],
                    ],
                },
                preview: 'report',
            }
        }
        case 'template-posthog-send-ticket-message': {
            const note = !!inputs.is_private
            return {
                label: note ? 'Ticket note' : 'Ticket reply',
                icon: <IconChat />,
                color: '#0e7490',
                badge: note ? 'Private' : undefined,
                facts: {
                    headline: note ? 'Save as a note for an agent' : 'Reply to the customer',
                    detail: /^\{[^}]+\}$/.test(String(inputs.message))
                        ? `Sends the ${plainVariables(String(inputs.message))} from earlier`
                        : plainVariables(String(inputs.message ?? '')),
                    fields: [
                        ['Posts', note ? 'A private note on the ticket' : 'A reply the customer sees'],
                        ['Message', plainVariables(String(inputs.message ?? ''))],
                    ],
                },
                preview: 'ticket',
            }
        }
        case 'template-posthog-update-ticket':
            return {
                label: 'Update ticket',
                icon: <IconChat />,
                color: '#0e7490',
                facts: {
                    headline: `Assign to ${inputs.assignee}`,
                    detail: `Tag ${list(inputs.tags ?? [])}`,
                    fields: [
                        ['Assign to', inputs.assignee],
                        ['Tags', list(inputs.tags ?? [])],
                    ],
                },
                preview: 'ticket',
            }
        case 'template-posthog-update-person-properties': {
            const entries = Object.entries((inputs.properties ?? {}) as AnyConfig)
            return {
                label: 'Update person',
                icon: <IconPerson />,
                color: '#64748b',
                facts: {
                    headline: entries.map(([key, value]) => `Set ${key.replace(/_/g, ' ')} to ${value}`).join(', '),
                    detail: 'On the person',
                    fields: entries.map(([key, value]) => [key.replace(/_/g, ' '), String(value)]),
                },
                preview: 'person',
            }
        }
        default:
            return undefined
    }
}

function triggerKind(workflow: HogFlow, action: HogFlowAction): Partial<TileKind> | undefined {
    const trigger = workflow.trigger as AnyConfig
    if (trigger?.type === 'schedule') {
        const byDay: string = /BYDAY=([A-Z]{2})/.exec(trigger.schedule?.rrule ?? '')?.[1] ?? ''
        const hour = /BYHOUR=(\d+)/.exec(trigger.schedule?.rrule ?? '')?.[1] ?? '9'
        const day = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday' }[byDay] ?? 'day'
        const time = `${hour.padStart(2, '0')}:00`
        return {
            label: 'Schedule',
            icon: <IconCalendar />,
            badge: byDay ? 'Weekly' : 'Daily',
            facts: {
                headline: `Every ${day}, ${time}`,
                detail: `Runs on a schedule (${trigger.schedule?.timezone ?? 'UTC'})`,
                fields: [
                    ['Runs', `Every ${day} at ${time}`],
                    ['Time zone', trigger.schedule?.timezone ?? 'UTC'],
                ],
            },
        }
    }
    if (trigger?.type === 'manual') {
        return {
            label: 'Manual start',
            icon: <IconPlay />,
            badge: 'Manual',
            facts: {
                headline: action.name,
                detail: 'Someone starts it by hand',
                fields: [['Starts', 'When someone presses Run']],
            },
        }
    }
    if (trigger?.type === 'webhook') {
        const [source, event] = action.name.includes(':') ? action.name.split(/:\s*/) : ['Webhook', action.name]
        return {
            label: 'Webhook trigger',
            icon: source === 'GitHub' ? <IconGithub /> : <IconWebhooks />,
            badge: source,
            facts: {
                headline: event.charAt(0).toUpperCase() + event.slice(1),
                detail: `Starts when ${source} calls the webhook`,
                fields: [
                    ['Starts on', `${source} webhook`],
                    ['Event', event],
                ],
            },
        }
    }
    const event = trigger?.filters?.events?.[0]?.name
    if (event === 'survey sent') {
        return {
            label: 'Survey response',
            icon: <IconChat />,
            badge: 'NPS ≤ 6',
            facts: {
                headline: 'Someone answers the NPS survey',
                detail: 'With a score of 6 or lower',
                fields: [
                    ['Starts on', 'Survey response'],
                    ['Who', 'Anyone who scores 6 or lower'],
                ],
            },
        }
    }
    if (event === '$error_tracking_issue_spiking') {
        const facts = nodeFacts(workflow, action)
        return { label: 'Error spike', facts: { ...facts, headline: 'An error starts spiking' } }
    }
    return undefined
}

function previewKind(action: HogFlowAction): PreviewKind {
    switch (action.type) {
        case 'conditional_branch':
        case 'random_cohort_branch':
            return 'branch'
        case 'wait_until_time_window':
            return 'window'
        case 'delay':
        case 'wait_until_condition':
            return 'wait'
        default:
            return emailContent(action) ? 'email' : 'fields'
    }
}

function badgeFor(workflow: HogFlow, action: HogFlowAction): string | undefined {
    const config = action.config as AnyConfig
    switch (action.type) {
        case 'delay':
            return config.delay_duration
        case 'wait_until_condition':
            return `≤ ${config.max_wait_duration}`
        case 'wait_until_time_window':
            return `${config.time?.[0]?.slice(0, 2)}–${config.time?.[1]?.slice(0, 2)}`
        case 'conditional_branch':
        case 'random_cohort_branch':
            return `${outgoingEdges(workflow, action.id).length} paths`
        default:
            return undefined
    }
}

export function useTileKind(action: HogFlowAction, workflow: HogFlow): TileKind {
    const Step = useHogFlowStep(action)
    const { actionValidationErrorsById } = useValues(workflowLogic)
    const custom = action.type === 'function' ? functionKind(action) : undefined
    const trigger = action.type === 'trigger' ? triggerKind(workflow, action) : undefined
    const invented = String((action.config as AnyConfig).template_id ?? '').startsWith('prototype-')
    return {
        label: BASE_LABELS[action.type] ?? 'Step',
        icon: Step?.icon,
        color: Step?.color || 'var(--color-text-secondary)',
        badge: badgeFor(workflow, action),
        facts: nodeFacts(workflow, action),
        preview: previewKind(action),
        ...custom,
        ...trigger,
        invalid:
            !invented &&
            !workflow.id.startsWith('prototype-') &&
            actionValidationErrorsById[action.id]?.valid === false,
        isStart: action.type === 'trigger',
        isEnd: action.type === 'exit',
    }
}

// --- Previews: what the step does, drawn small ---

function Chip({ children, color }: { children: React.ReactNode; color?: string }): JSX.Element {
    return (
        <span
            className="rounded px-1 py-px font-mono text-[11px]"
            style={{ backgroundColor: `${color ?? AI_COLOR}1a`, color: color ?? AI_COLOR }}
        >
            {children}
        </span>
    )
}

function WithVariables({ text, color }: { text: string; color?: string }): JSX.Element {
    const parts = text.split(/(\{[^}]+\})/g)
    return (
        <>
            {parts.map((part, index) =>
                part.startsWith('{') ? (
                    <Chip key={index} color={color}>
                        {plainVariables(part)}
                    </Chip>
                ) : (
                    <span key={index}>{part}</span>
                )
            )}
        </>
    )
}

function SlackPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const inputs = inputsOf(action)
    return (
        <div className="rounded-md border bg-white p-2.5 text-left text-[12.5px] leading-snug text-[#1d1c1d]">
            <div className="mb-1.5 text-[11px] font-bold text-[#616061]">{inputs.channel}</div>
            <div className="flex gap-2">
                <div className="flex size-7 shrink-0 items-center justify-center rounded bg-[#f54e00] text-xs font-bold text-white">
                    W
                </div>
                <div className="min-w-0">
                    <div className="text-[12.5px] font-bold">
                        Workflows <span className="rounded bg-[#e8e8e8] px-1 text-[10px] font-semibold">APP</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words">
                        <WithVariables text={String(inputs.text ?? '')} color="#1264a3" />
                    </div>
                </div>
            </div>
        </div>
    )
}

function AiPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const inputs = inputsOf(action)
    const prompt = String(inputs.prompt ?? inputs.instructions ?? '')
    const outputs: string[] = inputs.outputs ?? []
    const tools: string[] = inputs.tools ?? (inputs.skill_name ? ['Errors', 'Logs', 'Deploys', 'Replays'] : [])
    return (
        <div className="flex flex-col gap-2 text-left text-[12.5px] leading-snug">
            {prompt && (
                <div className="rounded-md border border-[#7c3aed33] bg-[#7c3aed0d] p-2.5">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#7c3aed]">Prompt</div>
                    <WithVariables text={prompt} />
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
            <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-secondary">Writes</span>
                {outputs.map((output) => (
                    <Chip key={output}>{output}</Chip>
                ))}
            </div>
        </div>
    )
}

function ReplayPreview(): JSX.Element {
    const ticks = [8, 21, 34, 47, 52, 55, 58, 71, 86]
    return (
        <div className="flex flex-col gap-2 text-left text-[12.5px]">
            <div className="overflow-hidden rounded-md border bg-[#151515]">
                <div className="flex h-24 flex-col gap-1.5 p-2.5">
                    <div className="h-2 w-1/3 rounded bg-white/25" />
                    <div className="h-12 rounded bg-white/10" />
                    <div className="flex gap-1.5">
                        <div className="h-2 w-1/4 rounded bg-white/20" />
                        <div className="h-2 w-1/5 rounded bg-[#f54e00]/70" />
                    </div>
                </div>
                <div className="relative h-1.5 bg-white/10">
                    <div className="absolute inset-y-0 left-0 w-3/5 bg-[#f54e00]" />
                    {ticks.map((tick) => (
                        <span
                            key={tick}
                            className="absolute top-[-3px] h-3 w-0.5 rounded"
                            style={{ left: `${tick}%`, backgroundColor: tick > 50 && tick < 60 ? '#ef4444' : '#fff' }}
                        />
                    ))}
                </div>
            </div>
            <div className="text-[12px] leading-snug text-secondary">
                The summary says what they tried, where they got stuck, and any errors or rage clicks.
            </div>
        </div>
    )
}

function ReportPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const insights: string[] = inputsOf(action).insights ?? []
    const shapes = [
        [3, 4, 4, 5, 6, 6, 8],
        [6, 5, 6, 6, 7, 7, 7],
        [2, 3, 5, 4, 6, 7, 6],
    ]
    return (
        <div className="flex flex-col gap-1.5 text-left">
            {insights.map((insight, index) => (
                <div key={insight} className="flex items-end gap-2 rounded-md border px-2.5 py-1.5">
                    <span className="flex-1 text-[12.5px]">{insight}</span>
                    <span className="flex h-5 items-end gap-0.5">
                        {shapes[index % shapes.length].map((height, bar) => (
                            <span
                                key={bar}
                                className="w-1.5 rounded-sm bg-[#1d4aff]"
                                style={{ height: height * 2.5, opacity: 0.4 + bar * 0.09 }}
                            />
                        ))}
                    </span>
                </div>
            ))}
        </div>
    )
}

function WebhookPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const inputs = inputsOf(action)
    return (
        <div className="rounded-md bg-[#0f172a] p-2.5 text-left font-mono text-[11.5px] leading-relaxed text-[#e2e8f0]">
            <div>
                <span className="text-[#38bdf8]">{inputs.method ?? 'POST'}</span> {inputs.url}
            </div>
            <div className="whitespace-pre-wrap text-[#94a3b8]">{JSON.stringify(inputs.body ?? {}, null, 2)}</div>
        </div>
    )
}

function TicketPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const inputs = inputsOf(action)
    if (action.config && (action.config as AnyConfig).template_id === 'template-posthog-update-ticket') {
        return (
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-2.5 text-left text-[12.5px]">
                <span className="text-secondary">Ticket</span>
                {(inputs.tags ?? []).map((tag: string) => (
                    <span key={tag} className="rounded-full bg-[#0e74901a] px-2 text-[#0e7490]">
                        {tag}
                    </span>
                ))}
                <span className="text-secondary">→</span>
                <span className="font-semibold">{inputs.assignee}</span>
            </div>
        )
    }
    const note = !!inputs.is_private
    return (
        <div
            className="rounded-md border p-2.5 text-left text-[12.5px] leading-snug"
            style={{ backgroundColor: note ? '#fef9c3' : undefined, color: note ? '#3f3f00' : undefined }}
        >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">
                {note ? 'Private note, only agents see it' : 'Reply, the customer sees it'}
            </div>
            <WithVariables text={String(inputs.message ?? '')} color="#0e7490" />
        </div>
    )
}

function PersonPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const entries = Object.entries((inputsOf(action).properties ?? {}) as AnyConfig)
    return (
        <div className="flex flex-col gap-1 rounded-md border p-2.5 text-left font-mono text-[12px]">
            {entries.map(([key, value]) => (
                <div key={key}>
                    <span className="text-secondary">{key}</span> →{' '}
                    <span className="font-semibold">{String(value)}</span>
                </div>
            ))}
        </div>
    )
}

function BranchPreview({ action, workflow }: { action: HogFlowAction; workflow: HogFlow }): JSX.Element {
    const config = action.config as AnyConfig
    const rows: [string, string][] =
        action.type === 'random_cohort_branch'
            ? (config.cohorts ?? []).map((cohort: AnyConfig, index: number) => [
                  cohort.name || `Group ${index + 1}`,
                  `${cohort.percentage}% of people`,
              ])
            : [
                  ...(config.conditions ?? []).map((condition: AnyConfig, index: number): [string, string] => [
                      condition.name || `Condition ${index + 1}`,
                      conditionText(condition.filters),
                  ]),
                  ...(outgoingEdges(workflow, action.id).some((edge) => edge.type === 'continue')
                      ? [['No match', 'Everyone else'] as [string, string]]
                      : []),
              ]
    return (
        <div className="flex flex-col gap-1 text-left text-[12.5px]">
            {rows.map(([name, rule], index) => (
                <div key={name} className="flex items-baseline gap-2 rounded-md border px-2.5 py-1">
                    <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                            backgroundColor:
                                action.type === 'conditional_branch' && index >= (config.conditions?.length ?? 0)
                                    ? NO_MATCH_COLOR
                                    : PATH_COLORS[index % PATH_COLORS.length],
                        }}
                    />
                    <span className="font-semibold">{name}</span>
                    <span className="min-w-0 break-words text-secondary">{rule}</span>
                </div>
            ))}
        </div>
    )
}

function WaitPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const config = action.config as AnyConfig
    const waitsFor = action.type === 'wait_until_condition' ? config.condition?.name : undefined
    const duration = humanDuration(waitsFor ? config.max_wait_duration : config.delay_duration)
    return (
        <div className="flex flex-col gap-1.5 text-left text-[12.5px]">
            <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#a20031]" />
                <span className="h-px flex-1 border-t-2 border-dashed" />
                <span className="rounded-full border px-2 text-[11px] font-semibold">{duration}</span>
                <span className="h-px flex-1 border-t-2 border-dashed" />
                <span className="text-secondary">→</span>
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

function FlagPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const inputs = inputsOf(action)
    const rollout = Number(inputs.rollout ?? 0)
    return (
        <div className="flex flex-col gap-1.5 text-left text-[12.5px]">
            <div className="flex items-center gap-2">
                <code className="rounded bg-surface-secondary px-1">{inputs.flag}</code>
                <span className="ml-auto font-semibold">{rollout}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-secondary">
                <div className="h-full rounded-full bg-[#0e9f6e]" style={{ width: `${rollout}%` }} />
            </div>
            <div className="text-secondary">
                {rollout === 0 ? 'Nobody gets the new version.' : `${rollout}% of people get the new version.`}
            </div>
        </div>
    )
}

function WindowPreview({ action }: { action: HogFlowAction }): JSX.Element {
    const config = action.config as AnyConfig
    const start = parseInt(config.time?.[0] ?? '9', 10)
    const end = parseInt(config.time?.[1] ?? '17', 10)
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    return (
        <div className="flex flex-col gap-1 text-left text-[11px]">
            {days.map((day, index) => (
                <div key={index} className="flex items-center gap-1.5">
                    <span className="w-3 text-secondary">{day}</span>
                    <span className="relative h-2 flex-1 rounded-full bg-surface-secondary">
                        {(config.day !== 'weekday' || index < 5) && (
                            <span
                                className="absolute inset-y-0 rounded-full bg-[#FF653F]"
                                style={{ left: `${(start / 24) * 100}%`, width: `${((end - start) / 24) * 100}%` }}
                            />
                        )}
                    </span>
                </div>
            ))}
            <div className="text-secondary">
                {config.time?.[0]}–{config.time?.[1]} {config.timezone ?? 'UTC'}
            </div>
        </div>
    )
}

export function TilePreview({
    action,
    workflow,
    kind,
}: {
    action: HogFlowAction
    workflow: HogFlow
    kind: TileKind
}): JSX.Element {
    switch (kind.preview) {
        case 'email': {
            const content = emailContent(action)
            return content?.html ? (
                <div className="flex justify-center overflow-hidden rounded-md border bg-white">
                    <EmailPreviewThumbnail html={content.html} title={`${action.name} preview`} size="listItem" />
                </div>
            ) : (
                <></>
            )
        }
        case 'slack':
            return <SlackPreview action={action} />
        case 'ai':
            return <AiPreview action={action} />
        case 'replay':
            return <ReplayPreview />
        case 'report':
            return <ReportPreview action={action} />
        case 'webhook':
            return <WebhookPreview action={action} />
        case 'ticket':
            return <TicketPreview action={action} />
        case 'person':
            return <PersonPreview action={action} />
        case 'branch':
            return <BranchPreview action={action} workflow={workflow} />
        case 'wait':
            return <WaitPreview action={action} />
        case 'window':
            return <WindowPreview action={action} />
        case 'flag':
            return <FlagPreview action={action} />
        default:
            return <FieldList facts={kind.facts} />
    }
}

export function FieldList({ facts }: { facts: NodeFacts }): JSX.Element {
    return (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-left text-[12.5px] leading-snug">
            {facts.fields.map(([label, value]) => (
                <div key={label} className="contents">
                    <dt className="text-secondary">{label}</dt>
                    <dd className="m-0 min-w-0 break-words">{value}</dd>
                </div>
            ))}
        </dl>
    )
}

/** What a collapsed path does: the AI author's summary when there is one, otherwise its steps in order. */
export function pathSummary(workflow: HogFlow, group: BranchGroup): { text: string; ai: boolean } {
    const key = `${group.edge.from}:${group.edge.type}:${group.edge.index ?? ''}`
    const written = PATH_SUMMARIES[workflow.id]?.[key]
    if (written) {
        return { text: written, ai: true }
    }
    const steps = workflow.actions
        .filter((action) => group.memberIds.includes(action.id))
        .slice(0, 3)
        .map((action) => nodeFacts(workflow, action).headline)
    return { text: steps.join(', then '), ai: false }
}
