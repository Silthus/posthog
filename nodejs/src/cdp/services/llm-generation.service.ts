import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import { Counter, Histogram } from 'prom-client'

import { CyclotronInvocationQueueParametersLlmGenerateType } from '~/cdp/schema/cyclotron'
import { HogFlow } from '~/cdp/schema/hogflow'
import { FetchOptions, FetchResponse } from '~/common/utils/request'
import { TeamManager } from '~/common/utils/team-manager'
import { delay } from '~/common/utils/utils'

import type { CyclotronJobInvocationHogFunction, CyclotronJobInvocationResult } from '../types'
import { createAddLogFunction } from '../utils'
import { createInvocationResult } from '../utils/invocation-utils'

// Set explicitly rather than inherited: the generation itself runs in Celery, so both calls here are
// short control-plane requests and must not wait out a destination-length fetch timeout.
const SUBMIT_TIMEOUT_MS = 5000
const RETRIEVE_TIMEOUT_MS = 3000
// Only the inline preview loop and a transport retry wait this short. A queued job parks on the
// backup ladder instead and is normally woken by the finished event long before the first mark.
const POLL_INTERVAL_SECONDS = 2

// The wake event is the transport; these polls are the safety net for a swallowed error anywhere
// along it (a dead worker, a dropped event, a matcher that was down). Measured from acceptance.
// A generation still pending at the last mark is failed as deadline_exceeded: the backend's own
// 60-second budget means by then the outcome was lost, not still coming.
const BACKUP_POLL_MARKS_SECONDS = [60, 180, 300]

const MAX_THROTTLE_BOUNCES = 10
// Backstop against runaway execution, not the schedule: the ladder bounds a healthy run to a
// handful of executions, and this only stops a job whose reschedules misfire faster than asked.
const MAX_EXECUTIONS = 20
// A blip is worth waiting out; a gateway that is still down three tries later is not going to answer
// inside this step's budget, and the run log should say so rather than time the generation out.
const MAX_TRANSPORT_FAILURES = 3

// Produced by the Django task when a generation reaches a terminal state. The subscription matcher
// consumes it and wakes the parked job; the Python side pins the same name and property keys.
export const WORKFLOW_LLM_GENERATION_FINISHED_EVENT = '$workflows_llm_generation_finished'

// A retrieve for a record that no longer exists answers DRF's own 404 body, which carries no message
// of its own. Neither does a throttle, so both messages are written here rather than read off the wire.
const FEATURE_UNAVAILABLE_MESSAGE =
    'Generate text is not available for this project. Contact support to request access.'
const THROTTLED_MESSAGE = 'Text generation is busy right now, so this step could not run. Try again in a few minutes.'
const DEADLINE_EXCEEDED_MESSAGE = `Generation did not report a result within ${
    BACKUP_POLL_MARKS_SECONDS[BACKUP_POLL_MARKS_SECONDS.length - 1] / 60
} minutes and stopped. Run the workflow again, or try a faster model.`
const GATEWAY_UNAVAILABLE_MESSAGE = 'Could not reach PostHog to run this step. Try again later.'
const PREVIEW_DEADLINE_SECONDS = 25
const PREVIEW_DEADLINE_MESSAGE = `The preview stopped after ${PREVIEW_DEADLINE_SECONDS} seconds. The step gets longer when the workflow runs. Try a shorter prompt or a faster model.`

const llmGenerationStartedCounter = new Counter({
    name: 'cdp_llm_generation_started_total',
    help: 'Text generations accepted by the workflows generation endpoint.',
})

const llmGenerationFinishedCounter = new Counter({
    name: 'cdp_llm_generation_finished_total',
    help: 'Text generations that returned a result to the step.',
})

const llmGenerationFailedCounter = new Counter({
    name: 'cdp_llm_generation_failed_total',
    help: 'Text generations that ended without a result, by error code.',
    labelNames: ['code'],
})

const llmGenerationDurationSeconds = new Histogram({
    name: 'cdp_llm_generation_duration_seconds',
    help: 'Time from the accepted generation to a terminal outcome, spanning every reschedule in between.',
    buckets: [1, 2, 5, 10, 20, 30, 60, 90],
})

export type LlmGenerationFetch = (url: string, options: FetchOptions) => Promise<FetchResponse>

export interface LlmGenerationConfig {
    siteUrl: string
}

/**
 * Poll state, carried across reschedules on the invocation's queue metadata. `generationId` is absent
 * until a submit is accepted, and its absence is what tells the next run to submit rather than poll.
 * `polls` counts every execution this step has spent, submits included, so it bounds the loop even
 * when no generation was ever accepted. `wakeToken` is minted on the first execution and sent with
 * every submit; the finished event echoes it, and the subscription matcher only wakes a parked job
 * whose stored metadata carries the same value.
 */
export type LlmGenerationMetadata = {
    generationId?: string
    wakeToken?: string
    startedAt: string
    polls: number
    throttles: number
    transportFailures?: number
}

/** The invocation as this service runs it: parameters proven `llmGenerate`, metadata typed. */
type LlmGenerationInvocation = CyclotronJobInvocationHogFunction & {
    queueParameters: CyclotronInvocationQueueParametersLlmGenerateType
    queueMetadata?: LlmGenerationMetadata
}

/**
 * Backstop only. The backup ladder is what bounds a healthy run; this stops a job whose
 * reschedules or wakes misfire faster than the schedule asks for.
 */
function hasExhaustedInvocationBudget(metadata: LlmGenerationMetadata): boolean {
    return metadata.polls >= MAX_EXECUTIONS
}

/**
 * Seconds until the next backup mark, measured from acceptance. Undefined means the ladder is
 * exhausted: a generation still pending past the last mark has lost its outcome for good.
 */
function secondsUntilNextBackupPoll(startedAt: string): number | undefined {
    const elapsed = DateTime.utc().diff(DateTime.fromISO(startedAt), 'seconds').seconds
    const mark = BACKUP_POLL_MARKS_SECONDS.find((m) => m > elapsed)
    return mark === undefined ? undefined : mark - elapsed
}

function observeDuration(startedAt: string): void {
    llmGenerationDurationSeconds.observe(DateTime.utc().diff(DateTime.fromISO(startedAt), 'seconds').seconds)
}

/** The throttle sets an explicit Retry-After in seconds; fall back to the poll interval if it did not. */
function retryAfterSeconds(response: FetchResponse): number {
    const seconds = Number(response.headers?.['retry-after'])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : POLL_INTERVAL_SECONDS
}

type GenerationResult = { text: string; fields: Record<string, string> }

type GenerationEnvelope = {
    id: string | null
    status: 'pending' | 'succeeded' | 'failed'
    result: GenerationResult | null
    error: { code: string; message: string } | null
}

/** What one call to the endpoint says should happen next, independent of which transport asked. */
type StepOutcome =
    | { kind: 'pending'; generationId?: string; waitSeconds: number; throttled: boolean }
    | { kind: 'unreachable'; generationId?: string }
    | { kind: 'succeeded'; envelope: GenerationResult }
    | { kind: 'failed'; code: string; message: string }

/**
 * Runs a workflow "Generate text" step against the Django generation endpoint.
 *
 * One execution is one short HTTP call - a submit, or a single retrieve. A generation that is still
 * running comes back as a reschedule rather than a wait, so the worker is never parked on an LLM.
 */
export class LlmGenerationService {
    constructor(
        private teamManager: TeamManager,
        private fetch: LlmGenerationFetch,
        private config: LlmGenerationConfig
    ) {}

    async execute(
        invocation: CyclotronJobInvocationHogFunction,
        isTest: boolean
    ): Promise<CyclotronJobInvocationResult<CyclotronJobInvocationHogFunction>> {
        if (invocation.queueParameters?.type !== 'llmGenerate') {
            throw new Error('Bad invocation')
        }
        const typedInvocation = invocation as LlmGenerationInvocation
        const params = typedInvocation.queueParameters

        const result = createInvocationResult<CyclotronJobInvocationHogFunction>(invocation, {}, { finished: true })

        if (isTest) {
            return await this.executePreview(typedInvocation, params, result)
        }

        const metadata = typedInvocation.queueMetadata
        const startedAt = metadata?.startedAt ?? DateTime.utc().toISO()!
        // Minted before the first submit and carried through every reschedule, so a submit retried
        // after a transport failure lands with the same token the stored record will echo back.
        const wakeToken = metadata?.wakeToken ?? randomUUID()

        if (metadata && hasExhaustedInvocationBudget(metadata)) {
            return this.fail(result, 'deadline_exceeded', DEADLINE_EXCEEDED_MESSAGE, startedAt)
        }

        const outcome = await this.step(typedInvocation, params, wakeToken, metadata?.generationId)

        switch (outcome.kind) {
            case 'failed':
                return this.fail(result, outcome.code, outcome.message, startedAt)
            case 'succeeded':
                return this.succeed(result, outcome.envelope, startedAt)
            case 'unreachable': {
                if ((metadata?.transportFailures ?? 0) >= MAX_TRANSPORT_FAILURES) {
                    return this.fail(result, 'gateway_unavailable', GATEWAY_UNAVAILABLE_MESSAGE, startedAt)
                }
                this.reschedule(result, invocation, {
                    generationId: outcome.generationId,
                    wakeToken,
                    startedAt,
                    polls: (metadata?.polls ?? 0) + 1,
                    throttles: metadata?.throttles ?? 0,
                    transportFailures: (metadata?.transportFailures ?? 0) + 1,
                })
                return result
            }
            case 'pending': {
                if (outcome.throttled && (metadata?.throttles ?? 0) >= MAX_THROTTLE_BOUNCES) {
                    return this.fail(result, 'throttled', THROTTLED_MESSAGE, startedAt)
                }

                const accepted = outcome.generationId && !metadata?.generationId
                // The ladder belongs to the generation, so its clock starts when one is accepted
                // rather than when a step that spent a minute in the throttle first tried.
                const ladderStartedAt = accepted ? DateTime.utc().toISO()! : startedAt
                // A throttle bounce keeps the Retry-After it was given; an accepted generation
                // parks until its next backup mark and normally wakes on the finished event first.
                const waitSeconds = outcome.throttled
                    ? outcome.waitSeconds
                    : secondsUntilNextBackupPoll(ladderStartedAt)
                if (waitSeconds === undefined) {
                    return this.fail(result, 'deadline_exceeded', DEADLINE_EXCEEDED_MESSAGE, startedAt)
                }

                this.reschedule(
                    result,
                    invocation,
                    {
                        generationId: outcome.generationId,
                        wakeToken,
                        startedAt: ladderStartedAt,
                        polls: (metadata?.polls ?? 0) + 1,
                        throttles: (metadata?.throttles ?? 0) + (outcome.throttled ? 1 : 0),
                        // A poll that reached the endpoint proves the gateway is back, so the next
                        // blip gets a full retry budget rather than the tail of an old one.
                        transportFailures: 0,
                    },
                    waitSeconds
                )
                return result
            }
        }
    }

    /**
     * The editor preview runs in the API process and is never dequeued again, so it waits the
     * generation out in place, bounded by what a person will sit in front of.
     */
    private async executePreview(
        invocation: CyclotronJobInvocationHogFunction,
        params: CyclotronInvocationQueueParametersLlmGenerateType,
        result: CyclotronJobInvocationResult<CyclotronJobInvocationHogFunction>
    ): Promise<CyclotronJobInvocationResult<CyclotronJobInvocationHogFunction>> {
        const startedAt = DateTime.utc().toISO()!
        const deadline = DateTime.utc().plus({ seconds: PREVIEW_DEADLINE_SECONDS })
        const wakeToken = randomUUID()
        let generationId: string | undefined

        for (;;) {
            const outcome = await this.step(invocation, params, wakeToken, generationId)

            if (outcome.kind === 'failed') {
                return this.fail(result, outcome.code, outcome.message, startedAt)
            }
            if (outcome.kind === 'succeeded') {
                return this.succeed(result, outcome.envelope, startedAt)
            }

            generationId = outcome.generationId
            const waitSeconds = outcome.kind === 'unreachable' ? POLL_INTERVAL_SECONDS : outcome.waitSeconds
            if (DateTime.utc().plus({ seconds: waitSeconds }) >= deadline) {
                return this.previewExpired(result, startedAt)
            }
            await delay(waitSeconds * 1000)
        }
    }

    /** One HTTP call - a submit, or a single retrieve - read as what the caller should do next. */
    private async step(
        invocation: CyclotronJobInvocationHogFunction,
        params: CyclotronInvocationQueueParametersLlmGenerateType,
        wakeToken: string,
        generationId?: string
    ): Promise<StepOutcome> {
        let response: FetchResponse
        try {
            response = generationId
                ? await this.retrieve(invocation, generationId)
                : await this.submit(invocation, params, wakeToken)
        } catch {
            // A timeout, a reset connection or a DNS failure says nothing about the generation, which
            // is running in Celery either way. Coming back later is the only answer that does not throw
            // away work a customer is already paying for.
            return { kind: 'unreachable', generationId }
        }

        // A load balancer answers a 502 in HTML, so the body is read as best effort and every arm
        // below has to hold without it.
        const envelope = await response
            .json()
            .then((body) => body as GenerationEnvelope)
            .catch(() => undefined)

        if (response.status === 404) {
            // The flag is off for this project, or the record is gone. Neither becomes true by polling.
            return {
                kind: 'failed',
                code: 'feature_unavailable',
                message: envelope?.error?.message ?? FEATURE_UNAVAILABLE_MESSAGE,
            }
        }
        if (response.status === 429) {
            return { kind: 'pending', generationId, waitSeconds: retryAfterSeconds(response), throttled: true }
        }
        if (response.status === 202) {
            if (!generationId) {
                llmGenerationStartedCounter.inc()
            }
            return {
                kind: 'pending',
                generationId: envelope?.id ?? generationId,
                waitSeconds: POLL_INTERVAL_SECONDS,
                throttled: false,
            }
        }
        // Anything that is not an outright success is a failure, so a 5xx or an unrecognized body can
        // never reach the step as an empty envelope and let the next step run on unset variables.
        if (envelope?.status !== 'succeeded' || !envelope.result) {
            return {
                kind: 'failed',
                code: envelope?.error?.code ?? 'gateway_unavailable',
                message: envelope?.error?.message ?? GATEWAY_UNAVAILABLE_MESSAGE,
            }
        }
        return { kind: 'succeeded', envelope: envelope.result }
    }

    private succeed(
        result: CyclotronJobInvocationResult<CyclotronJobInvocationHogFunction>,
        envelope: GenerationResult,
        startedAt: string
    ): CyclotronJobInvocationResult<CyclotronJobInvocationHogFunction> {
        result.invocation.state.vmState!.stack.push(envelope)
        result.execResult = envelope
        llmGenerationFinishedCounter.inc()
        observeDuration(startedAt)
        return result
    }

    /**
     * The preview ran out of the window a person will sit in front of. The generation itself is still
     * running and the step gets the full budget in a real run, so this leaves `result.error` unset:
     * it is something to say about the preview, not a verdict on the node.
     */
    private previewExpired(
        result: CyclotronJobInvocationResult<CyclotronJobInvocationHogFunction>,
        startedAt: string
    ): CyclotronJobInvocationResult<CyclotronJobInvocationHogFunction> {
        createAddLogFunction(result.logs)('warn', PREVIEW_DEADLINE_MESSAGE)
        llmGenerationFailedCounter.labels({ code: 'preview_expired' }).inc()
        observeDuration(startedAt)
        return result
    }

    /**
     * Terminal failure. The code is the vocabulary a customer can act on and search for, so it stays
     * verbatim in the run log with the human sentence beside it; `result.error` is what makes the step
     * inherit its configured error handling.
     */
    private fail(
        result: CyclotronJobInvocationResult<CyclotronJobInvocationHogFunction>,
        code: string,
        message: string,
        startedAt: string
    ): CyclotronJobInvocationResult<CyclotronJobInvocationHogFunction> {
        const text = `Could not generate text (${code}). ${message}`
        createAddLogFunction(result.logs)('error', text)
        result.error = new Error(text)
        llmGenerationFailedCounter.labels({ code }).inc()
        observeDuration(startedAt)
        return result
    }

    private async authHeaders(teamId: number): Promise<Record<string, string>> {
        const team = await this.teamManager.getTeam(teamId)
        if (!team?.secret_api_token) {
            throw new Error(`Team ${teamId} has no secret API token configured`)
        }
        return { 'Content-Type': 'application/json', Authorization: `Bearer ${team.secret_api_token}` }
    }

    private async retrieve(
        invocation: CyclotronJobInvocationHogFunction,
        generationId: string
    ): Promise<FetchResponse> {
        return await this.fetch(
            `${this.config.siteUrl}/api/projects/${invocation.teamId}/workflow_llm_generations/${generationId}/`,
            {
                method: 'GET',
                timeoutMs: RETRIEVE_TIMEOUT_MS,
                headers: await this.authHeaders(invocation.teamId),
            }
        )
    }

    private async submit(
        invocation: CyclotronJobInvocationHogFunction,
        params: CyclotronInvocationQueueParametersLlmGenerateType,
        wakeToken: string
    ): Promise<FetchResponse> {
        const hogFlow = (invocation as { hogFlow?: HogFlow }).hogFlow

        return await this.fetch(`${this.config.siteUrl}/api/projects/${invocation.teamId}/workflow_llm_generations/`, {
            method: 'POST',
            timeoutMs: SUBMIT_TIMEOUT_MS,
            headers: await this.authHeaders(invocation.teamId),
            body: JSON.stringify({
                // One invocation id spans a whole flow run; Django separates two Generate text steps
                // of the same run by hashing this payload alongside it. Steps whose configuration is
                // byte-identical therefore share one generation for the run. The invocation id is
                // also the cyclotron job id, which is how the finished event finds the parked job.
                invocation_id: invocation.id,
                hog_flow_id: hogFlow?.id ?? null,
                prompt: params.prompt,
                model: params.model,
                output_fields: params.output_fields,
                // The dedupe hash excludes this, so a token minted after a lost submit still joins
                // the generation the first submit created (whose stored token then wins).
                wake_token: wakeToken,
            }),
        })
    }

    private reschedule(
        result: CyclotronJobInvocationResult<CyclotronJobInvocationHogFunction>,
        invocation: CyclotronJobInvocationHogFunction,
        metadata: LlmGenerationMetadata,
        inSeconds: number = POLL_INTERVAL_SECONDS
    ): void {
        // createInvocationResult clears all of these. Restoring the parameters is what makes the next
        // dequeue re-enter this service instead of resuming the hog VM on an empty stack.
        result.invocation.queueParameters = invocation.queueParameters
        result.invocation.queueMetadata = metadata
        result.invocation.queueScheduledAt = DateTime.utc().plus({ seconds: inSeconds })
        result.finished = false
    }
}
