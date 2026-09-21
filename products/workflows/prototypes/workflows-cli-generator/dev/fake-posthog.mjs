// A stand-in for the hog_flows API, so the push path can be exercised without a PostHog
// instance. No request in this prototype's evidence has ever reached a real PostHog.
//
// It runs as its own process on a fixed port, because the transcript shells out to the CLI
// several times and the state has to survive between invocations.
//
// It copies four behaviors from the real serializer, because change detection is only
// interesting against them: the reply carries the read-only fields the client never sent,
// actions come back with the defaults HogFlowActionSerializer injects, version moves only
// when the stored content changed, and a secret-typed input reads back as {"secret": true}
// rather than its value.

import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 8099)
// Which inputs the stub treats as secret. The real serializer knows from the template's
// inputs_schema; template-webhook marks signing_secret secret: true.
const SECRET_INPUTS = new Set(['signing_secret'])

/** @type {{id: string, name: string, version: number, body: Record<string, unknown>, secrets: Record<string, Record<string, unknown>>}[]} */
const stored = []
let nextId = 1

function stripSecrets(body) {
    const secrets = {}
    const actions = (body.actions ?? []).map((action) => {
        const inputs = action.config?.inputs
        if (!inputs) {
            return action
        }
        const kept = {}
        for (const [key, wrapper] of Object.entries(inputs)) {
            if (SECRET_INPUTS.has(key)) {
                secrets[action.id] = { ...secrets[action.id], [key]: wrapper.value }
                continue
            }
            kept[key] = wrapper
        }
        return { ...action, config: { ...action.config, inputs: kept } }
    })
    return { body: { ...body, actions }, secrets }
}

/** The read shape: stored inputs plus the {"secret": true} placeholder the API returns. */
function serverizeAction(action, secrets) {
    const mine = secrets[action.id]
    const inputs = action.config?.inputs
        ? { ...action.config.inputs, ...Object.fromEntries(Object.keys(mine ?? {}).map((k) => [k, { secret: true }])) }
        : undefined
    const config = inputs ? { ...action.config, inputs } : action.config
    return { description: '', filters: null, ...action, config }
}

function serverize(row) {
    const actions = (row.body.actions ?? []).map((action) => serverizeAction(action, row.secrets))
    const trigger = actions.find((action) => action.type === 'trigger')?.config
    return {
        ...row.body,
        id: row.id,
        actions,
        version: row.version,
        trigger,
        billable_action_types: ['function'],
        action_redirects: {},
        abort_action: null,
        draft: null,
        draft_updated_at: null,
        schedules: [],
        user_access_level: 'editor',
        created_at: '2026-09-21T09:00:00Z',
        updated_at: '2026-09-21T09:00:00Z',
        created_by: { id: 1, uuid: '0199c0de-1111-1111-1111-111111111111', email: 'prototype@example.com' },
    }
}

function contentOf(body) {
    return JSON.stringify({ actions: body.actions ?? [], edges: body.edges ?? [], exit_condition: body.exit_condition })
}

function respond(method, url, body) {
    const segments = url.pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    const detailId = last === 'hog_flows' ? null : last

    // A control route, so the transcript can drift a workflow the way a person would.
    if (method === 'POST' && url.pathname === '/__stub/drift') {
        const row = stored.find((entry) => entry.id === body.id)
        row.body = { ...row.body, ...body.patch }
        row.version += 1
        return { status: 200, payload: serverize(row) }
    }

    // What the project holds, for the transcript's "state after the command" line.
    if (method === 'GET' && url.pathname === '/__stub/state') {
        return {
            status: 200,
            payload: stored.map((row) => ({
                id: row.id,
                name: row.name,
                version: row.version,
                status: row.body.status,
                secrets: Object.fromEntries(
                    Object.entries(row.secrets).map(([actionId, inputs]) => [
                        actionId,
                        Object.fromEntries(
                            Object.entries(inputs).map(([key, value]) => [key, `len=${String(value).length}`])
                        ),
                    ])
                ),
            })),
        }
    }

    if (method === 'GET' && detailId) {
        const row = stored.find((entry) => entry.id === detailId)
        return row ? { status: 200, payload: serverize(row) } : { status: 404, payload: { detail: 'Not found.' } }
    }
    if (method === 'GET') {
        const search = (url.searchParams.get('search') ?? '').toLowerCase()
        const results = stored
            .filter((row) => row.name.toLowerCase().includes(search))
            .map((row) => ({ id: row.id, name: row.name, status: row.body.status }))
        return { status: 200, payload: { count: results.length, next: null, previous: null, results } }
    }
    if (method === 'POST') {
        const { body: clean, secrets } = stripSecrets(body)
        const row = {
            id: `0199c0de-0000-0000-0000-00000000000${nextId++}`,
            name: String(body.name),
            version: 1,
            body: clean,
            secrets,
        }
        stored.push(row)
        return { status: 201, payload: serverize(row) }
    }
    if (method === 'PATCH') {
        const row = stored.find((entry) => entry.id === detailId)
        if (!row) {
            return { status: 404, payload: { detail: 'Not found.' } }
        }
        const { body: clean, secrets } = stripSecrets(body)
        const before = contentOf(row.body)
        row.body = { ...row.body, ...clean }
        row.secrets = { ...row.secrets, ...secrets }
        row.name = String(row.body.name)
        if (contentOf(row.body) !== before) {
            row.version += 1
        }
        return { status: 200, payload: serverize(row) }
    }
    return { status: 405, payload: { detail: 'Method not allowed.' } }
}

createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
        const raw = Buffer.concat(chunks).toString()
        const url = new URL(request.url, `http://localhost:${PORT}`)
        const { status, payload } = respond(request.method, url, raw ? JSON.parse(raw) : undefined)
        console.error(`stub: ${request.method} ${url.pathname}${url.search} -> ${status}`)
        response.writeHead(status, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(payload))
    })
}).listen(PORT, () => console.error(`stub: listening on http://localhost:${PORT}`))
