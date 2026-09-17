// push(): put the workflow the file describes into a PostHog project.
//
// Identity comes from the file. With an `id` in the workflow options, push goes straight
// to that workflow and the name is just a name. Without one, it falls back to the lookup
// by name, and whichever way it learns an id it writes that id back into the source file,
// so the next run has it.
//
// A push only writes when the definition differs from what PostHog holds. The API has no
// "has this changed" question to ask (`base_updated_at` guards lost updates and moves on
// any save; `version` is the content signal but only after the fact), so push fetches the
// workflow and compares.

import { WorkflowError } from './errors'
import type { WorkflowErrorDetail } from './errors'
import { recordWorkflowId } from './identity'
import { sameWorkflow } from './normalize'
import { assertValid } from './validate'
import type { WorkflowDefinition } from './types'

export interface PushConfig {
    readonly apiKey: string
    readonly host: string
    readonly projectId: string
}

export interface PushOptions {
    /** The backend id the source file carries, when it has one. */
    readonly id?: string | undefined
    /** The `*.workflow.ts` file to write a newly learned id back into. */
    readonly sourceFile?: string | undefined
}

export interface PushResult {
    readonly id: string
    readonly url: string
    readonly action: 'created' | 'updated' | 'unchanged'
    /** The version PostHog holds after the push. */
    readonly version: number | undefined
    /** The file the id was written into, when this push learned one. */
    readonly idWrittenTo: string | undefined
    readonly warnings: readonly string[]
}

interface ListedWorkflow {
    readonly id: string
    readonly name: string
}

interface StoredWorkflow extends Record<string, unknown> {
    readonly id: string
    readonly version?: number
}

/** Reads the three env vars the demo runs on and explains any that are missing. */
export function configFromEnv(env: Record<string, string | undefined>): PushConfig {
    const missing = (['POSTHOG_API_KEY', 'POSTHOG_HOST', 'POSTHOG_PROJECT_ID'] as const).filter((key) => !env[key])
    if (missing.length > 0) {
        throw new WorkflowError({
            status: 'missing_config',
            message: `Missing ${missing.join(', ')}.`,
            why: 'push() needs a personal API key, the PostHog host, and the project to write into.',
            fix: 'Set POSTHOG_API_KEY to a personal API key with hog_flow:write, POSTHOG_HOST to your PostHog URL, and POSTHOG_PROJECT_ID to the project id, then run again.',
        })
    }
    const apiKey = env.POSTHOG_API_KEY!
    if (apiKey.startsWith('phs_')) {
        throw new WorkflowError({
            status: 'missing_config',
            message: 'POSTHOG_API_KEY is a project secret key.',
            why: 'The workflows API does not accept project secret keys (phs_), only personal API keys (phx_).',
            fix: 'Create a personal API key with the hog_flow:write scope and use that instead.',
        })
    }
    return { apiKey, host: env.POSTHOG_HOST!.replace(/\/$/, ''), projectId: env.POSTHOG_PROJECT_ID! }
}

function authHeaders(config: PushConfig): Record<string, string> {
    // No X-PostHog-Client: mcp. Without it this client may PATCH actions and edges directly.
    return { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }
}

function describeApiFailure(status: number, body: string): WorkflowErrorDetail {
    let detail = body.slice(0, 500)
    try {
        const parsed = JSON.parse(body) as { detail?: string; attr?: string }
        detail = parsed.detail ?? detail
    } catch {
        // Not JSON. The raw body is still the most useful thing to show.
    }

    if (status === 401) {
        return {
            status,
            message: 'PostHog rejected the API key.',
            why: detail,
            fix: 'Check POSTHOG_API_KEY is a current personal API key and that POSTHOG_HOST points at the same PostHog instance that issued it.',
        }
    }
    if (status === 403) {
        return {
            status,
            message: 'The API key is not allowed to write workflows in this project.',
            why: detail,
            fix: 'Give the personal API key the hog_flow:write scope and scope it to this project, then run again.',
        }
    }
    if (status === 404) {
        return {
            status,
            message: 'PostHog could not find that project or workflow.',
            why: detail,
            fix: 'Check POSTHOG_PROJECT_ID matches the project id in your PostHog URL.',
        }
    }
    if (status === 400) {
        return {
            status,
            message: 'PostHog rejected the workflow definition.',
            why: detail,
            fix: 'Fix the step the message names and run again. The API validates templates, filters and inputs that the SDK does not.',
        }
    }
    return {
        status,
        message: `PostHog returned ${status}.`,
        why: detail,
        fix: 'Retry. If it keeps happening, run without --push and check the emitted definition against the workflow graph schema.',
    }
}

/** The 404 that means the file owns a workflow that is gone, which has two ways out. */
function describeMissingWorkflow(id: string, sourceFile: string | undefined): WorkflowErrorDetail {
    const where = sourceFile ?? 'the workflow file'
    return {
        status: 404,
        message: 'The workflow this file owns is not in PostHog any more.',
        why: `${where} carries id ${id}, and PostHog answered 404 for it, so it was deleted or it lives in another project.`,
        fix: `Either remove the id line from ${where} and run again, which creates a new workflow and writes the new id back, or restore the workflow with id ${id} in PostHog and keep the file as it is.`,
    }
}

async function request(config: PushConfig, method: string, path: string, body?: unknown): Promise<Response> {
    try {
        return await fetch(`${config.host}${path}`, {
            method,
            headers: authHeaders(config),
            body: body === undefined ? undefined : JSON.stringify(body),
        })
    } catch (error) {
        throw new WorkflowError({
            status: 'network_error',
            message: `Could not reach ${config.host}.`,
            why: error instanceof Error ? error.message : String(error),
            fix: 'Check POSTHOG_HOST is reachable from here, then run again.',
        })
    }
}

async function findByName(config: PushConfig, name: string): Promise<ListedWorkflow | null> {
    const path = `/api/projects/${config.projectId}/hog_flows/?search=${encodeURIComponent(name)}&limit=500`
    const response = await request(config, 'GET', path)
    if (!response.ok) {
        throw new WorkflowError(describeApiFailure(response.status, await response.text()))
    }
    const page = (await response.json()) as { results?: ListedWorkflow[] }
    const matches = (page.results ?? []).filter((workflow) => workflow.name === name)
    if (matches.length > 1) {
        throw new WorkflowError({
            status: 'ambiguous_name',
            message: `This project already has ${matches.length} workflows named "${name}".`,
            why: 'Without an id in the file, push matches by name, and it will not guess which of several same-named workflows the file owns.',
            fix: `Add the id of the workflow this file owns to its workflow({ ... }) options, or rename the duplicates in PostHog so one workflow is named "${name}".`,
        })
    }
    return matches[0] ?? null
}

/** Fetches the whole workflow, because the compare needs the definition, not the list row. */
async function fetchWorkflow(
    config: PushConfig,
    id: string,
    sourceFile: string | undefined
): Promise<StoredWorkflow> {
    const response = await request(config, 'GET', `/api/projects/${config.projectId}/hog_flows/${id}/`)
    if (response.status === 404) {
        throw new WorkflowError(describeMissingWorkflow(id, sourceFile))
    }
    if (!response.ok) {
        throw new WorkflowError(describeApiFailure(response.status, await response.text()))
    }
    return (await response.json()) as StoredWorkflow
}

/**
 * Validates, then creates the workflow or brings it up to date with the file. Writes the
 * backend id into the source file the first time it learns one, and only PATCHes when the
 * definition differs from what PostHog holds. Safe to rerun.
 */
export async function push(
    definition: WorkflowDefinition,
    config: PushConfig,
    options: PushOptions = {}
): Promise<PushResult> {
    const warnings = assertValid(definition)
    const base = `/api/projects/${config.projectId}/hog_flows/`
    const url = (id: string): string => `${config.host}/project/${config.projectId}/workflows/${id}`

    // An id in the file is the identity. The name lookup is only for a file that has none yet.
    const known = options.id ?? (await findByName(config, definition.name))?.id

    if (known === undefined) {
        const response = await request(config, 'POST', base, definition)
        if (!response.ok) {
            throw new WorkflowError(describeApiFailure(response.status, await response.text()))
        }
        const created = (await response.json()) as StoredWorkflow
        return {
            id: created.id,
            url: url(created.id),
            action: 'created',
            version: created.version,
            idWrittenTo: await writeBack(options.sourceFile, created.id),
            warnings,
        }
    }

    const idWrittenTo = options.id === undefined ? await writeBack(options.sourceFile, known) : undefined
    const remote = await fetchWorkflow(config, known, options.sourceFile)

    if (sameWorkflow(definition, remote)) {
        return { id: known, url: url(known), action: 'unchanged', version: remote.version, idWrittenTo, warnings }
    }

    const response = await request(config, 'PATCH', `${base}${known}/`, definition)
    if (!response.ok) {
        throw new WorkflowError(describeApiFailure(response.status, await response.text()))
    }
    const saved = (await response.json()) as StoredWorkflow
    return { id: known, url: url(known), action: 'updated', version: saved.version, idWrittenTo, warnings }
}

async function writeBack(sourceFile: string | undefined, id: string): Promise<string | undefined> {
    if (sourceFile === undefined) {
        return undefined
    }
    return (await recordWorkflowId(sourceFile, id)) ? sourceFile : undefined
}
