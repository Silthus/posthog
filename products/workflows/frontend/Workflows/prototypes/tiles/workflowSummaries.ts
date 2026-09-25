// PROTOTYPE (throwaway): turns a workflow's trigger, graph and dispatch steps into short human summaries
// for the tiles variant. Pure functions, so the tile and the list view read the same words.
import { dayjs } from 'lib/dayjs'

import {
    NTH_LABELS,
    WEEKDAY_FULL_LABELS,
    getNthWeekdayOfMonth,
    isOneTimeSchedule,
    parseRRuleToState,
} from '../../hogflows/steps/components/rrule-helpers'
import type { HogFlowAction, HogFlowSchedule } from '../../hogflows/types'
import type { WorkflowChannel, WorkflowListItem } from '../shared/workflowListItems'

export type TriggerKind =
    | 'event'
    | 'schedule'
    | 'batch'
    | 'webhook'
    | 'manual'
    | 'tracking_pixel'
    | 'data-warehouse-table'
    | 'data-warehouse-view'
    | 'slack'
    | 'github'
    | 'internal-event'
    | 'unknown'

export interface TriggerSummary {
    kind: TriggerKind
    /** Short kind label, for example "Event" or "Schedule". */
    label: string
    /** The human part, for example "signed up, 1 filter" or "Mondays 07:00". */
    detail: string
}

interface TriggerFilters {
    events?: { id?: string; name?: string; properties?: unknown[] }[]
    actions?: { id?: string; name?: string; properties?: unknown[] }[]
    properties?: { key?: string; value?: unknown }[]
}

interface TriggerConfig {
    type?: string
    filters?: TriggerFilters
    table_name?: string
    inputs?: Record<string, { value?: unknown }>
}

function plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function prettyEventName(name: string): string {
    const known: Record<string, string> = { $pageview: 'Pageview', $identify: 'Identify', $autocapture: 'Autocapture' }
    return known[name] ?? name
}

function propertyValue(filters: TriggerFilters | undefined, key: string): string | null {
    const value = filters?.properties?.find((property) => property.key === key)?.value
    if (value == null) {
        return null
    }
    return Array.isArray(value) ? value.join(', ') : String(value)
}

export function describeTrigger(item: WorkflowListItem, schedule?: HogFlowSchedule | null): TriggerSummary {
    const trigger = ((item.workflow ?? item.template)?.trigger ?? {}) as TriggerConfig
    const filters = trigger.filters
    switch (trigger.type) {
        case 'event': {
            const events = filters?.events ?? []
            const names = events.map((event) => prettyEventName(String(event.name ?? event.id ?? '')))
            const filterCount =
                events.reduce((sum, event) => sum + (event.properties?.length ?? 0), 0) +
                (filters?.properties?.length ?? 0)
            const namesText =
                names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')
            return {
                kind: 'event',
                label: names.length > 1 ? 'Events' : 'Event',
                detail: [namesText || 'Any event', filterCount ? plural(filterCount, 'filter') : null]
                    .filter(Boolean)
                    .join(' · '),
            }
        }
        case 'schedule':
            return {
                kind: 'schedule',
                label: 'Schedule',
                detail: schedule === undefined ? 'Loading schedule…' : describeSchedule(schedule),
            }
        case 'batch': {
            const count = filters?.properties?.length ?? 0
            return {
                kind: 'batch',
                label: 'Batch',
                detail: count ? `People matching ${plural(count, 'filter')}` : 'Everyone',
            }
        }
        case 'webhook':
            return { kind: 'webhook', label: 'Webhook', detail: 'Incoming HTTP request' }
        case 'manual':
            return { kind: 'manual', label: 'Manual', detail: 'Started by hand or by API' }
        case 'tracking_pixel':
            return { kind: 'tracking_pixel', label: 'Tracking pixel', detail: 'Pixel loaded in an email or page' }
        case 'data-warehouse-table':
            return {
                kind: 'data-warehouse-table',
                label: 'Table',
                detail: `New rows in ${trigger.table_name ?? 'a table'}`,
            }
        case 'data-warehouse-view':
            return { kind: 'data-warehouse-view', label: 'View', detail: `Rows in ${trigger.table_name ?? 'a view'}` }
        case 'internal-event': {
            const eventName = filters?.events?.[0]?.id ?? ''
            if (eventName.includes('slack')) {
                const channel = propertyValue(filters, 'channel')
                return { kind: 'slack', label: 'Slack', detail: channel ? `Message in ${channel}` : 'New message' }
            }
            if (eventName.includes('github')) {
                const repo = propertyValue(filters, 'repository')
                const eventType = propertyValue(filters, 'event_type')?.replace(/_/g, ' ')
                return {
                    kind: 'github',
                    label: 'GitHub',
                    detail: [eventType ?? 'Any event', repo ? `on ${repo}` : null].filter(Boolean).join(' '),
                }
            }
            return { kind: 'internal-event', label: 'Internal event', detail: eventName || 'PostHog event' }
        }
        default:
            return { kind: 'unknown', label: 'Trigger', detail: trigger.type ?? 'Not set' }
    }
}

export function describeSchedule(schedule: HogFlowSchedule | null): string {
    if (!schedule?.rrule) {
        return 'No schedule set'
    }
    const tz = schedule.timezone || 'UTC'
    const start = dayjs(schedule.starts_at).tz(tz)
    const time = start.format('HH:mm')
    if (isOneTimeSchedule(schedule.rrule)) {
        return `Once, ${start.format('MMM D')} ${time}`
    }
    const state = parseRRuleToState(schedule.rrule)
    const every = state.interval > 1 ? `Every ${state.interval} ` : ''
    let text: string
    switch (state.frequency) {
        case 'daily':
            text = every ? `${every}days` : 'Daily'
            break
        case 'weekly': {
            const days = [...state.weekdays].sort()
            if (days.join() === '0,1,2,3,4') {
                text = 'Weekdays'
            } else if (days.length === 1) {
                text = `${every ? `${every}weeks, ` : ''}${WEEKDAY_FULL_LABELS[days[0]]}s`
            } else {
                text = `${every ? `${every}weeks, ` : 'Weekly, '}${days.map((d) => WEEKDAY_FULL_LABELS[d].slice(0, 3)).join(', ')}`
            }
            break
        }
        case 'monthly': {
            const base = every ? `${every}months` : 'Monthly'
            if (state.monthlyMode === 'last_day') {
                text = `${base} on the last day`
            } else if (state.monthlyMode === 'nth_weekday') {
                const { n, weekday } = getNthWeekdayOfMonth(start)
                text = `${base} on the ${NTH_LABELS[n - 1]} ${WEEKDAY_FULL_LABELS[weekday]}`
            } else {
                text = `${base} on the ${start.format('Do')}`
            }
            break
        }
        default:
            text = every ? `${every}years` : 'Yearly'
    }
    const paused = schedule.status === 'paused' ? ' (paused)' : ''
    return `${text} ${time}${paused}`
}

export interface FlowStep {
    action: HogFlowAction
    /** Branch or split steps have more than one way out. */
    branches: number
}

/** Steps in walking order from the trigger along the main path, skipping the trigger and exit nodes. */
export function orderedSteps(item: WorkflowListItem): FlowStep[] {
    const source = item.workflow ?? item.template
    const actions = item.actions
    const edges = ((source as { edges?: { from: string; to: string; type: string }[] } | null)?.edges ?? []) as {
        from: string
        to: string
        type: string
    }[]
    const byId = new Map(actions.map((action) => [action.id, action]))
    const outgoing = new Map<string, { to: string; type: string }[]>()
    for (const edge of edges) {
        outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
    }
    const start = actions.find((action) => action.type === 'trigger')
    const seen = new Set<string>()
    const result: FlowStep[] = []
    // Breadth-first so both sides of a branch show up, in a stable order.
    const queue: string[] = start ? [start.id] : []
    while (queue.length) {
        const id = queue.shift()!
        if (seen.has(id)) {
            continue
        }
        seen.add(id)
        const action = byId.get(id)
        const next = (outgoing.get(id) ?? []).sort((a, b) =>
            a.type === 'continue' ? -1 : b.type === 'continue' ? 1 : 0
        )
        if (action && action.type !== 'trigger' && action.type !== 'exit') {
            result.push({ action, branches: next.length })
        }
        queue.push(...next.map((edge) => edge.to))
    }
    // Anything not reachable from the trigger still counts, so the step total matches the editor.
    for (const action of actions) {
        if (!seen.has(action.id) && action.type !== 'trigger' && action.type !== 'exit') {
            result.push({ action, branches: 0 })
        }
    }
    return result
}

export interface FlowShape {
    steps: number
    waits: number
    branches: number
    dispatches: number
}

const WAIT_TYPES = ['delay', 'wait_until_time_window', 'wait_until_condition']
const BRANCH_TYPES = ['conditional_branch', 'random_cohort_branch']

export function describeFlow(steps: FlowStep[]): FlowShape {
    return {
        steps: steps.length,
        waits: steps.filter((step) => WAIT_TYPES.includes(step.action.type)).length,
        branches: steps.filter((step) => BRANCH_TYPES.includes(step.action.type)).length,
        dispatches: steps.filter((step) => step.action.type.startsWith('function')).length,
    }
}

export interface DispatchDetail {
    actionId: string
    channel: WorkflowChannel
    /** The line a person recognizes: a subject, a channel name, a host. */
    primary: string
    /** Supporting line: the from-address, the number, the method. */
    secondary: string | null
}

function inputValue(action: HogFlowAction, key: string): unknown {
    const inputs = (action.config as { inputs?: Record<string, { value?: unknown }> }).inputs
    return inputs?.[key]?.value
}

function hostOf(url: string): string {
    try {
        return new URL(url).host
    } catch {
        return url
    }
}

export function describeDispatches(item: WorkflowListItem, steps: FlowStep[]): DispatchDetail[] {
    const emailById = new Map(item.emailSteps.map((step) => [step.actionId, step]))
    const result: DispatchDetail[] = []
    for (const { action } of steps) {
        switch (action.type) {
            case 'function_email': {
                const email = emailById.get(action.id)
                result.push({
                    actionId: action.id,
                    channel: 'email',
                    primary: email?.subject || action.name,
                    secondary: email?.fromAddress ? `from ${email.fromAddress}` : 'No sender set',
                })
                break
            }
            case 'function_sms': {
                const message = String(inputValue(action, 'message') ?? '')
                result.push({
                    actionId: action.id,
                    channel: 'sms',
                    primary: message ? message.replace(/\{\{[^}]*\}\}/g, '…') : action.name,
                    secondary: inputValue(action, 'from_number') ? `from ${inputValue(action, 'from_number')}` : null,
                })
                break
            }
            case 'function_push':
                result.push({
                    actionId: action.id,
                    channel: 'push',
                    primary: String(inputValue(action, 'title') ?? action.name),
                    secondary: 'Push notification',
                })
                break
            case 'function': {
                const templateId = (action.config as { template_id?: string }).template_id
                if (templateId === 'template-slack') {
                    const channel = String(inputValue(action, 'channel') ?? '')
                    result.push({
                        actionId: action.id,
                        channel: 'slack',
                        primary: channel.includes('|') ? channel.split('|')[1] : channel || 'Slack',
                        secondary: 'Slack message',
                    })
                } else if (templateId === 'template-webhook') {
                    const url = String(inputValue(action, 'url') ?? '')
                    result.push({
                        actionId: action.id,
                        channel: 'webhook',
                        primary: url ? hostOf(url) : 'Webhook',
                        secondary: `${String(inputValue(action, 'method') ?? 'POST')} request`,
                    })
                }
                break
            }
        }
    }
    return result
}
