// The CLI. Three commands over one pipeline: load the file, emit each workflow it exports,
// validate, then either compare against PostHog or write.
//
// Every command takes an explicit path. No glob and no config file, so nothing about which
// files are workflows is baked in before the convention is decided.

import { WorkflowError } from '../sdk/errors'
import { findSecrets, resolveSecrets } from '../sdk/secret'
import { validate } from '../sdk/validate'
import { requireConfig, resolveConfig, Client } from './client'
import { diffWorkflow } from './diff'
import type { Change, Diff } from './diff'
import { loadWorkflowFile } from './load'
import type { LoadedWorkflow } from './load'

type Command = 'check' | 'push' | 'diff'

interface Options {
    readonly command: Command
    readonly path: string
    readonly json: boolean
    readonly print: boolean
    readonly force: boolean
}

interface WorkflowReport {
    readonly exportName: string
    readonly name: string
    readonly status: string
    readonly steps: readonly string[]
    readonly secrets: readonly { input: string; variable: string }[]
    readonly valid: boolean
    readonly problems: readonly { message: string; why: string; fix: string }[]
    readonly warnings: readonly string[]
    readonly outcome: 'would create' | 'would update' | 'unchanged' | 'created' | 'updated' | 'not compared'
    readonly changes: readonly Change[]
    readonly id?: string
    readonly url?: string
    readonly version?: number
}

const USAGE = `posthog-workflows <command> <file>

  check <file>   load the file, validate every workflow it exports, and show what a push
                 would change. Works without credentials: the diff is skipped and said so.
  push <file>    create or update each workflow in PostHog. Writes nothing when unchanged.
  diff <file>    show what a push would change and nothing else.

  --json         machine-readable output, for a CI step that posts a comment
  --print        also print the emitted definition JSON
  --force        push even when the diff is empty, which is how a rotated secret lands
`

function parse(argv: readonly string[]): Options {
    const positional = argv.filter((arg) => !arg.startsWith('--'))
    const command = positional[0]
    const path = positional[1]
    if (command !== 'check' && command !== 'push' && command !== 'diff') {
        throw new WorkflowError({
            status: 'missing_config',
            message: command === undefined ? 'No command.' : `Unknown command "${command}".`,
            why: 'The CLI has three commands: check, push and diff.',
            fix: USAGE,
        })
    }
    if (path === undefined) {
        throw new WorkflowError({
            status: 'missing_config',
            message: `${command} needs a file.`,
            why: 'Every command takes the path to the workflow file explicitly. There is no glob and no config file.',
            fix: `Run: posthog-workflows ${command} path/to/onboarding.workflow.ts`,
        })
    }
    return {
        command,
        path,
        json: argv.includes('--json'),
        print: argv.includes('--print'),
        force: argv.includes('--force'),
    }
}

function describeSteps(loaded: LoadedWorkflow): string[] {
    return loaded.definition.actions.map((action) => action.type)
}

function baseReport(loaded: LoadedWorkflow): Omit<WorkflowReport, 'outcome' | 'changes'> {
    const result = validate(loaded.definition)
    return {
        exportName: loaded.exportName,
        name: loaded.definition.name,
        status: loaded.definition.status,
        steps: describeSteps(loaded),
        secrets: findSecrets(loaded.definition.actions).map((slot) => ({
            input: `${slot.actionId}.${slot.inputKey}`,
            variable: slot.variable,
        })),
        valid: result.errors.length === 0,
        problems: result.errors.map((error) => ({ message: error.message, why: error.why, fix: error.fix })),
        warnings: result.warnings,
    }
}

function renderChanges(diff: Diff): string[] {
    const sign = { added: '+', removed: '-', changed: '~' } as const
    return diff.changes.map((change) => {
        const head = `${sign[change.kind]} ${change.what}`
        return change.before === undefined ? head : `${head}: ${change.before} -> ${change.after}`
    })
}

function printHuman(path: string, reports: readonly WorkflowReport[], footer: readonly string[]): void {
    console.log(path)
    for (const report of reports) {
        console.log(`  ${report.exportName} -> "${report.name}"`)
        console.log(`    status   ${report.status}`)
        console.log(`    steps    ${report.steps.length} (${report.steps.join(', ')})`)
        for (const secret of report.secrets) {
            console.log(`    secret   ${secret.input} from $${secret.variable}, resolved at push`)
        }
        console.log(`    valid    ${report.valid ? 'ok' : `${report.problems.length} problem(s)`}`)
        for (const problem of report.problems) {
            console.log(`             ${problem.message}`)
            console.log(`             why: ${problem.why}`)
            console.log(`             fix: ${problem.fix}`)
        }
        for (const warning of report.warnings) {
            console.log(`    warning  ${warning}`)
        }
        console.log(`    ${report.outcome === 'not compared' ? 'diff     not compared' : `result   ${report.outcome}`}`)
        for (const line of report.changes) {
            console.log(
                `             ${line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : '~'} ${line.what}${line.before === undefined ? '' : `: ${line.before} -> ${line.after}`}`
            )
        }
        if (report.url) {
            console.log(`    url      ${report.url}`)
        }
        if (report.version !== undefined) {
            console.log(`    version  ${report.version}`)
        }
    }
    for (const line of footer) {
        console.log(line)
    }
}

async function main(): Promise<void> {
    const options = parse(process.argv.slice(2))
    const file = await loadWorkflowFile(options.path)
    const reports: WorkflowReport[] = []
    const footer: string[] = []

    const config = options.command === 'push' ? requireConfig(process.env) : resolveConfig(process.env)
    const client = config ? new Client(config) : null

    if (options.command === 'diff' && !client) {
        throw new WorkflowError({
            status: 'missing_config',
            message: 'diff needs credentials.',
            why: 'A diff compares the file against a project, so there is nothing for it to do offline. check is the command that degrades.',
            fix: 'Set POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID, or run check instead.',
        })
    }

    for (const loaded of file.workflows) {
        const base = baseReport(loaded)

        if (options.print) {
            console.log(JSON.stringify(loaded.definition, null, 2))
        }

        if (!base.valid || !client) {
            reports.push({ ...base, outcome: 'not compared', changes: [] })
            continue
        }

        // Resolve before the diff, not at the write. A missing variable has to fail whatever
        // the diff would have said, and an unchanged workflow never reaches the write.
        const resolved = options.command === 'push' ? resolveSecrets(loaded.definition, process.env) : loaded.definition

        const remote = await client.findByName(loaded.definition.name)

        if (remote === null) {
            if (options.command !== 'push') {
                reports.push({ ...base, outcome: 'would create', changes: [] })
                continue
            }
            const created = await client.create(resolved)
            reports.push({
                ...base,
                outcome: 'created',
                changes: [],
                id: created.id,
                url: client.urlFor(created.id),
                version: created.version,
            })
            continue
        }

        const diff = diffWorkflow(loaded.definition, remote)

        if (options.command !== 'push') {
            reports.push({
                ...base,
                outcome: diff.changed ? 'would update' : 'unchanged',
                changes: diff.changes,
                id: remote.id,
                url: client.urlFor(remote.id),
                version: remote.version,
            })
            continue
        }

        if (!diff.changed && !options.force) {
            reports.push({
                ...base,
                outcome: 'unchanged',
                changes: [],
                id: remote.id,
                url: client.urlFor(remote.id),
                version: remote.version,
            })
            continue
        }

        const saved = await client.update(remote.id, resolved)
        reports.push({
            ...base,
            outcome: 'updated',
            changes: diff.changes,
            id: saved.id,
            url: client.urlFor(saved.id),
            version: saved.version,
        })
    }

    const invalid = reports.filter((report) => !report.valid).length
    const counts = (outcome: WorkflowReport['outcome']): number =>
        reports.filter((report) => report.outcome === outcome).length

    if (options.command === 'push') {
        footer.push(
            `pushed ${reports.length} workflow(s): ${counts('created')} created, ${counts('updated')} updated, ${counts('unchanged')} unchanged.`
        )
    } else if (client) {
        footer.push(
            `${reports.length} workflow(s), ${invalid === 0 ? 'all valid' : `${invalid} invalid`}. ` +
                `${counts('would create')} would be created, ${counts('would update')} would be updated, ${counts('unchanged')} unchanged.`
        )
    } else {
        footer.push(`${reports.length} workflow(s), ${invalid === 0 ? 'all valid' : `${invalid} invalid`}.`)
    }
    if (!client) {
        footer.push(
            'diff skipped: no PostHog credentials in this environment, so the file was validated offline.',
            'Set POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID to compare against a project.'
        )
    } else if (config) {
        footer.push(
            `compared against project ${config.projectId} on ${client.host} (credentials from the ${config.source}).`
        )
    }

    if (options.json) {
        console.log(
            JSON.stringify(
                {
                    command: options.command,
                    file: file.path,
                    // A CI step branches on this before it reads anything else.
                    ok: invalid === 0,
                    offline: client === null,
                    workflows: reports.map((report) => ({
                        ...report,
                        changes: renderChanges({ changed: true, changes: report.changes, secretsIgnored: [] }),
                    })),
                },
                null,
                2
            )
        )
    } else {
        printHuman(file.path, reports, footer)
    }

    process.exitCode = invalid === 0 ? 0 : 1
}

try {
    await main()
} catch (error) {
    if (error instanceof WorkflowError) {
        console.error(error.format())
        process.exitCode = 1
    } else {
        throw error
    }
}
