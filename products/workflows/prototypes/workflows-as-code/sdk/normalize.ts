// Change detection: reduce the workflow PostHog holds and the workflow the file
// describes to the same canonical shape, so a deep compare answers one question,
// "would a PATCH change anything", and nothing else.
//
// The reduction is a projection onto the fields a client may write, not a list of
// fields to strip. Every read-only field on HogFlowSerializer (`version`, `trigger`,
// `billable_action_types`, `action_redirects`, `abort_action`, `draft`,
// `draft_updated_at`, `schedules`, `user_access_level`, `created_at`, `updated_at`,
// `created_by`, and the compiled `bytecode` on filters) falls outside the projection
// and cannot reach the compare, including any read-only field added later.

import type { WorkflowDefinition } from './types'

/** The whole writable surface of the definition. Anything else is the server's. */
const WRITABLE_FIELDS = ['name', 'description', 'status', 'exit_condition', 'actions', 'edges'] as const

/**
 * Kept per action. `bytecode` is compiled server-side and never matches, and the
 * frontend-managed epoch-millisecond `created_at` / `updated_at` on an action are the
 * editor's bookkeeping rather than the file's, so neither side contributes them.
 */
const WRITABLE_ACTION_FIELDS = ['id', 'name', 'description', 'type', 'config', 'on_error'] as const

type Json = unknown

function isObject(value: Json): value is Record<string, Json> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Empty is absent. An action the file leaves plain comes back carrying `filters: null`
 * (HogFlowActionSerializer.filters has `default=None`) and `description: ""` (`default=""`),
 * and `on_error` is `allow_null`. Those are the same workflow.
 */
function isEmpty(value: Json): boolean {
    return value === null || value === undefined || value === ''
}

function canonicalize(value: Json): Json {
    if (Array.isArray(value)) {
        return value.map(canonicalize)
    }
    if (!isObject(value)) {
        return value
    }
    const result: Record<string, Json> = {}
    for (const key of Object.keys(value).sort()) {
        const entry = value[key]
        if (isEmpty(entry) || key === 'bytecode' || key === 'bytecode_error' || key === 'bytecode_version') {
            continue
        }
        result[key] = canonicalize(entry)
    }
    return result
}

function pick(source: Record<string, Json>, fields: readonly string[]): Record<string, Json> {
    const result: Record<string, Json> = {}
    for (const field of fields) {
        const value = source[field]
        if (value === undefined) {
            continue
        }
        result[field] = value
    }
    return result
}

function normalizeAction(action: Json): Json {
    return isObject(action) ? canonicalize(pick(action, WRITABLE_ACTION_FIELDS)) : canonicalize(action)
}

/** `index` is meaningless on a continue edge, so it never decides whether to write. */
function normalizeEdge(edge: Json): Json {
    if (!isObject(edge)) {
        return canonicalize(edge)
    }
    const fields = edge.type === 'continue' ? ['from', 'to', 'type'] : ['from', 'to', 'type', 'index']
    return canonicalize(pick(edge, fields))
}

function sortedBy(values: readonly Json[], key: (value: Json) => string): Json[] {
    return [...values].sort((left, right) => key(left).localeCompare(key(right)))
}

/**
 * The comparable form of a workflow, from either side of the wire. Order of actions and
 * edges is not content, so both are sorted: a graph that lists the same nodes and the same
 * edges is the same graph.
 */
export function normalizeWorkflow(value: WorkflowDefinition | Record<string, unknown>): string {
    const source = value as Record<string, Json>
    const projected = canonicalize(pick(source, WRITABLE_FIELDS)) as Record<string, Json>

    const actions = Array.isArray(source.actions) ? source.actions.map(normalizeAction) : []
    const edges = Array.isArray(source.edges) ? source.edges.map(normalizeEdge) : []

    projected.actions = sortedBy(actions, (action) => String(isObject(action) ? action.id : action))
    projected.edges = sortedBy(edges, (edge) => JSON.stringify(edge))

    return JSON.stringify(projected)
}

/** True when a PATCH would change nothing the client owns. */
export function sameWorkflow(
    local: WorkflowDefinition,
    remote: Record<string, unknown>
): boolean {
    return normalizeWorkflow(local) === normalizeWorkflow(remote)
}
