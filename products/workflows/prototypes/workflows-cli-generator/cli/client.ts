// Talking to PostHog. Credentials come from the environment first and then from the file
// the Rust posthog-cli writes, so one `posthog-cli login` serves both tools and CI needs
// no login at all.
//
// resolveConfig returns null rather than throwing when nothing is configured. That is what
// lets `check` degrade to offline validation on a pull request from a fork, which cannot
// read repository secrets. `push` turns the same null into a hard failure.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { WorkflowError } from '../sdk/errors'
import type { WorkflowErrorDetail } from '../sdk/errors'
import type { WorkflowDefinition } from '../sdk/types'

export interface Config {
    readonly apiKey: string
    readonly host: string
    readonly projectId: string
    /** Where the credentials came from, so the output can say so. */
    readonly source: 'environment' | 'credentials file'
}

export interface StoredWorkflow extends Record<string, unknown> {
    readonly id: string
    readonly version?: number
}

interface CredentialsFile {
    readonly host?: string
    readonly token?: string
    readonly env_id?: string
}

function readCredentialsFile(): CredentialsFile | null {
    try {
        return JSON.parse(readFileSync(join(homedir(), '.posthog', 'credentials.json'), 'utf8')) as CredentialsFile
    } catch {
        return null
    }
}

/** Null when no complete set of credentials is available anywhere. */
export function resolveConfig(env: Record<string, string | undefined>): Config | null {
    const fromEnvApiKey = env.POSTHOG_CLI_API_KEY ?? env.POSTHOG_CLI_TOKEN
    const fromEnvProject = env.POSTHOG_CLI_PROJECT_ID ?? env.POSTHOG_CLI_ENV_ID
    const fromEnvHost = env.POSTHOG_CLI_HOST

    if (fromEnvApiKey && fromEnvProject) {
        return {
            apiKey: fromEnvApiKey,
            host: (fromEnvHost ?? 'https://us.posthog.com').replace(/\/$/, ''),
            projectId: fromEnvProject,
            source: 'environment',
        }
    }

    const file = readCredentialsFile()
    if (file?.token && file.env_id) {
        return {
            apiKey: file.token,
            host: (fromEnvHost ?? file.host ?? 'https://us.posthog.com').replace(/\/$/, ''),
            projectId: fromEnvProject ?? file.env_id,
            source: 'credentials file',
        }
    }
    return null
}

export function requireConfig(env: Record<string, string | undefined>): Config {
    const config = resolveConfig(env)
    if (config) {
        return config
    }
    throw new WorkflowError({
        status: 'missing_config',
        message: 'No PostHog credentials.',
        why: 'push writes to a project, so it needs a personal API key with hog_flow:write and the project to write into. Neither the environment nor ~/.posthog/credentials.json had both.',
        fix: 'In CI set POSTHOG_CLI_API_KEY, POSTHOG_CLI_PROJECT_ID and POSTHOG_CLI_HOST. Locally run posthog-cli login once.',
    })
}

function describeApiFailure(status: number, body: string): WorkflowErrorDetail {
    let detail = body.slice(0, 500)
    try {
        detail = (JSON.parse(body) as { detail?: string }).detail ?? detail
    } catch {
        // Not JSON. The raw body is still the most useful thing to show.
    }
    if (status === 401) {
        return {
            status,
            message: 'PostHog rejected the API key.',
            why: detail,
            fix: 'Check the key is current and that the host is the same PostHog instance that issued it.',
        }
    }
    if (status === 403) {
        return {
            status,
            message: 'The API key may not write workflows in this project.',
            why: detail,
            fix: 'Give the personal API key the hog_flow:write scope, scoped to this project.',
        }
    }
    if (status === 400) {
        return {
            status,
            message: 'PostHog rejected the workflow definition.',
            why: detail,
            fix: 'Fix the step the message names. The API validates templates and inputs that check does not.',
        }
    }
    return {
        status,
        message: `PostHog returned ${status}.`,
        why: detail,
        fix: 'Retry. If it keeps happening, run check and compare the emitted definition against the workflow graph schema.',
    }
}

export class Client {
    constructor(private readonly config: Config) {}

    get host(): string {
        return this.config.host
    }

    urlFor(id: string): string {
        return `${this.config.host}/project/${this.config.projectId}/workflows/${id}`
    }

    private async request(method: string, path: string, body?: unknown): Promise<Response> {
        try {
            return await fetch(`${this.config.host}${path}`, {
                method,
                headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
            })
        } catch (error) {
            throw new WorkflowError({
                status: 'network_error',
                message: `Could not reach ${this.config.host}.`,
                why: error instanceof Error ? error.message : String(error),
                fix: 'Check the host is reachable from here, then run again.',
            })
        }
    }

    private get base(): string {
        return `/api/projects/${this.config.projectId}/hog_flows/`
    }

    /** The stored workflow this name owns, or null when PostHog has none. */
    async findByName(name: string): Promise<StoredWorkflow | null> {
        const response = await this.request('GET', `${this.base}?search=${encodeURIComponent(name)}&limit=500`)
        if (!response.ok) {
            throw new WorkflowError(describeApiFailure(response.status, await response.text()))
        }
        const page = (await response.json()) as { results?: { id: string; name: string }[] }
        const matches = (page.results ?? []).filter((row) => row.name === name)
        if (matches.length > 1) {
            throw new WorkflowError({
                status: 'ambiguous_name',
                message: `This project has ${matches.length} workflows named "${name}".`,
                why: 'Identity is the name, and the CLI will not guess which of several same-named workflows the file owns.',
                fix: `Rename the duplicates in PostHog so one workflow is named "${name}".`,
            })
        }
        const found = matches[0]
        return found ? await this.fetchOne(found.id) : null
    }

    async fetchOne(id: string): Promise<StoredWorkflow> {
        const response = await this.request('GET', `${this.base}${id}/`)
        if (!response.ok) {
            throw new WorkflowError(describeApiFailure(response.status, await response.text()))
        }
        return (await response.json()) as StoredWorkflow
    }

    async create(definition: WorkflowDefinition): Promise<StoredWorkflow> {
        const response = await this.request('POST', this.base, definition)
        if (!response.ok) {
            throw new WorkflowError(describeApiFailure(response.status, await response.text()))
        }
        return (await response.json()) as StoredWorkflow
    }

    async update(id: string, definition: WorkflowDefinition): Promise<StoredWorkflow> {
        const response = await this.request('PATCH', `${this.base}${id}/`, definition)
        if (!response.ok) {
            throw new WorkflowError(describeApiFailure(response.status, await response.text()))
        }
        return (await response.json()) as StoredWorkflow
    }
}
