// Emits every shape, diffs them, and runs the round trip. Everything printed here
// is copied into EVIDENCE.md unedited.
//
// Output goes through process.stdout.write rather than console.log, because the
// repository's pre-commit formatter deletes a console call.

process.env.CRM_TOKEN = 'placeholder-signing-secret'

import { writeFileSync } from 'node:fs'

import { onboarding as shapeA } from '../example/a-chain.workflow'
import { onboarding as shapeB } from '../example/b-declarative.workflow'
import { onboarding as shapeC } from '../example/c-keyed.workflow'
import { notifyCrm, onPaidPlan, waitThenNotify, welcomeEmail } from '../example/shared'
import { branch, delay, emit, onEvent, path, toSource, WorkflowError, type Path, type WorkflowDefinition } from '../sdk'

function out(text: string): void {
    process.stdout.write(`${text}\n`)
}

function heading(text: string): void {
    out(`\n${'='.repeat(78)}\n${text}\n${'='.repeat(78)}`)
}

function json(value: unknown): string {
    return JSON.stringify(value, null, 2)
}

/** A line diff good enough for evidence. */
function diff(left: string, leftName: string, right: string, rightName: string): string {
    const a = left.split('\n')
    const b = right.split('\n')
    const lines: string[] = []
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] === b[i]) {
            continue
        }
        if (a[i] !== undefined) {
            lines.push(`- ${leftName}:${i + 1} ${a[i]}`)
        }
        if (b[i] !== undefined) {
            lines.push(`+ ${rightName}:${i + 1} ${b[i]}`)
        }
    }
    return lines.length === 0 ? '(identical)' : lines.join('\n')
}

const defA = shapeA.emit()
const defB = shapeB.emit()
const defC = shapeC.emit()

heading('1. Shape A (chain with step values): emitted definition')
out(json(defA))

heading('2. Shape A vs shape B (declarative record)')
out(diff(json(defA), 'A', json(defB), 'B'))

heading('3. Shape A vs shape C (keyed registry)')
out(diff(json(defA), 'A', json(defC), 'C'))

heading('4. Shape C: emitted definition (ids only)')
out(json(defC.actions.map((action) => ({ id: action.id, type: action.type, name: action.name }))))

heading('5. A reused step value produces two action ids')
const resultA = shapeA.emitWith('positional')
for (const [step, ids] of resultA.placements) {
    out(`${step.kind.padEnd(8)} ${JSON.stringify(step.name).padEnd(34)} -> ${JSON.stringify(ids)}`)
}

heading('6. Same source, slug id strategy instead of positional')
out(diff(json(defA), 'positional', json(shapeA.emitWith('slug').definition), 'slug'))

heading('7. The reused webhook carries the same resolved secret under both ids')
for (const action of defA.actions) {
    if (action.type === 'function' && 'signing_secret' in action.config.inputs) {
        out(`${action.id}: signing_secret = ${JSON.stringify(action.config.inputs.signing_secret)}`)
    }
}

heading('8. An unset secret fails before anything is sent')
try {
    emit({
        name: 'Secret check',
        trigger: onEvent({ event: 'user signed up' }),
        steps: path(notifyCrm),
        exit: { reason: 'done' },
        env: {},
    })
} catch (error) {
    out((error as WorkflowError).print())
}

heading('9. Inserting a step in front: what moves under each id strategy')
const tail: Path = path(
    delay('1d', { name: 'Wait a day' }),
    branch({
        name: 'Which plan?',
        branches: [{ name: 'Paid plan', when: onPaidPlan, then: path(welcomeEmail, notifyCrm) }],
    })
)
const withInsert: Path = path(delay('1h', { name: 'New first delay' }), ...tail)
const before = emit({
    name: 'Onboarding nudge (composable steps)',
    trigger: onEvent({ event: 'user signed up' }),
    steps: tail,
    exit: { reason: 'Onboarding nudge finished' },
}).definition.actions.map((action) => action.id)
out(`before the insert, positional ${JSON.stringify(before)}`)
for (const strategy of ['positional', 'slug'] as const) {
    const ids = emit({
        name: 'Onboarding nudge (composable steps)',
        trigger: onEvent({ event: 'user signed up' }),
        steps: withInsert,
        exit: { reason: 'Onboarding nudge finished' },
        idStrategy: strategy,
    }).definition.actions.map((action) => action.id)
    out(`after the insert,  ${strategy.padEnd(11)} ${JSON.stringify(ids)}`)
}

heading('10. Round trip: definition -> source -> definition')
const generated = toSource(defB)
out(generated)
writeFileSync(`${import.meta.dir}/generated.workflow.ts`, generated)
const reloaded = (await import('./generated.workflow')) as { onboarding: { emit(): WorkflowDefinition } }
const defRoundTrip = reloaded.onboarding.emit()
out('diff against the definition it was generated from:')
out(diff(json(defB), 'original', json(defRoundTrip), 'roundtrip'))

heading('11. Sub-path reuse: the names in the reused sub-path value')
out(json(waitThenNotify.map((step) => step.name)))
