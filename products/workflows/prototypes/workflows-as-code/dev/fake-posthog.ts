// A stand-in for the hog_flows API, so the push path can be exercised without a
// PostHog instance. It records every exchange and answers with the shape the real
// endpoints return. It is not a fixture of production behavior: it is a mirror that
// lets the transcript show what the SDK sent and what it did with the reply.
//
// It copies three behaviors from the real serializer, because change detection is
// only interesting against them: the reply carries the read-only fields the client
// never sent, actions come back with the defaults `HogFlowActionSerializer` injects,
// and `version` moves only when the stored content changed.

export interface Exchange {
    readonly method: string
    readonly path: string
    readonly headers: Record<string, string>
    readonly body: unknown
    readonly status: number
    readonly response: unknown
}

interface StoredWorkflow {
    id: string
    name: string
    version: number
    body: Record<string, unknown>
}

export interface FakePostHog {
    readonly host: string
    readonly exchanges: Exchange[]
    /** Deletes a workflow the way someone deletes one in the UI, so the 404 path is reachable. */
    remove(id: string): void
    stop(): void
}

const SKIPPED_HEADERS = new Set(['accept', 'accept-encoding', 'connection', 'host'])

function captureHeaders(request: Request): Record<string, string> {
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
        if (SKIPPED_HEADERS.has(key)) {
            return
        }
        headers[key] = key === 'authorization' ? 'Bearer phx_REDACTED' : value
    })
    return headers
}

/** What the serializer adds to an action the client sent plain. */
function serverizeAction(action: unknown): unknown {
    const source = action as Record<string, unknown>
    return { description: '', filters: null, ...source }
}

/** The whole row as a read returns it, read-only fields and all. */
function serverize(stored: StoredWorkflow): Record<string, unknown> {
    const actions = Array.isArray(stored.body.actions) ? stored.body.actions.map(serverizeAction) : []
    const trigger = (actions.find((action) => (action as { type?: string }).type === 'trigger') as
        | { config?: unknown }
        | undefined)?.config
    return {
        ...stored.body,
        id: stored.id,
        actions,
        version: stored.version,
        trigger,
        billable_action_types: ['function'],
        action_redirects: {},
        abort_action: null,
        draft: null,
        draft_updated_at: null,
        schedules: [],
        user_access_level: 'editor',
        created_at: '2026-09-17T09:00:00Z',
        updated_at: '2026-09-17T09:00:00Z',
        created_by: { id: 1, uuid: '0199c0de-1111-1111-1111-111111111111', email: 'prototype@example.com' },
    }
}

/** The server bumps version only when the stored content changed. */
function contentOf(body: Record<string, unknown>): string {
    return JSON.stringify({ actions: body.actions ?? [], edges: body.edges ?? [], exit_condition: body.exit_condition })
}

export function startFakePostHog(): FakePostHog {
    const exchanges: Exchange[] = []
    const stored: StoredWorkflow[] = []
    let nextId = 1

    function respond(request: Request, url: URL, body: unknown): { status: number; payload: unknown } {
        const segments = url.pathname.split('/').filter(Boolean)
        const last = segments[segments.length - 1]!
        const detailId = last === 'hog_flows' ? null : last

        if (request.method === 'GET' && detailId) {
            const existing = stored.find((workflow) => workflow.id === detailId)
            return existing
                ? { status: 200, payload: serverize(existing) }
                : { status: 404, payload: { detail: 'Not found.' } }
        }

        if (request.method === 'GET') {
            const search = (url.searchParams.get('search') ?? '').toLowerCase()
            const results = stored
                .filter((workflow) => workflow.name.toLowerCase().includes(search))
                .map((workflow) => ({ id: workflow.id, name: workflow.name, status: workflow.body.status }))
            return { status: 200, payload: { count: results.length, next: null, previous: null, results } }
        }

        if (request.method === 'POST') {
            const created: StoredWorkflow = {
                id: `0199c0de-0000-0000-0000-00000000000${nextId++}`,
                name: String((body as Record<string, unknown>).name),
                version: 1,
                body: body as Record<string, unknown>,
            }
            stored.push(created)
            return { status: 201, payload: serverize(created) }
        }

        if (request.method === 'PATCH') {
            const existing = stored.find((workflow) => workflow.id === detailId)
            if (!existing) {
                return { status: 404, payload: { detail: 'Not found.' } }
            }
            const before = contentOf(existing.body)
            existing.body = { ...existing.body, ...(body as Record<string, unknown>) }
            existing.name = String(existing.body.name)
            if (contentOf(existing.body) !== before) {
                existing.version += 1
            }
            return { status: 200, payload: serverize(existing) }
        }

        return { status: 405, payload: { detail: 'Method not allowed.' } }
    }

    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            const url = new URL(request.url)
            const raw = request.method === 'GET' ? '' : await request.text()
            const body = raw ? JSON.parse(raw) : undefined
            const { status, payload } = respond(request, url, body)
            exchanges.push({
                method: request.method,
                path: `${url.pathname}${url.search}`,
                headers: captureHeaders(request),
                body,
                status,
                response: payload,
            })
            return Response.json(payload, { status })
        },
    })

    return {
        host: `http://localhost:${server.port}`,
        exchanges,
        remove: (id: string) => {
            const at = stored.findIndex((workflow) => workflow.id === id)
            if (at >= 0) {
                stored.splice(at, 1)
            }
        },
        stop: () => void server.stop(true),
    }
}
