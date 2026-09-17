// push(): upsert a workflow definition into a PostHog project by name.
//
// Lookup is `GET ...?search=<name>` followed by an exact client-side match on `name`.
// The list endpoint's only name-ish filter is `search`, which is a case-insensitive
// substring regex over name and description, so it can return near misses and it
// cannot stand in for an exact match on its own.

import { WorkflowError } from './errors'
import type { WorkflowErrorDetail } from './errors'
import { assertValid } from './validate'
import type { WorkflowDefinition } from './types'

export interface PushConfig {
    readonly apiKey: string
    readonly host: string
    readonly projectId: string
}

export interface PushResult {
    readonly id: string
    readonly url: string
    readonly action: 'created' | 'updated'
    readonly warnings: readonly string[]
}

interface ListedWorkflow {
    readonly id: string
    readonly name: string
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
            why: 'push() upserts by name, and it will not guess which of several same-named workflows the file owns.',
            fix: `Rename or delete the duplicates in PostHog so one workflow is named "${name}", then run again.`,
        })
    }
    return matches[0] ?? null
}

/** Validates, then creates or updates the workflow with this name. Safe to rerun. */
export async function push(definition: WorkflowDefinition, config: PushConfig): Promise<PushResult> {
    const warnings = assertValid(definition)
    const existing = await findByName(config, definition.name)

    const base = `/api/projects/${config.projectId}/hog_flows/`
    const response = existing
        ? await request(config, 'PATCH', `${base}${existing.id}/`, definition)
        : await request(config, 'POST', base, definition)

    if (!response.ok) {
        throw new WorkflowError(describeApiFailure(response.status, await response.text()))
    }

    const saved = (await response.json()) as { id: string }
    return {
        id: saved.id,
        url: `${config.host}/project/${config.projectId}/workflows/${saved.id}`,
        action: existing ? 'updated' : 'created',
        warnings,
    }
}
