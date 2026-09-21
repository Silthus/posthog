// A change summary a reviewer reads in a pull request comment. It sits on top of the
// change detection the old prototype already had: normalizeWorkflow projects both sides
// onto the writable fields, and this walks the two projections to name what moved.
//
// Steps are keyed by name rather than by generated id, because an id is positional
// (`delay_1`) and inserting a step renames every id after it. A rename of one step should
// not read as a rewrite of the whole graph.

import { normalizeWorkflow, secretKeysOf } from '../sdk/normalize'
import type { WorkflowDefinition } from '../sdk/types'

export interface Change {
    readonly kind: 'added' | 'removed' | 'changed'
    /** `name`, `status`, or `step "Wait a day"`. */
    readonly what: string
    readonly before?: string
    readonly after?: string
}

export interface Diff {
    readonly changed: boolean
    readonly changes: readonly Change[]
    /** Secret inputs the diff deliberately did not look at. */
    readonly secretsIgnored: readonly string[]
}

const TOP_FIELDS = ['name', 'description', 'status', 'exit_condition'] as const

function projected(
    value: WorkflowDefinition | Record<string, unknown>,
    secretKeys: ReadonlySet<string>
): Record<string, unknown> {
    return JSON.parse(normalizeWorkflow(value, secretKeys)) as Record<string, unknown>
}

function stepsByName(projection: Record<string, unknown>): Map<string, unknown> {
    const steps = new Map<string, unknown>()
    for (const action of (projection.actions as { name?: string }[] | undefined) ?? []) {
        steps.set(action.name ?? '(unnamed)', action)
    }
    return steps
}

function short(value: unknown): string {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return text !== undefined && text.length > 70 ? `${text.slice(0, 67)}...` : String(text)
}

/** What a push would change. Empty changes means a push would write nothing. */
export function diffWorkflow(local: WorkflowDefinition, remote: Record<string, unknown>): Diff {
    const secretKeys = secretKeysOf(local)
    const mine = projected(local, secretKeys)
    const theirs = projected(remote, secretKeys)
    const changes: Change[] = []

    for (const field of TOP_FIELDS) {
        if (JSON.stringify(mine[field]) !== JSON.stringify(theirs[field])) {
            changes.push({ kind: 'changed', what: field, before: short(theirs[field]), after: short(mine[field]) })
        }
    }

    const mineSteps = stepsByName(mine)
    const theirSteps = stepsByName(theirs)
    for (const [name, step] of mineSteps) {
        const other = theirSteps.get(name)
        if (other === undefined) {
            changes.push({ kind: 'added', what: `step "${name}"` })
        } else if (JSON.stringify(step) !== JSON.stringify(other)) {
            changes.push({ kind: 'changed', what: `step "${name}"` })
        }
    }
    for (const name of theirSteps.keys()) {
        if (!mineSteps.has(name)) {
            changes.push({ kind: 'removed', what: `step "${name}"` })
        }
    }

    if (JSON.stringify(mine.edges) !== JSON.stringify(theirs.edges) && changes.length === 0) {
        changes.push({ kind: 'changed', what: 'the connections between steps' })
    }

    return {
        // The projection compare is the authority on whether a push writes. The change list
        // is a description of it, so it never decides.
        changed: normalizeWorkflow(local, secretKeys) !== normalizeWorkflow(remote, secretKeys),
        changes,
        secretsIgnored: [...secretKeys],
    }
}
