// Loading a workflow file: the half the old prototype gave to `bun file.ts`.
//
// jiti evaluates the customer's TypeScript in this process. It caches transpiled output
// under node_modules/.cache/jiti and writes nothing into the customer's source tree, so
// there is no transpile step for the user to run, configure, or gitignore.
//
// Collecting is a separate step from loading on purpose. `jiti.import` hands back a module
// namespace, and every question worth a good error message ("two workflows", "none", "one
// you forgot to finish") is a question about that namespace, not about TypeScript.

import { createJiti } from 'jiti'
import { isAbsolute, relative, resolve } from 'node:path'

import type { Workflow } from '../sdk/builder'
import { WorkflowError } from '../sdk/errors'
import type { WorkflowDefinition } from '../sdk/types'

export interface LoadedWorkflow {
    /** The name the file exports it under. `default` for a default export. */
    readonly exportName: string
    readonly definition: WorkflowDefinition
}

export interface LoadedFile {
    /** Relative to the working directory, because that is what a CI log should show. */
    readonly path: string
    readonly workflows: readonly LoadedWorkflow[]
}

function isWorkflow(value: unknown): value is Workflow {
    return typeof value === 'object' && value !== null && (value as Workflow).kind === 'workflow'
}

function isUnfinished(value: unknown): boolean {
    return typeof value === 'object' && value !== null && (value as { kind?: string }).kind === 'workflow_draft'
}

/**
 * Evaluates the file and returns every workflow it exports, in export order.
 *
 * Three refusals, each with one fix: the file exports no workflow, it exports a chain that
 * was never closed with `.exit()`, or two of its workflows carry the same name. The third
 * matters because identity is the workflow name until an id scheme lands, so two workflows
 * named alike in one file would fight over the same row in PostHog.
 */
export async function loadWorkflowFile(path: string): Promise<LoadedFile> {
    const absolute = isAbsolute(path) ? path : resolve(process.cwd(), path)
    const shown = relative(process.cwd(), absolute) || path
    const jiti = createJiti(import.meta.url, { interopDefault: false })

    let namespace: Record<string, unknown>
    try {
        namespace = (await jiti.import(absolute)) as Record<string, unknown>
    } catch (error) {
        throw new WorkflowError({
            status: 'load_failed',
            message: `Could not load ${shown}.`,
            why: error instanceof Error ? error.message : String(error),
            fix: `Check that ${shown} exists and that running your own tsc over it is clean. The loader evaluates the file, so a throw at module level surfaces here.`,
        })
    }

    const workflows: LoadedWorkflow[] = []
    const unfinished: string[] = []

    for (const [exportName, value] of Object.entries(namespace)) {
        if (isWorkflow(value)) {
            workflows.push({ exportName, definition: value.emit() })
            continue
        }
        if (isUnfinished(value)) {
            unfinished.push(exportName)
        }
    }

    if (unfinished.length > 0) {
        throw new WorkflowError({
            status: 'unfinished_workflow',
            message: `${shown} exports ${unfinished.map((name) => `"${name}"`).join(', ')} without an exit step.`,
            why: 'A workflow is only a workflow once .exit() closes the graph. Until then it is a half-built chain, and the runtime would have nowhere to send a run that reaches the end.',
            fix: `Add .exit('<reason>') to the end of ${unfinished[0]!} in ${shown}.`,
        })
    }

    if (workflows.length === 0) {
        throw new WorkflowError({
            status: 'no_workflows',
            message: `${shown} exports no workflow.`,
            why: 'The CLI reads the file for exported workflows and found none. An unexported const is invisible, and so is a workflow built inside a function that nothing calls.',
            fix: `Export the workflow from ${shown}: export const myWorkflow = workflow({ ... }).on(...).exit('done').`,
        })
    }

    const byName = new Map<string, string>()
    for (const loaded of workflows) {
        const clash = byName.get(loaded.definition.name)
        if (clash !== undefined) {
            throw new WorkflowError({
                status: 'duplicate_workflow_name',
                message: `${shown} exports two workflows named "${loaded.definition.name}".`,
                why: `The name is the identity, so exports "${clash}" and "${loaded.exportName}" would both claim the same workflow in PostHog and the second push would overwrite the first.`,
                fix: `Give "${loaded.exportName}" its own name in ${shown}.`,
            })
        }
        byName.set(loaded.definition.name, loaded.exportName)
    }

    return { path: shown, workflows }
}
