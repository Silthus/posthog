// PROTOTYPE (rethink lane, Silthus/personal#36). Throwaway: derives a plain-language story from a hogflow graph.
import type { HogFlow, HogFlowAction } from '../hogflows/types'

type Edge = HogFlow['edges'][number]
type AnyConfig = Record<string, any>

export type EmailContent = { subject: string; preheader: string; html: string }

export type Moment =
    | {
          kind: 'email'
          action: HogFlowAction
          email: EmailContent
          when: string
          offsetHours: number
          condition: string | null
      }
    | { kind: 'action'; action: HogFlowAction; when: string; offsetHours: number }
    | {
          kind: 'wait_for'
          action: HogFlowAction
          eventName: string
          maxWait: string
          endsIfHappens: boolean
          happensTargetName: string | null
      }

export type AudiencePath = {
    id: string
    title: string
    rules: string[]
    groupKey: string
    moments: Moment[]
    endNote: string
    share: string | null
}

export type WorkflowStory = {
    who: string
    whoDetail: string
    triggerKind: 'batch' | 'event' | 'other'
    splitBy: string[]
    paths: AudiencePath[]
    leaversWithoutEmail: string[]
    emailCountPerPerson: number
    uniqueEmails: number
    firstEmailWhen: string | null
    endings: string[]
    stepCount: number
    variables: { key: string; label: string }[]
    checks: string[]
}

const HOURS: Record<string, number> = { s: 1 / 3600, m: 1 / 60, h: 1, d: 24, w: 168 }

export function durationToHours(duration: string | undefined): number {
    const match = /^(\d+(?:\.\d+)?)([smhdw])$/.exec(duration ?? '')
    return match ? Number(match[1]) * HOURS[match[2]] : 0
}

export function humanDuration(duration: string | undefined): string {
    const match = /^(\d+(?:\.\d+)?)([smhdw])$/.exec(duration ?? '')
    if (!match) {
        return duration ?? ''
    }
    const n = Number(match[1])
    const unit = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week' }[match[2]]!
    return `${n} ${unit}${n === 1 ? '' : 's'}`
}

function hoursSpan(hours: number): string {
    if (hours < 24) {
        const n = Math.round(hours)
        return `${n} hour${n === 1 ? '' : 's'}`
    }
    const days = Math.round(hours / 24)
    return `${days} day${days === 1 ? '' : 's'}`
}

function describeWhen(offset: number, previousEmailOffset: number | null, window: string | null): string {
    if (previousEmailOffset !== null) {
        const later = `${hoursSpan(offset - previousEmailOffset)} later`
        return window ? `${capitalize(later)}, then next ${window}` : capitalize(later)
    }
    if (window) {
        return offset === 0 ? `Next ${window}` : `After ${hoursSpan(offset)}, then next ${window}`
    }
    return offset === 0 ? 'Right away' : `After ${hoursSpan(offset)}`
}

export function emailContent(action: HogFlowAction): EmailContent | null {
    if (action.type !== 'function_email') {
        return null
    }
    const value = (action.config as AnyConfig)?.inputs?.email?.value ?? {}
    return { subject: value.subject ?? '(no subject)', preheader: value.preheader ?? '', html: value.html ?? '' }
}

function windowNote(action: HogFlowAction): string {
    const config = action.config as AnyConfig
    const [from, to] = config.time ?? []
    const day = config.day === 'weekday' ? 'weekday' : config.day === 'weekend' ? 'weekend day' : 'day'
    return `${day} ${from}–${to} ${config.timezone ?? ''}`.trim()
}

function propertyRule(filters: AnyConfig | undefined, variables: HogFlow['variables']): string {
    const property = filters?.properties?.[0]
    if (!property) {
        return 'matches the filter'
    }
    const label =
        property.type === 'workflow_variable'
            ? (variables?.find((v) => v.key === property.key)?.label ?? property.key)
            : property.key
    const value = Array.isArray(property.value) ? property.value.join(' or ') : property.value
    return `${label} is ${value}`
}

function stripPrefix(name: string): string {
    const index = name.indexOf(':')
    return index > -1 ? name.slice(index + 1).trim() : name
}

function prefixOf(name: string | undefined): string | null {
    if (!name) {
        return null
    }
    const index = name.indexOf(':')
    return index > -1 ? name.slice(0, index).trim() : null
}

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1)
}

export function friendlyStepName(action: HogFlowAction): string {
    return capitalize(stripPrefix(action.name ?? action.type))
}

function triggerSummary(
    flow: HogFlow,
    triggerAction: HogFlowAction | undefined
): Pick<WorkflowStory, 'who' | 'whoDetail' | 'triggerKind'> {
    const trigger = flow.trigger as AnyConfig | undefined
    if (trigger?.type === 'batch') {
        return {
            who: `Everyone in the audience “${stripPrefix(triggerAction?.name ?? 'audience')}”`,
            whoDetail: 'One-off send. People enter once, when you run it.',
            triggerKind: 'batch',
        }
    }
    if (trigger?.type === 'event') {
        const eventName = trigger.filters?.events?.[0]?.name ?? 'the trigger event'
        return {
            who: `Everyone who does “${eventName}”`,
            whoDetail: 'Runs continuously once enabled. Each new event starts a run for that person.',
            triggerKind: 'event',
        }
    }
    return { who: triggerAction?.name ?? 'People who match the trigger', whoDetail: '', triggerKind: 'other' }
}

export function buildWorkflowStory(flow: HogFlow): WorkflowStory {
    const byId = new Map(flow.actions.map((a) => [a.id, a]))
    const outgoing = new Map<string, Edge[]>()
    flow.edges.forEach((edge) => outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]))
    const continueOf = (id: string): HogFlowAction | undefined => {
        const edge = outgoing.get(id)?.find((e) => e.type === 'continue')
        return edge ? byId.get(edge.to) : undefined
    }
    const branchTo = (id: string, index: number): HogFlowAction | undefined => {
        const edge = outgoing.get(id)?.find((e) => e.type === 'branch' && e.index === index)
        return edge ? byId.get(edge.to) : undefined
    }

    const triggerAction = flow.actions.find((a) => a.type === 'trigger')
    const paths: AudiencePath[] = []
    const leavers = new Set<string>()
    const splitBy = new Set<string>()
    const endings = new Set<string>()

    const walk = (
        start: HogFlowAction | undefined,
        rules: string[],
        titleParts: string[],
        shares: number[],
        moments: Moment[],
        offsetHours: number,
        pendingWindow: string | null
    ): void => {
        let current = start
        let offset = offsetHours
        let window = pendingWindow
        const collected = [...moments]
        const lastEmail = [...collected].reverse().find((m) => m.kind === 'email')
        let previousEmailOffset: number | null = lastEmail?.kind === 'email' ? lastEmail.offsetHours : null
        let condition: string | null = null
        while (current) {
            const config = current.config as AnyConfig
            if (current.type === 'exit') {
                const last = collected[collected.length - 1]
                const endNote =
                    collected.some((m) => m.kind === 'email') && last?.kind !== 'wait_for'
                        ? 'Ends after the last message'
                        : 'Ends'
                if (!collected.some((m) => m.kind === 'email' || m.kind === 'action')) {
                    leavers.add(rules[rules.length - 1] ?? 'no rule matched')
                    return
                }
                endings.add(endNote === 'Ends' ? 'when the path runs out' : 'after the last email')
                paths.push({
                    id: `path-${paths.length}`,
                    title: titleParts.length ? titleParts.join(' · ') : 'Everyone',
                    rules,
                    groupKey: titleParts[0] ?? 'Everyone',
                    moments: collected,
                    endNote,
                    share: shares.length ? `${Math.round(shares.reduce((a, b) => a * b, 1) * 100)}%` : null,
                })
                return
            }
            if (current.type === 'conditional_branch') {
                splitBy.add(friendlyStepName(current).replace(/^Route by /i, ''))
                const conditions: AnyConfig[] = config.conditions ?? []
                conditions.forEach((condition, index) => {
                    const target = branchTo(current!.id, index)
                    const rule = propertyRule(condition.filters, flow.variables)
                    const title = prefixOf(target?.name) ?? condition.name ?? rule
                    const lastTitle = title.split(' ').slice(titleParts.length).join(' ') || title
                    walk(
                        target,
                        [...rules, rule],
                        [...titleParts, capitalize(lastTitle)],
                        shares,
                        collected,
                        offset,
                        window
                    )
                })
                const elseTarget = continueOf(current.id)
                const elseRule = `no ${friendlyStepName(current).replace(/^Route by /i, '')} match`
                if (elseTarget?.type === 'exit') {
                    leavers.add(elseRule)
                } else {
                    walk(
                        elseTarget,
                        [...rules, elseRule],
                        [...titleParts, 'Everyone else'],
                        shares,
                        collected,
                        offset,
                        window
                    )
                }
                return
            }
            if (current.type === 'random_cohort_branch') {
                splitBy.add('a random split')
                const cohorts: AnyConfig[] = config.cohorts ?? []
                cohorts.forEach((cohort, index) => {
                    walk(
                        branchTo(current!.id, index),
                        [...rules, `${cohort.percentage}% at random`],
                        [...titleParts, cohort.name ?? `Group ${index + 1}`],
                        [...shares, (cohort.percentage ?? 0) / 100],
                        collected,
                        offset,
                        window
                    )
                })
                const rest = 100 - cohorts.reduce((sum, c) => sum + (c.percentage ?? 0), 0)
                if (rest > 0) {
                    walk(
                        continueOf(current.id),
                        [...rules, `${rest}% at random`],
                        [...titleParts, 'Remaining group'],
                        [...shares, rest / 100],
                        collected,
                        offset,
                        window
                    )
                }
                return
            }
            if (current.type === 'delay') {
                offset += durationToHours(config.delay_duration)
            } else if (current.type === 'wait_until_time_window') {
                window = windowNote(current)
            } else if (current.type === 'wait_until_condition') {
                const happens = branchTo(current.id, 0)
                const eventName = config.condition?.name ?? config.condition?.filters?.events?.[0]?.name ?? 'the event'
                collected.push({
                    kind: 'wait_for',
                    action: current,
                    eventName,
                    maxWait: config.max_wait_duration,
                    endsIfHappens: happens?.type === 'exit',
                    happensTargetName: happens && happens.type !== 'exit' ? friendlyStepName(happens) : null,
                })
                if (happens?.type === 'exit') {
                    endings.add(`if they do “${eventName}”`)
                }
                condition = `Only if no “${eventName}” within ${humanDuration(config.max_wait_duration)}`
                offset += durationToHours(config.max_wait_duration)
            } else if (current.type !== 'trigger') {
                const when = describeWhen(offset, previousEmailOffset, window)
                const email = emailContent(current)
                collected.push(
                    email
                        ? { kind: 'email', action: current, email, when, offsetHours: offset, condition }
                        : { kind: 'action', action: current, when, offsetHours: offset }
                )
                if (email) {
                    previousEmailOffset = offset
                    condition = null
                }
                window = null
            }
            current = continueOf(current.id)
        }
    }

    walk(triggerAction, [], [], [], [], 0, null)

    const emailsPerPath = paths.map((p) => p.moments.filter((m) => m.kind === 'email').length)
    const uniqueSubjects = new Set(
        paths.flatMap((p) => p.moments.flatMap((m) => (m.kind === 'email' ? [m.email.subject] : [])))
    )
    const firstEmail = paths.flatMap((p) => p.moments).find((m) => m.kind === 'email')

    return {
        ...triggerSummary(flow, triggerAction),
        splitBy: [...splitBy],
        paths,
        leaversWithoutEmail: [...leavers],
        emailCountPerPerson: Math.max(0, ...emailsPerPath),
        uniqueEmails: uniqueSubjects.size,
        firstEmailWhen: firstEmailSummary(paths, splitBy) ?? (firstEmail?.kind === 'email' ? firstEmail.when : null),
        endings: [...endings],
        stepCount: flow.actions.length,
        variables: (flow.variables ?? []).map((v) => ({ key: v.key, label: v.label ?? v.key })),
        checks: unsetVariableChecks(flow),
    }
}

function unsetVariableChecks(flow: HogFlow): string[] {
    const setKeys = new Set(
        flow.actions.flatMap((action) => {
            const output = (action as AnyConfig).output_variable
            return (Array.isArray(output) ? output : output ? [output] : []).map((o: AnyConfig) => o.key)
        })
    )
    const branchedOn = new Set(
        flow.actions.flatMap((action) =>
            action.type === 'conditional_branch'
                ? ((action.config as AnyConfig).conditions ?? []).flatMap((c: AnyConfig) =>
                      (c.filters?.properties ?? [])
                          .filter((p: AnyConfig) => p.type === 'workflow_variable')
                          .map((p: AnyConfig) => p.key)
                  )
                : []
        )
    )
    return [...branchedOn]
        .filter((key) => !setKeys.has(key))
        .map((key) => {
            const variable = flow.variables?.find((v) => v.key === key)
            const label = variable?.label ?? key
            const fallback = variable?.default === '' || variable?.default == null ? 'empty' : `“${variable.default}”`
            return `No step sets “${label}”, and it defaults to ${fallback}. Unless you set it when you run the send, everyone skips the emails and leaves.`
        })
}

function firstEmailSummary(paths: AudiencePath[], splitBy: Set<string>): string | null {
    const firsts = paths.flatMap((p) => {
        const email = p.moments.find((m) => m.kind === 'email')
        return email?.kind === 'email' ? [email] : []
    })
    if (new Set(firsts.map((m) => m.when)).size <= 1) {
        return null
    }
    const offsets = firsts.map((m) => m.offsetHours)
    const [min, max] = [Math.min(...offsets), Math.max(...offsets)]
    const range = min === max ? hoursSpan(min) : `${hoursSpan(min).split(' ')[0]}–${hoursSpan(max)}`
    const by = [...splitBy][0] ?? 'path'
    const windowPart = firsts[0].when.split(', then ')[1]
    return `${range} after they enter, depending on ${by}${windowPart ? `, then ${windowPart}` : ''}`
}
