import { DateTime } from 'luxon'
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
const POLL_INTERVAL_SECONDS = 2

const MAX_THROTTLE_BOUNCES = 10
const GIVE_UP_SECONDS = 90
const MAX_POLLS = 50
// A blip is worth waiting out; a gateway that is still down three tries later is not going to answer
// inside this step's budget, and the run log should say so rather than time the generation out.
const MAX_TRANSPORT_FAILURES = 3

// A retrieve for a record that no longer exists answers DRF's own 404 body, which carries no message
// of its own. Neither does a throttle, so both messages are written here rather than read off the wire.
const FEATURE_UNAVAILABLE_MESSAGE =
    'Generate text is not available for this project. Contact support to request access.'
const THROTTLED_MESSAGE = 'Text generation is busy right now, so this step could not run. Try again in a few minutes.'
const DEADLINE_EXCEEDED_MESSAGE = `Generation ran longer than ${GIVE_UP_SECONDS} seconds and stopped. Try a shorter prompt or a faster model.`
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
 * when no generation was ever accepted.
 */
type LlmGenerationMetadata = {
    generationId?: string
    startedAt: string
    polls: number
    throttles: number
    transportFailures?: number
}

/**
 * Whether this generation has used up its budget. Wall-clock time is the real bound; the iteration
 * count is the backstop for a run whose reschedules land faster than the interval asks for.
 */
function isSpent(metadata: LlmGenerationMetadata): boolean {
    if (metadata.polls >= MAX_POLLS) {
        return true
    }
    // The wall clock measures a generation, so it cannot run before one exists. A step that has only
    // been throttled so far has not run long, it has not run at all, and its bound is the bounce cap -
    // one Retry-After off the submit throttle can be a whole minute on its own.
    if (!metadata.generationId) {
        return false
    }
    return DateTime.utc().diff(DateTime.fromISO(metadata.startedAt), 'seconds').seconds > GIVE_UP_SECONDS
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
        const params = invocation.queueParameters
        if (params?.type !== 'llmGenerate') {
            throw new Error('Bad invocation')
        }

        const result = createInvocationResult<CyclotronJobInvocationHogFunction>(invocation, {}, { finished: true })

        if (isTest) {
            return await this.executePreview(invocation, params, result)
        }

        const metadata = invocation.queueMetadata as LlmGenerationMetadata | undefined
        const startedAt = metadata?.startedAt ?? DateTime.utc().toISO()!

        if (metadata && isSpent(metadata)) {
            return this.fail(result, 'deadline_exceeded', DEADLINE_EXCEEDED_MESSAGE, startedAt)
        }

        const outcome = await this.step(invocation, params, metadata?.generationId)

        if (outcome.kind === 'failed') {
            return this.fail(result, outcome.code, outcome.message, startedAt)
        }
        if (outcome.kind === 'succeeded') {
            return this.succeed(result, outcome.envelope, startedAt)
        }
        if (outcome.kind === 'unreachable') {
            if ((metadata?.transportFailures ?? 0) >= MAX_TRANSPORT_FAILURES) {
                return this.fail(result, 'gateway_unavailable', GATEWAY_UNAVAILABLE_MESSAGE, startedAt)
            }
            this.reschedule(result, invocation, {
                generationId: outcome.generationId,
                startedAt,
                polls: (metadata?.polls ?? 0) + 1,
                throttles: metadata?.throttles ?? 0,
                transportFailures: (metadata?.transportFailures ?? 0) + 1,
            })
            return result
        }
        if (outcome.throttled && (metadata?.throttles ?? 0) >= MAX_THROTTLE_BOUNCES) {
            return this.fail(result, 'throttled', THROTTLED_MESSAGE, startedAt)
        }

        const accepted = outcome.generationId && !metadata?.generationId
        this.reschedule(
            result,
            invocation,
            {
                generationId: outcome.generationId,
                // The give-up budget belongs to the generation, so its clock starts when one is
                // accepted rather than when a step that spent a minute in the throttle first tried.
                startedAt: accepted ? DateTime.utc().toISO()! : startedAt,
                polls: (metadata?.polls ?? 0) + 1,
                throttles: (metadata?.throttles ?? 0) + (outcome.throttled ? 1 : 0),
                transportFailures: metadata?.transportFailures ?? 0,
            },
            outcome.waitSeconds
        )
        return result
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
        let generationId: string | undefined

        for (;;) {
            const outcome = await this.step(invocation, params, generationId)

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
        generationId?: string
    ): Promise<StepOutcome> {
        let response: FetchResponse
        try {
            response = generationId
                ? await this.retrieve(invocation, generationId)
                : await this.submit(invocation, params)
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
        params: CyclotronInvocationQueueParametersLlmGenerateType
    ): Promise<FetchResponse> {
        const hogFlow = (invocation as { hogFlow?: HogFlow }).hogFlow

        return await this.fetch(`${this.config.siteUrl}/api/projects/${invocation.teamId}/workflow_llm_generations/`, {
            method: 'POST',
            timeoutMs: SUBMIT_TIMEOUT_MS,
            headers: await this.authHeaders(invocation.teamId),
            body: JSON.stringify({
                // One invocation id spans a whole flow run; Django separates two Generate text steps
                // of the same run by hashing this payload alongside it. Steps whose configuration is
                // byte-identical therefore share one generation for the run.
                invocation_id: invocation.id,
                hog_flow_id: hogFlow?.id ?? null,
                prompt: params.prompt,
                model: params.model,
                output_fields: params.output_fields,
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
