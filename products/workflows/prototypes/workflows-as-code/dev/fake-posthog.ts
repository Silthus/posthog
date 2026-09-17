// A stand-in for the hog_flows API, so the push path can be exercised without a
// PostHog instance. It records every exchange and answers with the shape the real
// endpoints return. It is not a fixture of production behavior: it is a mirror that
// lets the transcript show what the SDK sent and what it did with the reply.

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
    body: Record<string, unknown>
}

export interface FakePostHog {
    readonly host: string
    readonly exchanges: Exchange[]
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

export function startFakePostHog(): FakePostHog {
    const exchanges: Exchange[] = []
    const stored: StoredWorkflow[] = []
    let nextId = 1

    function respond(request: Request, url: URL, body: unknown): { status: number; payload: unknown } {
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
                body: body as Record<string, unknown>,
            }
            stored.push(created)
            return { status: 201, payload: { id: created.id, ...created.body, version: 1 } }
        }

        if (request.method === 'PATCH') {
            const id = url.pathname.split('/').filter(Boolean).pop()!
            const existing = stored.find((workflow) => workflow.id === id)
            if (!existing) {
                return { status: 404, payload: { detail: 'Not found.' } }
            }
            existing.body = { ...existing.body, ...(body as Record<string, unknown>) }
            existing.name = String(existing.body.name)
            return { status: 200, payload: { id: existing.id, ...existing.body, version: 2 } }
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
        stop: () => void server.stop(true),
    }
}
