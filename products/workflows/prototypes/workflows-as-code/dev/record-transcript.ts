// Runs the example twice against the fake API and prints the wire-level transcript that
// goes into EVIDENCE.md: what the SDK sends, which headers it sends, and what comes back.
//
// It passes no source file, so the example on disk is never written to and the second run
// has to find the workflow by name the way a file with no id yet does.

import { onboarding } from '../example/onboarding.workflow'
import { push } from '../sdk'
import { startFakePostHog } from './fake-posthog'

function summarizeRequest(body: unknown): string {
    if (body === undefined) {
        return '(no body)'
    }
    const definition = body as { name?: string; status?: string; actions?: unknown[]; edges?: unknown[] }
    return `{name: ${JSON.stringify(definition.name)}, status: ${JSON.stringify(definition.status)}, actions: ${definition.actions?.length}, edges: ${definition.edges?.length}}`
}

function summarizeResponse(payload: unknown): string {
    const body = payload as { id?: string; count?: number; version?: number; results?: { name?: string }[] }
    if (body.results) {
        return `{count: ${body.count}, results: ${JSON.stringify(body.results.map((row) => row.name))}}`
    }
    return `{id: ${JSON.stringify(body.id)}, version: ${body.version}, ...whole definition echoed}`
}

const fake = startFakePostHog()
const config = { apiKey: 'phx_REPLACE_ME', host: fake.host, projectId: '2' }
let seen = 0

for (const label of ['first run (create path)', 'second run (matched by name, nothing changed)']) {
    const result = await push(onboarding.emit(), config)
    console.log(`--- ${label} ---`)
    for (const exchange of fake.exchanges.slice(seen)) {
        console.log(`${exchange.method} ${exchange.path}`)
        console.log(`  headers  ${JSON.stringify(exchange.headers)}`)
        console.log(`  body     ${summarizeRequest(exchange.body)}`)
        console.log(`  <- ${exchange.status} ${summarizeResponse(exchange.response)}`)
    }
    seen = fake.exchanges.length
    console.log(`result: ${result.action} ${result.id} (version ${result.version})`)
    console.log(`url:    ${result.url}`)
    console.log('')
}

fake.stop()
