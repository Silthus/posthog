// Three authoring shapes over one compiler. Each shape only decides how an author
// writes the step values down; `emit()` in sdk/compile.ts is the same code for all
// three, so any difference in the emitted definition would be a bug in a shape.

import { emit, type EmitOptions, type EmitResult, type IdStrategy } from './compile'
import type { BranchSpec, Conditions, Path, Step } from './steps'
import {
    branch as branchStep,
    delay as delayStep,
    email as emailStep,
    fn as fnStep,
    webhook as webhookStep,
} from './steps'
import type { Duration, ExitCondition, TriggerConfig, WorkflowDefinition, WorkflowStatus } from './types'

export interface Workflow {
    emit(): WorkflowDefinition
    emitWith(idStrategy: IdStrategy): EmitResult
}

interface Head {
    readonly name: string
    readonly description?: string
    readonly status?: WorkflowStatus
    readonly exitCondition?: ExitCondition
}

function build(
    head: Head,
    trigger: TriggerConfig,
    steps: Path,
    exitReason: string,
    idHints?: ReadonlyMap<Step, string>
): Workflow {
    const base: Omit<EmitOptions, 'idStrategy'> = {
        name: head.name,
        description: head.description,
        status: head.status,
        exitCondition: head.exitCondition,
        trigger,
        steps,
        exit: { reason: exitReason },
        ...(idHints === undefined ? {} : { idHints }),
    }
    return {
        emit: () => emit(base).definition,
        emitWith: (idStrategy) => emit({ ...base, idStrategy }),
    }
}

// ---------------------------------------------------------------------------
// Shape A: the chain keeps the linear spine, and every step is also a value.
// ---------------------------------------------------------------------------

export interface Chain {
    /** Places a step defined elsewhere. The same value may be placed again. */
    add(step: Step): Chain
    /** Places a named sub-path defined elsewhere. */
    addAll(steps: Path): Chain
    delay(duration: Duration, options?: { name?: string }): Chain
    webhook(options: Parameters<typeof webhookStep>[0]): Chain
    email(options: Parameters<typeof emailStep>[0]): Chain
    fn(options: Parameters<typeof fnStep>[0]): Chain
    branch(options: { name: string; branches: readonly [BranchSpec, ...BranchSpec[]] }): Chain
    /** Terminates the graph and is the only way to reach a Workflow. */
    exit(reason: string): Workflow
}

export function chained(head: Head): { on(trigger: TriggerConfig): Chain } {
    return {
        on(trigger: TriggerConfig): Chain {
            const steps: Step[] = []
            const chain: Chain = {
                add(step) {
                    steps.push(step)
                    return chain
                },
                addAll(sub) {
                    steps.push(...sub)
                    return chain
                },
                delay(duration, options) {
                    steps.push(delayStep(duration, options))
                    return chain
                },
                webhook(options) {
                    steps.push(webhookStep(options))
                    return chain
                },
                email(options) {
                    steps.push(emailStep(options))
                    return chain
                },
                fn(options) {
                    steps.push(fnStep(options))
                    return chain
                },
                branch(options) {
                    steps.push(branchStep(options))
                    return chain
                },
                exit(reason) {
                    return build(head, trigger, steps as unknown as Path, reason)
                },
            }
            return chain
        },
    }
}

// ---------------------------------------------------------------------------
// Shape B: one declarative record. No chain at all.
// ---------------------------------------------------------------------------

export interface DeclarativeOptions extends Head {
    readonly on: TriggerConfig
    readonly steps: Path
    readonly exit: { readonly reason: string }
}

export function declarative(options: DeclarativeOptions): Workflow {
    return build(options, options.on, options.steps, options.exit.reason)
}

// ---------------------------------------------------------------------------
// Shape C: a keyed registry of steps, plus a flow that places them by key.
// The key is the author's own id namespace, so an id does not move when the
// graph does.
// ---------------------------------------------------------------------------

export interface KeyedBranchSpec<K extends string> {
    readonly name: string
    readonly when: Conditions
    readonly then: readonly [K, ...K[]]
}

export interface KeyedBranch<K extends string> {
    readonly branch: {
        readonly name: string
        readonly branches: readonly [KeyedBranchSpec<K>, ...KeyedBranchSpec<K>[]]
    }
}

export type Placement<S extends Record<string, Step>> = (keyof S & string) | KeyedBranch<keyof S & string>

export interface KeyedWorkflowOptions<S extends Record<string, Step>> extends Head {
    readonly on: TriggerConfig
    readonly flow: readonly [Placement<S>, ...Placement<S>[]]
    readonly exit: { readonly reason: string }
}

/** Names every step up front, then places them by key. */
export function keyed<S extends Record<string, Step>>(
    steps: S
): { workflow(options: KeyedWorkflowOptions<S>): Workflow } {
    const resolvePath = (keys: readonly (keyof S & string)[]): Path => keys.map((key) => steps[key]!) as unknown as Path

    const resolve = (placement: Placement<S>): Step => {
        if (typeof placement === 'string') {
            return steps[placement]!
        }
        const branches = placement.branch.branches.map(
            (spec): BranchSpec => ({ name: spec.name, when: spec.when, then: resolvePath(spec.then) })
        ) as unknown as readonly [BranchSpec, ...BranchSpec[]]
        return branchStep({ name: placement.branch.name, branches })
    }

    return {
        workflow(options): Workflow {
            const resolved = options.flow.map(resolve) as unknown as Path
            const hints = new Map<Step, string>()
            for (const [key, step] of Object.entries(steps)) {
                hints.set(step, key.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase())
            }
            return build(options, options.on, resolved, options.exit.reason, hints)
        },
    }
}
