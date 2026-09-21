// Structural validation, run before push. It mirrors validate_graph in
// products/workflows/backend/api/graph_validation.py plus the duration rule from the
// DRF serializer. Everything else (templates, filters, permissions) is the API's job.

import { WorkflowError } from './errors'
import type { WorkflowErrorDetail } from './errors'
import type { Action, WorkflowDefinition } from './types'

const DURATION = /^\d*\.?\d+[dhm]$/

export interface ValidationResult {
    readonly errors: readonly WorkflowErrorDetail[]
    /** Non-fatal: the API accepts these, but they are usually a mistake. */
    readonly warnings: readonly string[]
}

function branchSlots(action: Action): number {
    return action.type === 'conditional_branch' ? action.config.conditions.length : 0
}

export function validate(definition: WorkflowDefinition): ValidationResult {
    const errors: WorkflowErrorDetail[] = []
    const warnings: string[] = []
    const byId = new Map<string, Action>()

    for (const action of definition.actions) {
        if (byId.has(action.id)) {
            errors.push({
                status: 'invalid_definition',
                message: `Duplicate action id "${action.id}".`,
                why: 'Edges reference actions by id, so two actions sharing one id make every edge into it ambiguous.',
                fix: `Give one of the two steps named "${action.id}" a different id.`,
            })
        }
        byId.set(action.id, action)
    }

    const triggers = definition.actions.filter((action) => action.type === 'trigger')
    if (triggers.length !== 1) {
        errors.push({
            status: 'invalid_definition',
            message: `A workflow needs exactly one trigger, this one has ${triggers.length}.`,
            why: 'The runtime enters a workflow through its single trigger node.',
            fix: 'Call .on(onEvent({ event })) exactly once when building the workflow.',
        })
    }

    for (const action of definition.actions) {
        if (action.type !== 'delay') {
            continue
        }
        if (!DURATION.test(action.config.delay_duration)) {
            errors.push({
                status: 'invalid_definition',
                message: `Step "${action.name}" has delay "${action.config.delay_duration}", which is not a duration.`,
                why: 'The API accepts a number plus one of m, h or d, matching ^\\d*\\.?\\d+[dhm]$. Seconds and ISO-8601 are rejected.',
                fix: 'Write the delay as a number plus m, h or d, for example "30m", "1.5h" or "1d".',
            })
        }
    }

    const outgoing = new Set<string>()
    const seenBranch = new Set<string>()
    for (const edge of definition.edges) {
        outgoing.add(edge.from)
        const source = byId.get(edge.from)
        if (!source) {
            errors.push({
                status: 'invalid_definition',
                message: `An edge starts at "${edge.from}", which is not a step in this workflow.`,
                why: 'Every edge endpoint has to resolve to an action id.',
                fix: `Remove that edge, or add the step "${edge.from}".`,
            })
        }
        if (!byId.has(edge.to)) {
            errors.push({
                status: 'invalid_definition',
                message: `An edge points at "${edge.to}", which is not a step in this workflow.`,
                why: 'Every edge endpoint has to resolve to an action id.',
                fix: `Remove that edge, or add the step "${edge.to}".`,
            })
        }

        if (edge.type !== 'branch' || !source) {
            continue
        }
        const slots = branchSlots(source)
        if (slots === 0) {
            errors.push({
                status: 'invalid_definition',
                message: `Step "${source.name}" is a ${source.type} step and cannot have branch edges.`,
                why: 'Only a conditional branch fans out through branch edges.',
                fix: `Change that edge to type "continue", or make "${source.name}" a branch step.`,
            })
        } else if (edge.index < 0 || edge.index >= slots) {
            errors.push({
                status: 'invalid_definition',
                message: `Branch edge ${edge.index} out of step "${source.name}" has no matching condition.`,
                why: `That step has ${slots} condition(s), so the only valid branch indexes are 0 to ${slots - 1}.`,
                fix: `Add a condition at index ${edge.index} on "${source.name}", or point the edge at an index that exists.`,
            })
        } else if (seenBranch.has(`${edge.from}:${edge.index}`)) {
            errors.push({
                status: 'invalid_definition',
                message: `Step "${source.name}" has two branch edges at index ${edge.index}.`,
                why: 'One condition leads to one next step, so a second edge on the same index is unreachable.',
                fix: `Delete one of the two edges from "${source.name}" at index ${edge.index}.`,
            })
        }
        seenBranch.add(`${edge.from}:${edge.index}`)
    }

    for (const action of definition.actions) {
        if (action.type !== 'exit' && !outgoing.has(action.id)) {
            errors.push({
                status: 'invalid_definition',
                message: `Step "${action.name}" has no next step.`,
                why: 'A run that reaches a step with no outgoing edge fails with "No next action found".',
                fix: `Add a step after "${action.name}", or end that path with .exit().`,
            })
        }
    }

    const reachable = new Set<string>(triggers.map((trigger) => trigger.id))
    const queue = [...reachable]
    while (queue.length > 0) {
        const current = queue.shift()!
        for (const edge of definition.edges) {
            if (edge.from === current && !reachable.has(edge.to)) {
                reachable.add(edge.to)
                queue.push(edge.to)
            }
        }
    }
    for (const action of definition.actions) {
        if (!reachable.has(action.id)) {
            warnings.push(`Step "${action.name}" is never reached from the trigger.`)
        }
    }

    return { errors, warnings }
}

/** Throws the first structural problem. push() calls this before it opens a socket. */
export function assertValid(definition: WorkflowDefinition): readonly string[] {
    const result = validate(definition)
    if (result.errors.length > 0) {
        throw new WorkflowError(result.errors[0]!)
    }
    return result.warnings
}
