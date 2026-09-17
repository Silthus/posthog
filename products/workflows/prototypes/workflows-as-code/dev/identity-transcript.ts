// The four runs that make up the identity story, against the fake endpoint.
//
// It works on a scratch copy of the example file rather than the example itself, and
// it runs that copy as a real child process, because the write-back finds its target
// from the entrypoint bun started. Faking the entrypoint would fake the thing under test.

import { startFakePostHog } from './fake-posthog'

const ORIGINAL = 'example/onboarding.workflow.ts'
const SCRATCH = 'example/scratch.workflow.ts'

const fake = startFakePostHog()
let seen = 0

async function runScratch(label: string): Promise<void> {
    const child = Bun.spawn(['bun', 'run', SCRATCH, '--push'], {
        env: {
            ...process.env,
            POSTHOG_API_KEY: 'phx_REPLACE_ME',
            POSTHOG_HOST: fake.host,
            POSTHOG_PROJECT_ID: '2',
        },
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
    await child.exited

    console.log(`--- ${label} ---`)
    console.log(`$ bun run ${SCRATCH} --push`)
    for (const exchange of fake.exchanges.slice(seen)) {
        console.log(`  ${exchange.method} ${exchange.path} -> ${exchange.status}`)
    }
    seen = fake.exchanges.length
    for (const line of `${out}${err}`.trimEnd().split('\n')) {
        console.log(`  ${line.replace(fake.host, 'https://posthog.example.com')}`)
    }
    console.log(`  exit ${child.exitCode}`)
    console.log('')
}

async function showDiff(): Promise<void> {
    const diff = Bun.spawn(['diff', '-u', ORIGINAL, SCRATCH], { stdout: 'pipe' })
    console.log(`--- diff of the file after the create ---`)
    console.log((await new Response(diff.stdout).text()).trimEnd())
    await diff.exited
    console.log('')
}

await Bun.write(SCRATCH, await Bun.file(ORIGINAL).text())

await runScratch('1. first run: creates the workflow and writes the id back')
await showDiff()
await runScratch('2. rerun with the id in the file: nothing changed, so nothing is written')

const edited = (await Bun.file(SCRATCH).text()).replace(".delay('1d'", ".delay('2d'")
await Bun.write(SCRATCH, edited)
await runScratch('3. the delay changed from 1d to 2d in the file')

const created = fake.exchanges.find((exchange) => exchange.method === 'POST')?.response as { id: string }
fake.remove(created.id)
await runScratch('4. the workflow was deleted in PostHog, and the file still owns its id')

await Bun.file(SCRATCH).delete()
fake.stop()
