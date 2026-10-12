// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
import type { HogFlow, HogFlowAction } from '../../types'

export type FlowEdge = HogFlow['edges'][number]

export const edgeKey = (edge: FlowEdge): string => `${edge.from}->${edge.to} ${edge.type} ${edge.index ?? ''}`.trim()
export const choiceKey = (edge: FlowEdge): string => `${edge.type}:${edge.index ?? ''}`

const DURATION_UNITS: Record<string, [string, string]> = {
    s: ['second', 'seconds'],
    m: ['minute', 'minutes'],
    h: ['hour', 'hours'],
    d: ['day', 'days'],
    w: ['week', 'weeks'],
}

export function humanDuration(raw: string | undefined | null): string {
    const match = /^(\d+)\s*([smhdw])$/.exec(raw ?? '')
    if (!match) {
        return raw ?? ''
    }
    const count = Number(match[1])
    const [one, many] = DURATION_UNITS[match[2]]
    return `${count} ${count === 1 ? one : many}`
}

export function outgoingEdges(workflow: HogFlow, actionId: string): FlowEdge[] {
    return workflow.edges
        .filter((edge) => edge.from === actionId)
        .sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'branch' ? -1 : 1
            }
            return (a.index ?? 0) - (b.index ?? 0)
        })
}

export function actionById(workflow: HogFlow): Record<string, HogFlowAction> {
    return Object.fromEntries(workflow.actions.map((action) => [action.id, action]))
}

type AnyConfig = Record<string, any>
const configOf = (action: HogFlowAction): AnyConfig => action.config as AnyConfig

export function edgeLabel(workflow: HogFlow, edge: FlowEdge): string | undefined {
    const source = actionById(workflow)[edge.from]
    if (!source || outgoingEdges(workflow, edge.from).length < 2) {
        return undefined
    }
    const config = configOf(source)
    switch (source.type) {
        case 'conditional_branch':
            return edge.type === 'continue'
                ? 'No match'
                : config.conditions?.[edge.index ?? 0]?.name || `Condition ${(edge.index ?? 0) + 1}`
        case 'random_cohort_branch': {
            const cohort = config.cohorts?.[edge.index ?? 0]
            return edge.type === 'continue'
                ? 'Rest'
                : `${cohort?.name ? `${cohort.name} · ` : ''}${cohort?.percentage}%`
        }
        case 'wait_until_condition': {
            const eventName = config.condition?.name || 'condition met'
            return edge.type === 'continue' ? `✗ none in ${humanDuration(config.max_wait_duration)}` : `✓ ${eventName}`
        }
        default:
            return edge.type === 'continue' ? 'Otherwise' : `Branch ${(edge.index ?? 0) + 1}`
    }
}

function propertyFilterText(filter: AnyConfig): string {
    const value = Array.isArray(filter.value) ? filter.value.join(' or ') : String(filter.value ?? '')
    const operator = filter.operator === 'exact' || !filter.operator ? 'is' : filter.operator.replace(/_/g, ' ')
    const owner = filter.type === 'workflow_variable' ? 'variable ' : filter.type === 'person' ? '' : ''
    return `${owner}${filter.key} ${operator} ${value}`
}

export function conditionText(filters: AnyConfig | undefined): string {
    const parts = [
        ...(filters?.events ?? []).map((event: AnyConfig) => `did ${event.name ?? event.id}`),
        ...(filters?.properties ?? []).map(propertyFilterText),
    ]
    return parts.length ? parts.join(' and ') : 'everyone'
}

export function exitRuleText(workflow: HogFlow): string {
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

export function emailContent(
    action: HogFlowAction
): { subject: string; preheader?: string; to: string; html?: string } | undefined {
    const config = configOf(action)
    if (config.template_id !== 'template-email') {
        return undefined
    }
    const email = config.inputs?.email?.value ?? {}
    const toEmail: string = email.to?.email ?? ''
    const to = /person\.properties\.email/.test(toEmail) ? "the person's email address" : toEmail || 'not set'
    return { subject: email.subject || 'No subject yet', preheader: email.preheader, to, html: email.html }
}

export function triggerText(workflow: HogFlow): string {
    const trigger = workflow.trigger as AnyConfig | undefined
    switch (trigger?.type) {
        case 'event':
            return `Starts when someone does ${(trigger.filters?.events ?? []).map((e: AnyConfig) => e.name ?? e.id).join(' or ') || 'an event'}`
        case 'batch':
            return 'Starts once for every person in the audience'
        case 'schedule':
            return 'Starts on a schedule'
        case 'manual':
            return 'Starts when someone runs it by hand'
        case 'webhook':
            return 'Starts when a webhook is called'
        default:
            return 'Starts on a trigger'
    }
}

/** One plain-language sentence per step, used by the person trace. */
export function stepSentence(workflow: HogFlow, action: HogFlowAction, templateName?: string): string {
    const config = configOf(action)
    switch (action.type) {
        case 'trigger':
            return triggerText(workflow)
        case 'delay':
            return `Waits ${humanDuration(config.delay_duration)}`
        case 'wait_until_time_window':
            return `Waits for a ${config.day === 'weekday' ? 'weekday' : (config.day ?? 'any day')} between ${config.time?.[0]} and ${config.time?.[1]} (${config.timezone ?? 'UTC'})`
        case 'wait_until_condition':
            return `Waits up to ${humanDuration(config.max_wait_duration)} for ${config.condition?.name ?? 'a condition'}`
        case 'conditional_branch':
            return action.name
        case 'random_cohort_branch':
            return 'Gets a random split'
        case 'exit':
            return `Leaves the workflow: ${config.reason || 'end of flow'}`
        default: {
            const email = emailContent(action)
            if (email) {
                return `Gets the email “${email.subject}”`
            }
            return `${templateName ?? action.name}`
        }
    }
}

// --- Groups (n8n-style named, collapsible regions for every branch path) ---

export type BranchGroup = {
    id: string
    branchNodeId: string
    edge: FlowEdge
    label: string
    condition: string
    memberIds: string[]
    parentId: string | null
    depth: number
}

function reachable(workflow: HogFlow, start: string): Set<string> {
    const seen = new Set<string>()
    const stack = [start]
    while (stack.length) {
        const id = stack.pop()!
        if (seen.has(id)) {
            continue
        }
        seen.add(id)
        workflow.edges.filter((edge) => edge.from === id).forEach((edge) => stack.push(edge.to))
    }
    return seen
}

export function computeGroups(workflow: HogFlow): BranchGroup[] {
    const groups: BranchGroup[] = []
    workflow.actions
        .filter((action) => action.type === 'conditional_branch' || action.type === 'random_cohort_branch')
        .forEach((action) => {
            const outgoing = outgoingEdges(workflow, action.id)
            const reach = outgoing.map((edge) => reachable(workflow, edge.to))
            const order: string[] = []
            const queue = [outgoing[0]?.to]
            const seen = new Set<string>()
            while (queue.length) {
                const id = queue.shift()
                if (!id || seen.has(id)) {
                    continue
                }
                seen.add(id)
                order.push(id)
                workflow.edges.filter((edge) => edge.from === id).forEach((edge) => queue.push(edge.to))
            }
            const join = order.find((id) => reach.every((set) => set.has(id)))
            const joinReach = join ? reachable(workflow, join) : new Set<string>()
            outgoing.forEach((edge, index) => {
                if (edge.to === join) {
                    return
                }
                const memberIds = [...reach[index]].filter((id) => !joinReach.has(id))
                if (!memberIds.length) {
                    return
                }
                const config = configOf(action)
                const condition =
                    action.type === 'conditional_branch' && edge.type === 'branch'
                        ? conditionText(config.conditions?.[edge.index ?? 0]?.filters)
                        : edge.type === 'continue'
                          ? 'no other path matched'
                          : `${config.cohorts?.[edge.index ?? 0]?.percentage}% at random`
                groups.push({
                    id: `group:${edgeKey(edge)}`,
                    branchNodeId: action.id,
                    edge,
                    label: edgeLabel(workflow, edge) ?? 'Path',
                    condition,
                    memberIds,
                    parentId: null,
                    depth: 0,
                })
            })
        })

    groups.forEach((group) => {
        const parents = groups.filter((other) => other !== group && other.memberIds.includes(group.branchNodeId))
        const parent = parents.sort((a, b) => a.memberIds.length - b.memberIds.length)[0]
        group.parentId = parent?.id ?? null
    })
    const depthOf = (group: BranchGroup): number => {
        const parent = groups.find((g) => g.id === group.parentId)
        return parent ? depthOf(parent) + 1 : 0
    }
    groups.forEach((group) => (group.depth = depthOf(group)))
    return groups
}

// --- Visible graph after collapsing groups ---

export type VisibleNode =
    | { kind: 'action'; id: string; action: HogFlowAction }
    | { kind: 'summary'; id: string; group: BranchGroup }

export type VisibleEdge = {
    id: string
    source: string
    target: string
    portIndex: number
    portCount: number
    label?: string
    original?: FlowEdge
    originalKeys: string[]
    timing?: { text: string; stepIds: string[] }
}

export function timingShort(action: HogFlowAction): string | undefined {
    const config = configOf(action)
    if (action.type === 'delay') {
        return `wait ${humanDuration(config.delay_duration)}`
    }
    if (action.type === 'wait_until_time_window') {
        const day = config.day === 'weekday' ? 'weekday' : (config.day ?? 'any day')
        return `next ${day} ${config.time?.[0]}–${config.time?.[1]} ${config.timezone ?? 'UTC'}`
    }
    return undefined
}

/** Delays and time windows are timing, not actions: draw them on the arrow instead of as a box. */
export function foldWaits(graph: { nodes: VisibleNode[]; edges: VisibleEdge[] }): {
    nodes: VisibleNode[]
    edges: VisibleEdge[]
} {
    let nodes = graph.nodes
    let edges = graph.edges
    for (;;) {
        const wait = nodes.find((node) => {
            if (node.kind !== 'action' || !timingShort(node.action)) {
                return false
            }
            return (
                edges.filter((e) => e.target === node.id).length === 1 &&
                edges.filter((e) => e.source === node.id).length === 1
            )
        })
        if (!wait || wait.kind !== 'action') {
            return { nodes, edges }
        }
        const incoming = edges.find((e) => e.target === wait.id)!
        const outgoing = edges.find((e) => e.source === wait.id)!
        const text = [incoming.timing?.text, timingShort(wait.action), outgoing.timing?.text]
            .filter(Boolean)
            .join(', then ')
        const merged: VisibleEdge = {
            ...incoming,
            id: `${incoming.id}~${outgoing.id}`,
            target: outgoing.target,
            originalKeys: [...incoming.originalKeys, ...outgoing.originalKeys],
            timing: {
                text,
                stepIds: [...(incoming.timing?.stepIds ?? []), wait.id, ...(outgoing.timing?.stepIds ?? [])],
            },
        }
        nodes = nodes.filter((node) => node.id !== wait.id)
        edges = [...edges.filter((e) => e !== incoming && e !== outgoing), merged]
    }
}

const withExitHint = (label: string | undefined, toExit: boolean): string | undefined =>
    label && toExit ? `${label} → Exit` : label

export function visibleGraph(
    workflow: HogFlow,
    groups: BranchGroup[],
    collapsed: Set<string>
): { nodes: VisibleNode[]; edges: VisibleEdge[] } {
    const byId = actionById(workflow)
    const outermostCollapsed = groups.filter((group) => {
        if (!collapsed.has(group.id)) {
            return false
        }
        let parent = groups.find((g) => g.id === group.parentId)
        while (parent) {
            if (collapsed.has(parent.id)) {
                return false
            }
            parent = groups.find((g) => g.id === parent!.parentId)
        }
        return true
    })
    const representative: Record<string, string> = {}
    outermostCollapsed.forEach((group) => group.memberIds.forEach((id) => (representative[id] = group.id)))
    const rep = (id: string): string => representative[id] ?? id

    const actionOrder = new Map(workflow.actions.map((action, index) => [action.id, index]))
    const orderOf = (node: VisibleNode): number =>
        node.kind === 'action'
            ? (actionOrder.get(node.id) ?? 0)
            : Math.min(...node.group.memberIds.map((id) => actionOrder.get(id) ?? 0))
    const nodes: VisibleNode[] = [
        ...workflow.actions
            .filter((action) => !representative[action.id])
            .map((action): VisibleNode => ({ kind: 'action', id: action.id, action })),
        ...outermostCollapsed.map((group): VisibleNode => ({ kind: 'summary', id: group.id, group })),
    ].sort((a, b) => orderOf(a) - orderOf(b))

    const merged = new Map<string, VisibleEdge>()
    workflow.edges.forEach((edge) => {
        const source = rep(edge.from)
        const target = rep(edge.to)
        if (source === target) {
            return
        }
        const sourceIsSummary = source !== edge.from
        const id = sourceIsSummary
            ? `${source}->${target}`
            : `${edgeKey(edge)}${target !== edge.to ? `=>${target}` : ''}`
        const existing = merged.get(id)
        if (existing) {
            existing.originalKeys.push(edgeKey(edge))
            existing.original = undefined
            return
        }
        merged.set(id, {
            id,
            source,
            target,
            portIndex: 0,
            portCount: 1,
            label: sourceIsSummary
                ? undefined
                : withExitHint(edgeLabel(workflow, edge), byId[edge.to]?.type === 'exit'),
            original: sourceIsSummary || target !== edge.to ? undefined : edge,
            originalKeys: [edgeKey(edge)],
        })
    })
    const edges = [...merged.values()]
    const bySource = new Map<string, VisibleEdge[]>()
    edges.forEach((edge) => bySource.set(edge.source, [...(bySource.get(edge.source) ?? []), edge]))
    bySource.forEach((list, sourceId) => {
        const order = byId[sourceId] ? outgoingEdges(workflow, sourceId).map(edgeKey) : []
        list.sort((a, b) => order.indexOf(a.originalKeys[0]) - order.indexOf(b.originalKeys[0]))
        list.forEach((edge, index) => {
            edge.portIndex = index
            edge.portCount = list.length
        })
    })
    return { nodes, edges }
}

// --- Person trace (Braze / Klaviyo style path preview) ---

export type TraceDecision = {
    nodeId: string
    question: string
    options: { key: string; label: string }[]
    chosen: string
}

export type Trace = { nodeIds: string[]; edgeKeys: Set<string>; decisions: TraceDecision[] }

export function computeTrace(workflow: HogFlow, choices: Record<string, string>): Trace {
    const byId = actionById(workflow)
    const start = workflow.actions.find((action) => action.type === 'trigger')
    const nodeIds: string[] = []
    const edgeKeys = new Set<string>()
    const decisions: TraceDecision[] = []
    let current = start?.id
    while (current && !nodeIds.includes(current)) {
        nodeIds.push(current)
        const outgoing = outgoingEdges(workflow, current)
        if (!outgoing.length) {
            break
        }
        let next = outgoing[0]
        if (outgoing.length > 1) {
            const action = byId[current]
            const fallback =
                action.type === 'wait_until_condition'
                    ? (outgoing.find((edge) => edge.type === 'continue') ?? outgoing[0])
                    : outgoing[0]
            next = outgoing.find((edge) => choiceKey(edge) === choices[current!]) ?? fallback
            decisions.push({
                nodeId: current,
                question:
                    action.type === 'wait_until_condition'
                        ? `${configOf(action).condition?.name ?? 'The event'} within ${humanDuration(configOf(action).max_wait_duration)}?`
                        : action.name,
                options: outgoing.map((edge) => ({
                    key: choiceKey(edge),
                    label:
                        action.type === 'wait_until_condition'
                            ? edge.type === 'continue'
                                ? 'No'
                                : 'Yes'
                            : (edgeLabel(workflow, edge) ?? choiceKey(edge)),
                })),
                chosen: choiceKey(next),
            })
        }
        edgeKeys.add(edgeKey(next))
        current = next.to
    }
    return { nodeIds, edgeKeys, decisions }
}

// --- Invented sample metrics (Iterable-style badges). Deterministic, clearly labelled as sample data. ---

function seeded(id: string): number {
    let hash = 0
    for (const char of id) {
        hash = (hash * 31 + char.charCodeAt(0)) | 0
    }
    return ((hash >>> 0) % 1000) / 1000
}

export type SampleMetrics = {
    enteredByNode: Record<string, number>
    peopleByEdge: Record<string, number>
    emailRates: Record<string, { opened: number; clicked: number }>
}

export function sampleMetrics(workflow: HogFlow): SampleMetrics {
    const enteredByNode: Record<string, number> = {}
    const peopleByEdge: Record<string, number> = {}
    const emailRates: SampleMetrics['emailRates'] = {}
    const incoming = new Map<string, number>()
    workflow.edges.forEach((edge) => incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1))
    const trigger = workflow.actions.find((action) => action.type === 'trigger')
    if (!trigger) {
        return { enteredByNode, peopleByEdge, emailRates }
    }
    enteredByNode[trigger.id] = 4800
    const ready = [trigger.id]
    const remaining = new Map(incoming)
    const byId = actionById(workflow)
    while (ready.length) {
        const id = ready.shift()!
        const people = enteredByNode[id] ?? 0
        const outgoing = outgoingEdges(workflow, id)
        const action = byId[id]
        const weights = outgoing.map((edge) => {
            if (action?.type === 'wait_until_condition') {
                return edge.type === 'continue' ? 0.8 : 0.2
            }
            if (outgoing.length > 1 && edge.type === 'continue') {
                return 0.04
            }
            return 0.7 + seeded(edgeKey(edge)) * 0.6
        })
        const total = weights.reduce((a, b) => a + b, 0) || 1
        outgoing.forEach((edge, index) => {
            const flow = Math.round((people * weights[index]) / total)
            peopleByEdge[edgeKey(edge)] = flow
            enteredByNode[edge.to] = (enteredByNode[edge.to] ?? 0) + flow
            remaining.set(edge.to, (remaining.get(edge.to) ?? 1) - 1)
            if ((remaining.get(edge.to) ?? 0) <= 0) {
                ready.push(edge.to)
            }
        })
        if (action && emailContent(action)) {
            emailRates[id] = { opened: 0.28 + seeded(id) * 0.24, clicked: 0.03 + seeded(`${id}c`) * 0.07 }
        }
    }
    return { enteredByNode, peopleByEdge, emailRates }
}

export function groupEmails(workflow: HogFlow, group: BranchGroup): { subject: string; count: number }[] {
    const byId = actionById(workflow)
    const counts = new Map<string, number>()
    group.memberIds.forEach((id) => {
        const email = byId[id] && emailContent(byId[id])
        if (email) {
            counts.set(email.subject, (counts.get(email.subject) ?? 0) + 1)
        }
    })
    return [...counts.entries()].map(([subject, count]) => ({ subject, count }))
}
