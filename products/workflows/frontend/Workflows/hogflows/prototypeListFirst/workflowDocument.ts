import {
    isBranchingAction,
    type WorkflowTreeBranch,
    type WorkflowTreeNode,
    type WorkflowTreeSequence,
} from '../tree/workflowTree'
// PROTOTYPE (throwaway, never merges): turns a hogflow into the sentences the list-first editor reads out.
import type { HogFlow, HogFlowAction } from '../types'

export interface TimeRange {
    minHours: number
    maxHours: number
}

const UNIT_HOURS: Record<string, number> = { s: 1 / 3600, m: 1 / 60, h: 1, d: 24 }
const UNIT_WORDS: Record<string, [string, string]> = {
    s: ['second', 'seconds'],
    m: ['minute', 'minutes'],
    h: ['hour', 'hours'],
    d: ['day', 'days'],
}

export function parseDurationHours(duration: string | undefined): number {
    const match = /^(\d+(?:\.\d+)?)([smhd])$/.exec(duration ?? '')
    return match ? parseFloat(match[1]) * UNIT_HOURS[match[2]] : 0
}

export function durationInWords(duration: string | undefined): string {
    const match = /^(\d+(?:\.\d+)?)([smhd])$/.exec(duration ?? '')
    if (!match) {
        return 'an unset time'
    }
    const amount = parseFloat(match[1])
    const [one, many] = UNIT_WORDS[match[2]]
    return `${amount} ${amount === 1 ? one : many}`
}

export function addTime(range: TimeRange, action: HogFlowAction, takesTimeoutPath: boolean): TimeRange {
    switch (action.type) {
        case 'delay': {
            const hours = parseDurationHours(action.config.delay_duration)
            return { minHours: range.minHours + hours, maxHours: range.maxHours + hours }
        }
        case 'wait_until_time_window':
            return { minHours: range.minHours, maxHours: range.maxHours + 24 }
        case 'wait_until_condition': {
            const hours = parseDurationHours(action.config.max_wait_duration)
            return takesTimeoutPath
                ? { minHours: range.minHours + hours, maxHours: range.maxHours + hours }
                : { minHours: range.minHours, maxHours: range.maxHours + hours }
        }
        default:
            return range
    }
}

export function formatWhen(range: TimeRange): string {
    const minDay = Math.floor(range.minHours / 24)
    const maxDay = Math.floor(range.maxHours / 24)
    if (range.maxHours < 1 && range.minHours < 1) {
        return 'Right away'
    }
    if (minDay === maxDay) {
        return range.minHours < 24 && range.minHours >= 1 ? `Hour ${Math.round(range.minHours)}` : `Day ${minDay}`
    }
    return `Day ${minDay}–${maxDay}`
}

export function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

export interface EmailContent {
    subject: string
    preheader: string
    glimpse: string
    cta: string | null
    html: string
    to: string
}

export function getEmailContent(action: HogFlowAction): EmailContent | null {
    if (action.type !== 'function_email') {
        return null
    }
    const value = (action.config.inputs as any)?.email?.value ?? {}
    const html: string = value.html ?? ''
    const ctaMatch = /<a [^>]*>([^<]+)<\/a>/.exec(html)
    const text: string = value.text ? stripHtml(value.text) : stripHtml(html)
    return {
        subject: value.subject || '(no subject)',
        preheader: value.preheader || '',
        glimpse: text.length > 180 ? `${text.slice(0, 177)}…` : text,
        cta: ctaMatch ? ctaMatch[1] : null,
        html,
        to: value.to?.email?.includes('person.properties.email') ? "the person's email" : (value.to?.email ?? ''),
    }
}

export function describeTrigger(workflow: HogFlow, action: HogFlowAction): { lead: string; subject: string } {
    const trigger = workflow.trigger as any
    if (trigger?.type === 'event') {
        const events = trigger.filters?.events ?? []
        return {
            lead: 'Starts each time someone does',
            subject: events.map((e: any) => e.name ?? e.id).join(' or ') || 'any event',
        }
    }
    if (trigger?.type === 'batch') {
        return {
            lead: 'Sends once to everyone in the audience',
            subject: action.name.replace(/^Audience:\s*/i, ''),
        }
    }
    if (trigger?.type === 'schedule') {
        return { lead: 'Runs on a schedule:', subject: action.name }
    }
    return { lead: 'Starts with', subject: action.name }
}

export function describeTimeWindow(action: HogFlowAction): string {
    if (action.type !== 'wait_until_time_window') {
        return ''
    }
    const { day, time, timezone } = action.config as any
    const dayWords =
        day === 'weekday' ? 'weekday' : day === 'weekend' ? 'weekend day' : Array.isArray(day) ? day.join(', ') : 'day'
    const timeWords = Array.isArray(time) ? `${time[0]}–${time[1]}` : 'any time'
    return `the next ${dayWords}, ${timeWords} ${timezone ?? ''}`.trim()
}

export function describeWaitEvent(action: HogFlowAction): string {
    if (action.type !== 'wait_until_condition') {
        return ''
    }
    const condition = action.config.condition as any
    return condition?.name || condition?.filters?.events?.[0]?.name || 'a condition'
}

export function describeBranchCondition(workflow: HogFlow, node: WorkflowTreeNode, branch: WorkflowTreeBranch): string {
    const action = node.action
    if (branch.edge.type === 'continue') {
        if (action.type === 'wait_until_condition') {
            return `No ${describeWaitEvent(action)} within ${durationInWords(action.config.max_wait_duration)}`
        }
        if (action.type === 'random_cohort_branch') {
            return 'Leftover traffic'
        }
        const property = (action.config as any).conditions?.[0]?.filters?.properties?.[0]
        if (property) {
            return `${propertySubject(workflow, property)} is anything else`
        }
        return 'Anyone else'
    }
    if (action.type === 'wait_until_condition') {
        return `They do ${describeWaitEvent(action)}`
    }
    if (action.type === 'random_cohort_branch') {
        const cohort = action.config.cohorts?.[branch.edge.index ?? 0]
        return cohort ? `${cohort.percentage}% at random (${cohort.name})` : branch.label
    }
    if (action.type === 'conditional_branch') {
        const condition = action.config.conditions?.[branch.edge.index ?? 0] as any
        const property = condition?.filters?.properties?.[0]
        if (property) {
            const subject = propertySubject(workflow, property)
            const value = Array.isArray(property.value) ? property.value.join(' or ') : String(property.value)
            return `${subject} is “${value}”`
        }
        return condition?.name || branch.label
    }
    return branch.label
}

function propertySubject(workflow: HogFlow, property: any): string {
    if (property.type === 'workflow_variable') {
        return workflow.variables?.find((v) => v.key === property.key)?.label ?? property.key
    }
    return `${property.type === 'person' ? 'Person' : ''} ${property.key}`.trim()
}

export function describeSplit(workflow: HogFlow, action: HogFlowAction): string {
    if (action.type === 'random_cohort_branch') {
        return 'Split people at random'
    }
    if (action.type === 'conditional_branch') {
        const property = (action.config.conditions?.[0] as any)?.filters?.properties?.[0]
        if (property?.type === 'workflow_variable') {
            const variable = workflow.variables?.find((v) => v.key === property.key)
            return `Split by ${(variable?.label ?? property.key).toLowerCase()}`
        }
        if (property) {
            return `Split by person ${property.key}`
        }
    }
    return action.name
}

export function splitWarning(workflow: HogFlow, action: HogFlowAction): string | null {
    if (action.type !== 'conditional_branch') {
        return null
    }
    const property = (action.config.conditions?.[0] as any)?.filters?.properties?.[0]
    if (property?.type !== 'workflow_variable') {
        return null
    }
    const variable = workflow.variables?.find((v) => v.key === property.key)
    const setByStep = workflow.actions.some((a) =>
        JSON.stringify((a.config as any)?.output_variable ?? '').includes(property.key)
    )
    if (!variable?.default && !setByStep) {
        return `Nothing in this flow sets “${variable?.label ?? property.key}”, and it has no default. People only take these paths if it is set when they enter.`
    }
    return null
}

export function countSteps(sequence: WorkflowTreeSequence): number {
    return sequence.nodes.reduce(
        (total, node) => total + 1 + node.branches.reduce((sum, branch) => sum + countSteps(branch.sequence), 0),
        0
    )
}

export function collectEmails(sequence: WorkflowTreeSequence, into: HogFlowAction[] = []): HogFlowAction[] {
    for (const node of sequence.nodes) {
        if (node.action.type === 'function_email') {
            into.push(node.action)
        }
        node.branches.forEach((branch) => collectEmails(branch.sequence, into))
    }
    return into
}

export function countPaths(sequence: WorkflowTreeSequence): number {
    let paths = 1
    for (const node of sequence.nodes) {
        const nonEmpty = node.branches.filter((b) => b.sequence.nodes.length > 0)
        if (node.action.type === 'wait_until_condition' || nonEmpty.length === 0) {
            continue
        }
        paths += nonEmpty.reduce((sum, b) => sum + countPaths(b.sequence), 0) - 1
    }
    return paths
}

export interface Ending {
    text: string
    count: number
}

export function collectEndings(workflow: HogFlow, sequence: WorkflowTreeSequence): Ending[] {
    const endings = new Map<string, number>()
    const add = (text: string): void => {
        endings.set(text, (endings.get(text) ?? 0) + 1)
    }
    const walk = (seq: WorkflowTreeSequence, endsAtExit: boolean): void => {
        for (const node of seq.nodes) {
            const joinIsExit = node.joinAction?.type === 'exit' || (!node.joinAction && endsAtExit)
            for (const branch of node.branches) {
                if (branch.sequence.nodes.length === 0 && joinIsExit) {
                    const condition = describeBranchCondition(workflow, node, branch)
                    add(node.action.type === 'wait_until_condition' ? condition : `${condition}: leaves right away`)
                } else {
                    walk(branch.sequence, joinIsExit)
                }
            }
        }
        const last = seq.nodes.filter((n) => n.action.type !== 'exit').at(-1)
        if (last && endsAtExit && !isBranchingAction(last.action) && last.action.type !== 'exit') {
            add(last.action.type === 'function_email' ? 'After their last email' : `After “${last.action.name}”`)
        }
    }
    walk(sequence, true)
    return [...endings.entries()].map(([text, count]) => ({ text, count }))
}

export const EXIT_RULE_WORDS: Record<HogFlow['exit_condition'], string> = {
    exit_only_at_end: 'People leave only when they reach the end.',
    exit_on_conversion: 'People also leave as soon as they convert.',
    exit_on_trigger_not_matched: 'People also leave when they stop matching the trigger.',
    exit_on_trigger_not_matched_or_conversion: 'People also leave when they convert or stop matching the trigger.',
}
