// definition -> source. Spec map #28 frame item 9 asks whether a generator could
// still target the authoring shape. This one targets shape B, walks the graph from
// the trigger, and prints a source file that re-emits the same definition.

import { WorkflowError } from './errors'
import type { Action, Edge, EmailMessage, WorkflowDefinition } from './types'

interface Graph {
    readonly byId: ReadonlyMap<string, Action>
    readonly continues: ReadonlyMap<string, string>
    readonly branches: ReadonlyMap<string, readonly string[]>
}

function index(definition: WorkflowDefinition): Graph {
    const byId = new Map<string, Action>()
    for (const action of definition.actions) {
        byId.set(action.id, action)
    }
    const continues = new Map<string, string>()
    const branches = new Map<string, string[]>()
    for (const edge of definition.edges as readonly Edge[]) {
        if (edge.type === 'continue') {
            continues.set(edge.from, edge.to)
            continue
        }
        const seen = branches.get(edge.from) ?? []
        seen[edge.index] = edge.to
        branches.set(edge.from, seen)
    }
    return { byId, continues, branches }
}

function literal(value: unknown): string {
    return JSON.stringify(value)
}

function emailSource(action: Action & { type: 'function_email' }): string {
    const message = action.config.inputs.email.value as EmailMessage
    const parts = [
        `name: ${literal(action.name)}`,
        `to: ${literal(message.to.email)}`,
        `subject: ${literal(message.subject)}`,
        `text: ${literal(message.text)}`,
        `html: ${literal(message.html)}`,
    ]
    if (message.preheader !== undefined) {
        parts.push(`preheader: ${literal(message.preheader)}`)
    }
    if (message.from.integrationId !== undefined) {
        parts.push(`fromIntegrationId: ${message.from.integrationId}`)
    }
    return `email({ ${parts.join(', ')} })`
}

function unwrapInputs(inputs: Readonly<Record<string, { value: unknown }>>): Record<string, unknown> {
    const plain: Record<string, unknown> = {}
    for (const [key, wrapped] of Object.entries(inputs)) {
        // A read from the API returns `{"secret": true}` for a secret input, so a
        // generator that starts from a GET cannot recover the environment variable
        // name. It has to emit a placeholder for a person to fill in.
        plain[key] = wrapped.value
    }
    return plain
}

function stepSource(id: string, graph: Graph, indent: string): string {
    const action = graph.byId.get(id)
    if (!action) {
        throw new WorkflowError({
            status: 'invalid_definition',
            message: `Edge points at "${id}", which is not an action.`,
            why: 'The generator walks edges, so a dangling edge has nowhere to go.',
            fix: 'Fix the definition before generating source from it.',
        })
    }

    if (action.type === 'delay') {
        return `delay(${literal(action.config.delay_duration)}, { name: ${literal(action.name)} })`
    }
    if (action.type === 'function') {
        return `fn({ name: ${literal(action.name)}, templateId: ${literal(
            action.config.template_id
        )}, inputs: ${literal(unwrapInputs(action.config.inputs))} })`
    }
    if (action.type === 'function_email') {
        return emailSource(action)
    }
    if (action.type === 'conditional_branch') {
        const targets = graph.branches.get(id) ?? []
        const specs = action.config.conditions.map((condition, position) => {
            const entry = targets[position]
            if (entry === undefined) {
                throw new WorkflowError({
                    status: 'invalid_definition',
                    message: `Branch "${action.name}" has a condition at index ${position} with no branch edge.`,
                    why: 'The index on a branch edge is the only link between a condition and the path it runs.',
                    fix: `Add an edge {from: "${id}", type: "branch", index: ${position}}.`,
                })
            }
            const join = graph.continues.get(id)!
            const body = pathSource(entry, graph, join, `${indent}        `)
            return `${indent}        { name: ${literal(condition.name ?? '')}, when: ${literal(
                condition.filters.properties
            )} as Conditions, then: path(${body}) }`
        })
        return `branch({\n${indent}    name: ${literal(action.name)},\n${indent}    branches: [\n${specs.join(
            ',\n'
        )},\n${indent}    ],\n${indent}})`
    }
    throw new WorkflowError({
        status: 'unsupported_action',
        message: `The generator has no source form for action type "${action.type}".`,
        why: 'Only the v1 surface is covered.',
        fix: 'Extend the generator, or remove the action.',
    })
}

function pathSource(entry: string, graph: Graph, stop: string, indent: string): string {
    const parts: string[] = []
    let cursor: string | undefined = entry
    while (cursor !== undefined && cursor !== stop) {
        parts.push(stepSource(cursor, graph, indent))
        const action: Action = graph.byId.get(cursor)!
        cursor = action.type === 'exit' ? undefined : graph.continues.get(cursor)
    }
    return parts.join(', ')
}

/** Prints a shape B source file that re-emits `definition`. */
export function toSource(definition: WorkflowDefinition): string {
    const graph = index(definition)
    const trigger = definition.actions.find((action) => action.type === 'trigger')
    if (!trigger || trigger.type !== 'trigger') {
        throw new WorkflowError({
            status: 'invalid_definition',
            message: 'The definition has no trigger action.',
            why: 'A workflow has exactly one trigger node, and the generator starts its walk there.',
            fix: 'Add a trigger action before generating source.',
        })
    }
    const exit = definition.actions.find((action) => action.type === 'exit')
    const entry = graph.continues.get(trigger.id)!
    const spine = pathSource(entry, graph, exit?.id ?? '', '    ')
    const triggerSource =
        trigger.config.type === 'schedule'
            ? 'onSchedule()'
            : `onEvent({ event: ${literal(trigger.config.filters.events?.[0]?.id ?? '')} })`

    return `// Generated from a workflow definition by sdk/generate.ts. Throwaway prototype output.
import { branch, declarative, delay, email, fn, onEvent, onSchedule, path, type Conditions } from '../sdk'

export const onboarding = declarative({
    name: ${literal(definition.name)},
    description: ${literal(definition.description)},
    status: ${literal(definition.status)},
    exitCondition: ${literal(definition.exit_condition)},
    on: ${triggerSource},
    steps: path(${spine}),
    exit: { reason: ${literal((exit?.type === 'exit' && exit.config.reason) || '')} },
})
`
}
