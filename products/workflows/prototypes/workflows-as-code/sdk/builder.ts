// The authoring surface. Steps are recorded as a linear list with nested branch
// paths; ids and edges are derived at emit() time, so a branch index and the edge
// that carries it cannot drift apart.

import { WorkflowError } from './errors'
import type {
    Action,
    ActionFilters,
    BranchCondition,
    Duration,
    Edge,
    EventFilter,
    ExitCondition,
    FunctionInputs,
    PropertyCondition,
    PropertyOperator,
    PropertyType,
    TriggerConfig,
    WorkflowDefinition,
    WorkflowStatus,
} from './types'

/** At least one condition. An empty `when` is a compile error, not a runtime one. */
export type Conditions = readonly [PropertyCondition, ...PropertyCondition[]]

export interface BranchSpec {
    readonly name: string
    readonly when: Conditions
    readonly then: (path: Chain) => Chain
}

export interface Chain {
    delay(duration: Duration, options?: { name?: string }): Chain
    webhook(options: { name: string; url: string; body?: Record<string, unknown> }): Chain
    branch(options: { name: string; branches: readonly [BranchSpec, ...BranchSpec[]] }): Chain
}

export interface Workflow {
    /** The backend id this file owns, once a push has written one in. */
    readonly id: string | undefined
    /** The definition JSON, exactly as it goes on the wire. The id is not part of it. */
    emit(): WorkflowDefinition
}

type Step =
    | { kind: 'delay'; name: string; duration: Duration }
    | { kind: 'webhook'; name: string; url: string; body?: Record<string, unknown> }
    | { kind: 'branch'; name: string; branches: readonly BranchSpec[] }

class ChainImpl implements Chain {
    readonly steps: Step[] = []

    delay(duration: Duration, options?: { name?: string }): Chain {
        this.steps.push({ kind: 'delay', name: options?.name ?? `Wait ${duration}`, duration })
        return this
    }

    webhook(options: { name: string; url: string; body?: Record<string, unknown> }): Chain {
        this.steps.push({ kind: 'webhook', ...options })
        return this
    }

    branch(options: { name: string; branches: readonly [BranchSpec, ...BranchSpec[]] }): Chain {
        this.steps.push({ kind: 'branch', name: options.name, branches: options.branches })
        return this
    }
}

interface WorkflowOptions {
    /**
     * The workflow this file owns in PostHog. Left out on a new file; the first push
     * writes it back here. With it, push goes straight to that workflow by id.
     */
    readonly id?: string
    readonly name: string
    readonly description?: string
    /** Defaults to `draft`, so a demo push never starts sending live traffic. */
    readonly status?: WorkflowStatus
    readonly exitCondition?: ExitCondition
}

class Ids {
    private readonly counts = new Map<string, number>()

    next(prefix: string): string {
        const seen = (this.counts.get(prefix) ?? 0) + 1
        this.counts.set(prefix, seen)
        return `${prefix}_${seen}`
    }
}

function compile(
    steps: readonly Step[],
    continuation: string,
    ids: Ids,
    actions: Action[],
    edges: Edge[]
): string {
    if (steps.length === 0) {
        return continuation
    }

    const stepIds = steps.map((step) => ids.next(step.kind))

    steps.forEach((step, position) => {
        const id = stepIds[position]!
        const next = stepIds[position + 1] ?? continuation

        if (step.kind === 'delay') {
            actions.push({ id, name: step.name, type: 'delay', config: { delay_duration: step.duration } })
            edges.push({ from: id, to: next, type: 'continue' })
            return
        }

        if (step.kind === 'webhook') {
            const inputs: FunctionInputs = {
                url: { value: step.url },
                method: { value: 'POST' },
                body: { value: step.body ?? {} },
            }
            actions.push({
                id,
                name: step.name,
                type: 'function',
                config: { template_id: 'template-webhook', inputs },
            })
            edges.push({ from: id, to: next, type: 'continue' })
            return
        }

        const conditions: BranchCondition[] = step.branches.map((spec) => ({
            name: spec.name,
            filters: { properties: [...spec.when] },
        }))
        actions.push({ id, name: step.name, type: 'conditional_branch', config: { conditions } })
        // The fall-through edge is the no-match path out of the branch.
        edges.push({ from: id, to: next, type: 'continue' })

        step.branches.forEach((spec, index) => {
            const path = spec.then(new ChainImpl()) as ChainImpl
            if (path.steps.length === 0) {
                throw new WorkflowError({
                    status: 'invalid_definition',
                    message: `Branch "${spec.name}" of step "${step.name}" has no steps.`,
                    why: 'An empty branch path would emit a branch edge pointing straight at the no-match target, which is the same graph with more edges.',
                    fix: `Add at least one step inside then: (path) => path.webhook({ ... }) for branch "${spec.name}", or drop the branch.`,
                })
            }
            // Index and edge are produced together from the same array position, so they agree.
            const entry = compile(path.steps, next, ids, actions, edges)
            edges.push({ from: id, to: entry, type: 'branch', index })
        })
    })

    return stepIds[0]!
}

class WorkflowImpl implements Workflow {
    constructor(
        private readonly options: WorkflowOptions,
        private readonly trigger: TriggerConfig,
        private readonly chain: ChainImpl,
        private readonly exitReason: string
    ) {}

    get id(): string | undefined {
        return this.options.id
    }

    emit(): WorkflowDefinition {
        const ids = new Ids()
        const actions: Action[] = []
        const edges: Edge[] = []

        const exitId = 'exit_node'
        const triggerId = 'trigger_node'
        const entry = compile(this.chain.steps, exitId, ids, actions, edges)

        actions.unshift({ id: triggerId, name: 'Trigger', type: 'trigger', config: this.trigger })
        edges.unshift({ from: triggerId, to: entry, type: 'continue' })
        actions.push({ id: exitId, name: 'Exit', type: 'exit', config: { reason: this.exitReason } })

        return {
            name: this.options.name,
            description: this.options.description ?? '',
            status: this.options.status ?? 'draft',
            exit_condition: this.options.exitCondition ?? 'exit_only_at_end',
            actions,
            edges,
        }
    }
}

export interface WorkflowChain extends Chain {
    delay(duration: Duration, options?: { name?: string }): WorkflowChain
    webhook(options: { name: string; url: string; body?: Record<string, unknown> }): WorkflowChain
    branch(options: { name: string; branches: readonly [BranchSpec, ...BranchSpec[]] }): WorkflowChain
    /** Terminates the graph. Everything that does not exit earlier lands here. */
    exit(reason: string): Workflow
}

export interface TriggerStage {
    on(trigger: TriggerConfig): WorkflowChain
}

export function workflow(options: WorkflowOptions): TriggerStage {
    return {
        on(trigger: TriggerConfig): WorkflowChain {
            const chain = new ChainImpl()
            const stage: WorkflowChain = {
                delay(duration, chainOptions) {
                    chain.delay(duration, chainOptions)
                    return stage
                },
                webhook(webhookOptions) {
                    chain.webhook(webhookOptions)
                    return stage
                },
                branch(branchOptions) {
                    chain.branch(branchOptions)
                    return stage
                },
                exit(reason) {
                    return new WorkflowImpl(options, trigger, chain, reason)
                },
            }
            return stage
        },
    }
}

/** An event trigger. Fires on every matching occurrence. */
export function onEvent(options: { event: string; properties?: readonly PropertyCondition[] }): TriggerConfig {
    const event: EventFilter = {
        id: options.event,
        name: options.event,
        type: 'events',
        order: 0,
        properties: options.properties ?? [],
    }
    const filters: ActionFilters = { events: [event], properties: [], filter_test_accounts: false }
    return { type: 'event', filters }
}

function condition(type: PropertyType) {
    return (
        key: string,
        operator: PropertyOperator,
        value?: readonly (string | number | boolean)[]
    ): PropertyCondition => ({ key, operator, value, type })
}

export const person = condition('person')
export const eventProperty = condition('event')
