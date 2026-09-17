export { eventProperty, onEvent, person, workflow } from './builder'
export type { BranchSpec, Chain, Workflow, WorkflowChain } from './builder'
export { WorkflowError } from './errors'
export type { WorkflowErrorDetail } from './errors'
export { recordWorkflowId, withWorkflowId } from './identity'
export { normalizeWorkflow, sameWorkflow } from './normalize'
export { configFromEnv, push } from './push'
export type { PushConfig, PushOptions, PushResult } from './push'
export type * from './types'
export { assertValid, validate } from './validate'

import { relative } from 'node:path'

import type { Workflow } from './builder'
import { WorkflowError } from './errors'
import { configFromEnv, push } from './push'
import { validate } from './validate'

/**
 * What a `*.workflow.ts` file ends with. No arguments prints the definition;
 * `--push` sends it to PostHog. The file is the program, so there is no CLI to install.
 *
 * The id write-back goes into the file that was run, which is the entrypoint bun started.
 */
export async function run(built: Workflow, argv: readonly string[] = process.argv.slice(2)): Promise<void> {
    try {
        const definition = built.emit()

        if (!argv.includes('--push')) {
            const result = validate(definition)
            for (const warning of result.warnings) {
                console.error(`warning: ${warning}`)
            }
            for (const error of result.errors) {
                console.error(`\n${new WorkflowError(error).format()}`)
            }
            console.log(JSON.stringify(definition, null, 2))
            process.exitCode = result.errors.length > 0 ? 1 : 0
            return
        }

        const result = await push(definition, configFromEnv(process.env), {
            id: built.id,
            sourceFile: relative(process.cwd(), Bun.main),
        })
        for (const warning of result.warnings) {
            console.error(`warning: ${warning}`)
        }
        console.log(`${result.action} workflow ${result.id} (version ${result.version})`)
        if (result.idWrittenTo !== undefined) {
            console.log(`wrote the id into ${result.idWrittenTo}. Commit it so the next run finds this workflow.`)
        }
        console.log(result.url)
    } catch (error) {
        if (error instanceof WorkflowError) {
            console.error(error.format())
            process.exitCode = 1
            return
        }
        throw error
    }
}
