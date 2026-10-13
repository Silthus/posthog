import { isFunctionAction } from '../../steps/types'
import { isBranchingAction } from '../../tree/workflowTree'
import type { HogFlow, HogFlowAction } from '../../types'
import { FlowGraph, outgoingEdges, pathActions, PathGroup } from './tileCanvasModel'

type ActionOf<T extends HogFlowAction['type']> = Extract<HogFlowAction, { type: T }>
type FunctionAction = ActionOf<'function' | 'function_email' | 'function_sms' | 'function_push'>

export interface StepFacts {
    headline: string
    detail?: string
    fields: [string, string][]
}

export type StepPreviewKind =
    | 'email'
    | 'slack'
    | 'ai'
    | 'webhook'
    | 'ticket'
    | 'person'
    | 'branch'
    | 'wait'
    | 'window'
    | 'fields'

const DURATION_UNITS: Record<string, [string, string]> = {
    s: ['second', 'seconds'],
    m: ['minute', 'minutes'],
    h: ['hour', 'hours'],
    d: ['day', 'days'],
    w: ['week', 'weeks'],
}

export function humanDuration(raw: string | undefined | null): string {
    const parts = /^(\d+(?:\.\d+)?)\s*([smhdw])$/.exec(raw ?? '')
    if (!parts) {
        return raw ?? ''
    }
    const count = Number(parts[1])
    const [one, many] = DURATION_UNITS[parts[2]]
    return `${count} ${count === 1 ? one : many}`
}

const asText = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value : typeof value === 'number' ? String(value) : undefined

const asTextList = (value: unknown): string[] =>
    Array.isArray(value) ? value.flatMap((item) => (asText(item) ? [asText(item) as string] : [])) : []

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

function inputValue(action: FunctionAction, key: string): unknown {
    return action.config.inputs?.[key]?.value
}

export function stepInput(
    action: HogFlowAction,
    key: string
): { text?: string; list: string[]; record: Record<string, unknown> } {
    const value = isFunctionAction(action) ? inputValue(action, key) : undefined
    return { text: asText(value), list: asTextList(value), record: asRecord(value) }
}

export function templateIdOf(action: HogFlowAction): string | undefined {
    return isFunctionAction(action) ? action.config.template_id : undefined
}

export function plainVariables(text: string): string {
    return text.replace(/\{\{?\s*(?:[a-z_]+\.)*([a-z_]+)\s*\}?\}/gi, (_, key: string) => key.replace(/_/g, ' '))
}

const firstLine = (text: string): string => text.split('\n')[0]
const firstSentence = (text: string): string => text.split(/(?<=[.!?])\s/)[0]
const humanKey = (key: string): string => key.replace(/^\$/, '').replace(/_/g, ' ')
const joinList = (items: string[]): string => items.map(humanKey).join(', ')

function propertyFilterText(filter: unknown): string {
    const { key, value, operator } = asRecord(filter)
    const values = Array.isArray(value) ? asTextList(value).join(' or ') : (asText(value) ?? '')
    const verb = typeof operator === 'string' && operator !== 'exact' ? operator.replace(/_/g, ' ') : 'is'
    return `${humanKey(asText(key) ?? 'property')} ${verb} ${values}`.trim()
}

function eventNames(events: unknown): string[] {
    return (Array.isArray(events) ? events : []).flatMap((event) => {
        const { name, id } = asRecord(event)
        const label = asText(name) ?? asText(id)
        return label ? [label] : []
    })
}

/** PostHog actions the trigger starts on, listed beside its events. */
function triggerActions(filters: unknown): unknown {
    return asRecord(filters).actions
}

export function conditionText(filters: unknown): string {
    const { events, properties } = asRecord(filters)
    const parts = [
        ...eventNames(events).map((name) => `did ${name}`),
        ...(Array.isArray(properties) ? properties : []).map(propertyFilterText),
    ]
    return parts.length ? parts.join(' and ') : 'everyone'
}

function exitRuleText(workflow: Pick<HogFlow, 'exit_condition'>): string {
    switch (workflow.exit_condition) {
        case 'exit_on_conversion':
            return 'People also leave early when they convert'
        case 'exit_on_trigger_not_matched':
            return 'People also leave early when they stop matching the trigger'
        case 'exit_on_trigger_not_matched_or_conversion':
            return 'People also leave early when they convert or stop matching the trigger'
        default:
            return 'Nobody leaves early: everyone runs to the end'
    }
}

export interface EmailContent {
    subject: string
    preheader?: string
    to: string
    html?: string
}

export function emailContent(action: HogFlowAction): EmailContent | undefined {
    if (!isFunctionAction(action) || action.config.template_id !== 'template-email') {
        return undefined
    }
    const email = asRecord(inputValue(action, 'email'))
    const toEmail = asText(asRecord(email.to).email) ?? ''
    return {
        subject: asText(email.subject) ?? 'No subject yet',
        preheader: asText(email.preheader),
        to: /person\.properties\.email/.test(toEmail) ? 'Their email address' : toEmail || 'Not set',
        html: asText(email.html),
    }
}

/** Slack stores a picked channel as `<id>|#<name>`; show the name when it is there. */
function slackChannelName(value: unknown): string {
    const channel = asText(value) ?? ''
    return channel.includes('|') ? channel.split('|')[1] : channel || 'a channel'
}

export function outputKeys(action: HogFlowAction): string[] {
    const output = action.output_variable
    const list = Array.isArray(output) ? output : output ? [output] : []
    return list.map((variable) => variable.key)
}

function aiToolCount(action: FunctionAction): number {
    return asTextList(inputValue(action, 'connectors')).length + asTextList(inputValue(action, 'skills')).length
}

function functionFacts(action: FunctionAction, templateName: string | undefined): StepFacts | undefined {
    switch (action.config.template_id) {
        case 'template-slack': {
            const channel = slackChannelName(inputValue(action, 'channel'))
            const text = plainVariables(asText(inputValue(action, 'text')) ?? '')
            return {
                headline: `Post to ${channel}`,
                detail: firstLine(text) || undefined,
                fields: [
                    ['Channel', channel],
                    ['Message', text || 'Not set'],
                ],
            }
        }
        case 'template-webhook': {
            const url = asText(inputValue(action, 'url')) ?? ''
            const method = asText(inputValue(action, 'method')) ?? 'POST'
            const sends = Object.keys(asRecord(inputValue(action, 'body')))
            return {
                headline: url ? `Call ${url.replace(/^https?:\/\//, '').split('/')[0]}` : 'Call a URL',
                detail: sends.length ? `Sends ${joinList(sends)}` : undefined,
                fields: [
                    ['Request', `${method} ${url || 'URL not set'}`],
                    ...(sends.length ? [['Sends', joinList(sends)] as [string, string]] : []),
                ],
            }
        }
        case 'template-posthog-create-task': {
            const prompt = plainVariables(asText(inputValue(action, 'prompt')) ?? '')
            const title = asText(inputValue(action, 'title'))
            const writes = outputKeys(action)
            const repository = asText(inputValue(action, 'repository'))
            return {
                headline: title ? plainVariables(title) : firstSentence(prompt) || 'AI task',
                detail: firstSentence(prompt) || undefined,
                fields: [
                    ['Instructions', prompt || 'Not set'],
                    ...(repository ? [['Repository', repository] as [string, string]] : []),
                    ...(writes.length ? [['Writes', joinList(writes)] as [string, string]] : []),
                ],
            }
        }
        case 'template-posthog-run-scout': {
            const scout = (asText(inputValue(action, 'skill_name')) ?? '').replace(/-/g, ' ')
            const writes = outputKeys(action)
            return {
                headline: scout ? `Run the ${scout} scout` : 'Run a scout',
                detail: writes.length ? `Writes ${joinList(writes)}` : undefined,
                fields: [
                    ['Scout', scout || 'Not set'],
                    ...(writes.length ? [['Writes', joinList(writes)] as [string, string]] : []),
                ],
            }
        }
        case 'template-posthog-send-ticket-message': {
            const isNote = inputValue(action, 'is_private') === true
            const rawMessage = asText(inputValue(action, 'message')) ?? ''
            const message = plainVariables(rawMessage)
            const sendsEarlierValue = /^\{\{?[^}]+\}?\}$/.test(rawMessage.trim())
            return {
                headline: isNote ? 'Save a note for an agent' : 'Reply to the customer',
                detail: sendsEarlierValue ? `Sends the ${message} from earlier` : message || undefined,
                fields: [
                    ['Posts', isNote ? 'A private note on the ticket' : 'A reply the customer sees'],
                    ['Message', message || 'Not set'],
                ],
            }
        }
        case 'template-posthog-update-ticket': {
            const status = asText(inputValue(action, 'status'))
            const priority = asText(inputValue(action, 'priority'))
            const tags = asTextList(inputValue(action, 'tags'))
            const changes = [
                ...(status ? [`Set status to ${status}`] : []),
                ...(priority ? [`Set priority to ${priority}`] : []),
                ...(tags.length ? [`Tag ${tags.join(', ')}`] : []),
            ]
            return {
                headline: changes[0] ?? 'Update the ticket',
                detail: changes.slice(1).join(', ') || undefined,
                fields: [
                    ...(status ? [['Status', status] as [string, string]] : []),
                    ...(priority ? [['Priority', priority] as [string, string]] : []),
                    ...(tags.length ? [['Tags', tags.join(', ')] as [string, string]] : []),
                ],
            }
        }
        case 'template-posthog-update-person-properties': {
            const entries = Object.entries(asRecord(inputValue(action, 'set_properties')))
            return {
                headline: entries.length
                    ? entries.map(([key, value]) => `Set ${humanKey(key)} to ${asText(value) ?? ''}`).join(', ')
                    : 'Update person properties',
                detail: 'On the person',
                fields: entries.map(([key, value]) => [humanKey(key), asText(value) ?? '']),
            }
        }
        default:
            return templateName ? { headline: templateName, fields: [['Runs', templateName]] } : undefined
    }
}

function triggerFacts(action: ActionOf<'trigger'>, templateName: string | undefined): StepFacts {
    const trigger = action.config
    switch (trigger.type) {
        case 'event':
        case 'internal-event': {
            const events = [...eventNames(trigger.filters.events), ...eventNames(triggerActions(trigger.filters))]
            const properties = trigger.filters.properties ?? []
            const who = properties.length ? conditionText({ properties }) : 'Anyone'
            return {
                headline: events.join(' or ') || 'Any event',
                detail: properties.length
                    ? `Starts when someone does this, if ${who}`
                    : 'Starts when someone does this',
                fields: [
                    ['Starts on', events.join(', ') || 'Any event'],
                    ['Who', who],
                ],
            }
        }
        case 'batch': {
            const audience = conditionText({ properties: trigger.filters.properties })
            return {
                headline: audience === 'everyone' ? 'Everyone' : audience.charAt(0).toUpperCase() + audience.slice(1),
                detail: 'Audience, starts once for every person',
                fields: [['Who', audience]],
            }
        }
        case 'schedule':
            return {
                headline: 'On a schedule',
                detail: 'Runs at the times you set',
                fields: [['Starts', 'On a schedule']],
            }
        case 'manual':
            return {
                headline: 'Run by hand',
                detail: 'Someone starts it',
                fields: [['Starts', 'When someone runs it']],
            }
        case 'webhook':
            return {
                headline: templateName ?? 'Webhook call',
                detail: 'Starts when the webhook is called',
                fields: [['Starts on', templateName ?? 'A webhook call']],
            }
        case 'tracking_pixel':
            return {
                headline: 'Tracking pixel',
                detail: 'Starts when the pixel loads',
                fields: [['Starts on', 'A tracking pixel load']],
            }
        default:
            return {
                headline: trigger.table_name,
                detail: 'Starts for every new row',
                fields: [['Table', trigger.table_name]],
            }
    }
}

function timeWindowText(config: ActionOf<'wait_until_time_window'>['config']): { day: string; time: string } {
    const day = Array.isArray(config.day)
        ? config.day.map((name) => name.charAt(0).toUpperCase() + name.slice(1, 3)).join(', ')
        : config.day === 'any'
          ? 'day'
          : config.day
    const time = config.time === 'any' ? 'any time' : `${config.time[0]} to ${config.time[1]}`
    return { day, time }
}

export interface TimeSpan {
    start: number
    end: number
}

const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function isWindowDay(day: ActionOf<'wait_until_time_window'>['config']['day'], weekday: number): boolean {
    return (
        day === 'any' ||
        (day === 'weekday' && weekday < 5) ||
        (day === 'weekend' && weekday >= 5) ||
        (Array.isArray(day) && (day as string[]).includes(WEEKDAY_NAMES[weekday]))
    )
}

function hoursOf(time: string): number {
    const [hours, minutes] = time.split(':').map(Number)
    return hours + (minutes || 0) / 60
}

/** The open hours of each weekday, Monday first. Matches the workflow runner: a window whose end is not after
 * its start runs past midnight, and that morning part belongs to the day the window started. */
export function timeWindowSpans(config: ActionOf<'wait_until_time_window'>['config']): TimeSpan[][] {
    return WEEKDAY_NAMES.map((_, weekday) => {
        const isOpenOn = (offset: number): boolean => isWindowDay(config.day, (weekday + 7 - offset) % 7)
        if (config.time === 'any') {
            return isOpenOn(0) ? [{ start: 0, end: 24 }] : []
        }
        const start = hoursOf(config.time[0])
        const end = hoursOf(config.time[1])
        if (end > start) {
            return isOpenOn(0) ? [{ start, end }] : []
        }
        return [...(isOpenOn(1) && end > 0 ? [{ start: 0, end }] : []), ...(isOpenOn(0) ? [{ start, end: 24 }] : [])]
    })
}

type BranchCondition = ActionOf<'conditional_branch'>['config']['conditions'][number]
type BranchCohort = ActionOf<'random_cohort_branch'>['config']['cohorts'][number]

/** A draft split can be saved before its paths are set up, so its list can be missing. */
export function branchConditions(action: ActionOf<'conditional_branch'>): BranchCondition[] {
    return action.config.conditions ?? []
}

export function branchCohorts(action: ActionOf<'random_cohort_branch'>): BranchCohort[] {
    return action.config.cohorts ?? []
}

export interface CohortShare {
    name: string
    percent: number
}

/** The runner picks a group by its weight against the sum of all weights, so the weights read as shares of 100. */
export function cohortShares(action: ActionOf<'random_cohort_branch'>): CohortShare[] {
    const cohorts = branchCohorts(action)
    const total = cohorts.reduce((sum, cohort) => sum + (cohort.percentage || 0), 0)
    return cohorts.map((cohort, index) => ({
        name: cohort.name || `Group ${index + 1}`,
        percent: total ? Math.round(((cohort.percentage || 0) / total) * 100) : 0,
    }))
}

function splitKey(conditions: BranchCondition[]): string | undefined {
    const keys = new Set(
        conditions.flatMap((condition) =>
            (condition.filters?.properties ?? []).flatMap((filter) => asText(asRecord(filter).key) ?? [])
        )
    )
    return keys.size === 1 ? humanKey([...keys][0]) : undefined
}

export function stepFacts(workflow: HogFlow, action: HogFlowAction, templateName?: string): StepFacts {
    const email = emailContent(action)
    if (email) {
        return {
            headline: email.subject,
            detail: email.preheader,
            fields: [
                ['Preview', email.preheader ?? 'None'],
                ['To', email.to],
                [
                    'Type',
                    action.type === 'function_email' && action.config.message_category_type === 'transactional'
                        ? 'Transactional'
                        : 'Marketing',
                ],
            ],
        }
    }
    switch (action.type) {
        case 'trigger':
            return triggerFacts(action, templateName)
        case 'conditional_branch': {
            const conditions = branchConditions(action)
            const names = conditions.map((condition, index) => condition.name || `Condition ${index + 1}`)
            const key = splitKey(conditions)
            return {
                headline: key ? `Split by ${key}` : 'Split by condition',
                detail: names.length ? `${names.join(', ')}, or no match` : 'No conditions yet',
                fields: [
                    ...conditions.map((condition, index): [string, string] => [
                        names[index],
                        conditionText(condition.filters),
                    ]),
                    ['No match', 'Everyone else'],
                ],
            }
        }
        case 'random_cohort_branch': {
            const shares = cohortShares(action)
            return {
                headline: 'Random split',
                detail: shares.map(({ percent }) => `${percent}%`).join(' / ') || undefined,
                fields: shares.map(({ name, percent }): [string, string] => [name, `${percent}% of people`]),
            }
        }
        case 'delay': {
            if (action.config.delay_until) {
                return {
                    headline: 'Wait until a date',
                    detail: action.config.delay_until.expression,
                    fields: [['Waits until', action.config.delay_until.expression]],
                }
            }
            const wait = humanDuration(action.config.delay_duration) || 'Not set'
            return { headline: `Wait ${wait}`, detail: 'Then continue', fields: [['Wait', wait]] }
        }
        case 'wait_until_time_window': {
            const { day, time } = timeWindowText(action.config)
            const timezone = action.config.use_person_timezone
                ? "the person's time zone"
                : (action.config.timezone ?? 'UTC')
            return {
                headline: `Next ${day}, ${time}`,
                detail: `Holds people until then (${timezone})`,
                fields: [
                    ['Day', day],
                    ['Time', time],
                    ['Time zone', timezone],
                ],
            }
        }
        case 'wait_until_condition': {
            const giveUp = humanDuration(action.config.max_wait_duration)
            return {
                headline: `Wait for ${waitConditionName(action) ?? 'a condition'}`,
                detail: `Gives up after ${giveUp}`,
                fields: [
                    ['Waits for', conditionText(action.config.condition.filters)],
                    ['Gives up', `After ${giveUp}`],
                ],
            }
        }
        case 'exit':
            return {
                headline: action.config.reason || 'End of workflow',
                detail: exitRuleText(workflow),
                fields: [
                    ['Ends when', action.config.reason || 'The path runs out'],
                    ['Also ends', exitRuleText(workflow).replace(/^People also leave early when /, 'When ')],
                ],
            }
        default:
            return (
                functionFacts(action, templateName) ?? {
                    headline: action.name,
                    detail: action.description || undefined,
                    fields: [['Runs', action.name]],
                }
            )
    }
}

const shortTime = (time: string): string => (time.endsWith(':00') ? time.slice(0, -3) : time)

export const waitConditionName = (action: ActionOf<'wait_until_condition'>): string | undefined =>
    action.config.condition.name?.trim() || undefined

const TRIGGER_SOURCES: Record<string, string> = {
    event: 'Event',
    'internal-event': 'Event',
    webhook: 'Webhook',
    manual: 'Manual',
    tracking_pixel: 'Pixel',
    schedule: 'Schedule',
    batch: 'Audience',
    'data-warehouse-table': 'Warehouse',
    'data-warehouse-view': 'Warehouse',
}

export function stepBadge(workflow: FlowGraph, action: HogFlowAction): string | undefined {
    switch (action.type) {
        case 'trigger':
            return TRIGGER_SOURCES[action.config.type]
        case 'delay':
            return action.config.delay_until ? 'Date' : action.config.delay_duration
        case 'wait_until_condition':
            return `≤ ${action.config.max_wait_duration}`
        case 'wait_until_time_window':
            return action.config.time === 'any'
                ? undefined
                : `${shortTime(action.config.time[0])}-${shortTime(action.config.time[1])}`
        case 'conditional_branch':
        case 'random_cohort_branch':
            return `${outgoingEdges(workflow, action.id).length} paths`
        case 'function': {
            if (action.config.template_id === 'template-webhook') {
                return asText(inputValue(action, 'method')) ?? 'POST'
            }
            const tools = action.config.template_id === 'template-posthog-create-task' ? aiToolCount(action) : 0
            return tools ? `${tools} ${tools === 1 ? 'tool' : 'tools'}` : undefined
        }
        default:
            return undefined
    }
}

export function stepPreviewKind(action: HogFlowAction): StepPreviewKind {
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
            break
    }
    switch (templateIdOf(action)) {
        case 'template-email':
            return 'email'
        case 'template-slack':
            return 'slack'
        case 'template-webhook':
            return 'webhook'
        case 'template-posthog-create-task':
        case 'template-posthog-run-scout':
            return 'ai'
        case 'template-posthog-send-ticket-message':
        case 'template-posthog-update-ticket':
            return 'ticket'
        case 'template-posthog-update-person-properties':
            return 'person'
        default:
            return 'fields'
    }
}

const SUMMARY_LENGTH = 3

/** The steps after a split inside the path run on only some of its people, so the summary stops at the split. */
function summarizedSteps(actions: HogFlowAction[]): HogFlowAction[] {
    const split = actions.findIndex(isBranchingAction)
    return actions.slice(0, split === -1 ? SUMMARY_LENGTH : Math.min(split + 1, SUMMARY_LENGTH))
}

export function pathSummary(
    workflow: HogFlow,
    group: PathGroup,
    templateNameOf?: (id: string) => string | undefined
): string {
    return summarizedSteps(pathActions(workflow, group))
        .map((action) => {
            const templateId = templateIdOf(action)
            return stepFacts(workflow, action, templateId ? templateNameOf?.(templateId) : undefined).headline
        })
        .join(', then ')
}
