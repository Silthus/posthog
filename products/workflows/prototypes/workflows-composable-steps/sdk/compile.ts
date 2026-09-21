// The one compiler. Every authoring shape hands it the same step values, so the
// emitted definition cannot depend on which shape the source used.
//
// Ids and edges are derived here and never written by an author, which is what
// keeps a branch index and the edge that carries it from drifting apart.

import { WorkflowError } from './errors'
import { isSecretRef, type Path, type Step } from './steps'
import type {
    Action,
    BranchCondition,
    Edge,
    ExitCondition,
    FunctionInputs,
    TriggerConfig,
    WorkflowDefinition,
    WorkflowStatus,
} from './types'

/**
 * How an action id is derived from a placement.
 *
 * `positional` counts per kind in placement order, as the first prototype did.
 * `slug` derives from the step name and adds a suffix for a second placement, so
 * an id survives an insertion earlier in the graph. Identity is issue #72's call;
 * both are here so the diff shows what the choice costs.
 */
export type IdStrategy = 'positional' | 'slug'

export interface EmitOptions {
    readonly name: string
    readonly description?: string
    readonly status?: WorkflowStatus
    readonly exitCondition?: ExitCondition
    readonly trigger: TriggerConfig
    readonly steps: Path
    readonly exit: { readonly reason: string }
    /** Defaults to `positional`. */
    readonly idStrategy?: IdStrategy
    /** An author-supplied id prefix per step value. Shape C fills this from its keys. */
    readonly idHints?: ReadonlyMap<Step, string>
    /** The deployer's environment. Defaults to `process.env`. */
    readonly env?: Readonly<Record<string, string | undefined>>
}

export interface EmitResult {
    readonly definition: WorkflowDefinition
    /** Every action id a given step value produced, in placement order. */
    readonly placements: ReadonlyMap<Step, readonly string[]>
}

class Ids {
    private readonly counts = new Map<string, number>()

    constructor(
        private readonly strategy: IdStrategy,
        private readonly hints: ReadonlyMap<Step, string>
    ) {}

    next(step: Step): string {
        const hint = this.hints.get(step)
        const prefix = hint ?? (this.strategy === 'positional' ? step.kind : slug(step.name))
        const seen = (this.counts.get(prefix) ?? 0) + 1
        this.counts.set(prefix, seen)
        if (hint !== undefined) {
            return seen === 1 ? prefix : `${prefix}_${seen}`
        }
        return this.strategy === 'positional' ? `${prefix}_${seen}` : seen === 1 ? prefix : `${prefix}_${seen}`
    }
}

function slug(name: string): string {
    const cleaned = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    return cleaned === '' ? 'step' : cleaned
}

/** Resolves a `secret('NAME')` reference, or fails naming the variable. */
function resolveInputs(
    step: Step & { kind: 'function' },
    env: Readonly<Record<string, string | undefined>>
): FunctionInputs {
    const resolved: Record<string, { value: unknown }> = {}
    for (const [key, raw] of Object.entries(step.inputs)) {
        if (!isSecretRef(raw)) {
            resolved[key] = { value: raw }
            continue
        }
        const value = env[raw.__secret]
        if (value === undefined || value === '') {
            throw new WorkflowError({
                status: 'missing_secret',
                message: `The environment variable ${raw.__secret} is not set.`,
                why: `Step "${step.name}" names it for the secret input "${key}", and a secret is always sent rather than recovered from the server, so push has nothing to send.`,
                fix: `Set ${raw.__secret} in the environment that runs push, then push again.`,
            })
        }
        resolved[key] = { value }
    }
    return resolved
}

interface Ctx {
    readonly ids: Ids
    readonly actions: Action[]
    readonly edges: Edge[]
    readonly placements: Map<Step, string[]>
    readonly env: Readonly<Record<string, string | undefined>>
}

/** Compiles a path and returns the id of its first node. */
function compilePath(steps: readonly Step[], continuation: string, ctx: Ctx): string {
    if (steps.length === 0) {
        return continuation
    }

    const stepIds = steps.map((step) => {
        const id = ctx.ids.next(step)
        const seen = ctx.placements.get(step)
        if (seen) {
            seen.push(id)
        } else {
            ctx.placements.set(step, [id])
        }
        return id
    })

    steps.forEach((step, position) => {
        const id = stepIds[position]!
        const next = stepIds[position + 1] ?? continuation

        if (step.kind === 'delay') {
            ctx.actions.push({ id, name: step.name, type: 'delay', config: { delay_duration: step.duration } })
            ctx.edges.push({ from: id, to: next, type: 'continue' })
            return
        }

        if (step.kind === 'function') {
            ctx.actions.push({
                id,
                name: step.name,
                type: 'function',
                config: { template_id: step.templateId, inputs: resolveInputs(step, ctx.env) },
            })
            ctx.edges.push({ from: id, to: next, type: 'continue' })
            return
        }

        if (step.kind === 'email') {
            ctx.actions.push({
                id,
                name: step.name,
                type: 'function_email',
                config: { template_id: 'template-email', inputs: { email: { value: step.email } } },
            })
            ctx.edges.push({ from: id, to: next, type: 'continue' })
            return
        }

        const conditions: BranchCondition[] = step.branches.map((spec) => ({
            name: spec.name,
            filters: { properties: [...spec.when] },
        }))
        ctx.actions.push({ id, name: step.name, type: 'conditional_branch', config: { conditions } })
        // The fall-through edge is the no-match path out of the branch.
        ctx.edges.push({ from: id, to: next, type: 'continue' })

        step.branches.forEach((spec, index) => {
            // Index and edge are produced together from the same array position, so they agree.
            const entry = compilePath(spec.then, next, ctx)
            ctx.edges.push({ from: id, to: entry, type: 'branch', index })
        })
    })

    return stepIds[0]!
}

export function emit(options: EmitOptions): EmitResult {
    const ctx: Ctx = {
        ids: new Ids(options.idStrategy ?? 'positional', options.idHints ?? new Map()),
        actions: [],
        edges: [],
        placements: new Map(),
        env: options.env ?? process.env,
    }

    const triggerId = 'trigger_node'
    const exitId = 'exit_node'
    const entry = compilePath(options.steps, exitId, ctx)

    ctx.actions.unshift({ id: triggerId, name: 'Trigger', type: 'trigger', config: options.trigger })
    ctx.edges.unshift({ from: triggerId, to: entry, type: 'continue' })
    ctx.actions.push({ id: exitId, name: 'Exit', type: 'exit', config: { reason: options.exit.reason } })

    return {
        definition: {
            name: options.name,
            description: options.description ?? '',
            status: options.status ?? 'draft',
            exit_condition: options.exitCondition ?? 'exit_only_at_end',
            actions: ctx.actions,
            edges: ctx.edges,
        },
        placements: ctx.placements,
    }
}

/** An event trigger. Fires on every matching occurrence. */
export function onEvent(options: {
    event: string
    properties?: readonly import('./types').PropertyCondition[]
}): TriggerConfig {
    return {
        type: 'event',
        filters: {
            events: [
                {
                    id: options.event,
                    name: options.event,
                    type: 'events',
                    order: 0,
                    properties: options.properties ?? [],
                },
            ],
            properties: [],
            filter_test_accounts: false,
        },
    }
}

/** A schedule trigger. The cadence is attached separately and is not in the definition. */
export function onSchedule(): TriggerConfig {
    return { type: 'schedule' }
}
