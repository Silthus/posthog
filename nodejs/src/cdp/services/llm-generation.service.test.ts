import { DateTime } from 'luxon'

import { createExampleInvocation, createHogFunction } from '~/cdp/_tests/fixtures'
import { CyclotronJobInvocationHogFunction } from '~/cdp/types'
import { parseJSON } from '~/common/utils/json-parse'
import { FetchResponse } from '~/common/utils/request'

import { LlmGenerationService } from './llm-generation.service'

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}): FetchResponse =>
    ({
        status,
        headers,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
        dump: () => Promise.resolve(),
    }) as FetchResponse

const createLlmInvocation = (): CyclotronJobInvocationHogFunction => {
    const invocation = createExampleInvocation(
        createHogFunction({ name: 'Generate text', template_id: 'template-workflow-llm' })
    )
    invocation.queueParameters = {
        type: 'llmGenerate',
        prompt: 'Write a subject line',
        model: 'gpt-5-mini',
        output_fields: { subject: 'A subject line' },
    }
    invocation.state.vmState = { stack: [] } as any
    return invocation
}

describe('LlmGenerationService', () => {
    let service: LlmGenerationService
    let mockFetch: jest.Mock

    beforeEach(() => {
        mockFetch = jest.fn()
        service = new LlmGenerationService(
            { getTeam: jest.fn().mockResolvedValue({ id: 1, secret_api_token: 'phx_secret' }) } as any,
            mockFetch,
            { siteUrl: 'http://localhost:8000' }
        )
    })

    it('submits the generation with a wake token and parks until the first backup mark', async () => {
        const invocation = createLlmInvocation()
        mockFetch.mockResolvedValue(jsonResponse(202, { id: 'gen-1', status: 'pending', result: null, error: null }))

        const result = await service.execute(invocation, false)

        expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:8000/api/projects/1/workflow_llm_generations/',
            expect.objectContaining({
                method: 'POST',
                timeoutMs: 5000,
                headers: expect.objectContaining({ Authorization: 'Bearer phx_secret' }),
            })
        )
        const body = parseJSON(mockFetch.mock.calls[0][1].body)
        expect(body).toEqual({
            invocation_id: invocation.id,
            hog_flow_id: null,
            prompt: 'Write a subject line',
            model: 'gpt-5-mini',
            output_fields: { subject: 'A subject line' },
            wake_token: expect.stringMatching(/^[0-9a-f-]{36}$/),
        })

        expect(result.finished).toBe(false)
        // The same parameters have to come back, or the next dequeue resumes the hog VM on an empty
        // stack instead of polling the generation.
        expect(result.invocation.queueParameters).toEqual(invocation.queueParameters)
        // The submitted token must be the one the parked job carries: the matcher compares the
        // finished event's token against this metadata before waking the job.
        expect(result.invocation.queueMetadata).toEqual(
            expect.objectContaining({ generationId: 'gen-1', polls: 1, wakeToken: body.wake_token })
        )
        // Parked at the first backup mark; the finished event normally wakes the job well before it.
        expect(result.invocation.queueScheduledAt!.diff(DateTime.utc(), 'seconds').seconds).toBeCloseTo(60, 0)
        expect(result.invocation.state.vmState!.stack).toEqual([])
    })

    it('keeps the minted wake token across a failed submit, so the retry lands with the same token', async () => {
        const invocation = createLlmInvocation()
        mockFetch.mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))

        const first = await service.execute(invocation, false)
        const minted = (first.invocation.queueMetadata as { wakeToken: string }).wakeToken
        expect(minted).toBeTruthy()

        mockFetch.mockResolvedValueOnce(
            jsonResponse(202, { id: 'gen-1', status: 'pending', result: null, error: null })
        )
        await service.execute(first.invocation as CyclotronJobInvocationHogFunction, false)

        // A token re-minted per attempt would never match the one the first accepted submit stored,
        // and the finished event could then never wake this job.
        expect(parseJSON(mockFetch.mock.calls[1][1].body).wake_token).toBe(minted)
    })

    it.each([
        ['the first mark', 60, 120],
        ['the second mark', 180, 120],
    ])(
        'parks a still-pending generation from %s until the next backup mark',
        async (_case, elapsedSeconds, expectedWait) => {
            const invocation = createLlmInvocation()
            invocation.queueMetadata = {
                generationId: 'gen-1',
                wakeToken: 'token-1',
                startedAt: DateTime.utc().minus({ seconds: elapsedSeconds }).toISO(),
                polls: 2,
                throttles: 0,
            }
            mockFetch.mockResolvedValue(
                jsonResponse(202, { id: 'gen-1', status: 'pending', result: null, error: null })
            )

            const result = await service.execute(invocation, false)

            expect(result.finished).toBe(false)
            expect(result.invocation.queueScheduledAt!.diff(DateTime.utc(), 'seconds').seconds).toBeCloseTo(
                expectedWait,
                0
            )
        }
    )

    it('fails a generation still pending past the last backup mark instead of parking again', async () => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = {
            generationId: 'gen-1',
            wakeToken: 'token-1',
            startedAt: DateTime.utc().minus({ seconds: 301 }).toISO(),
            polls: 3,
            throttles: 0,
        }
        mockFetch.mockResolvedValue(jsonResponse(202, { id: 'gen-1', status: 'pending', result: null, error: null }))

        const result = await service.execute(invocation, false)

        expect(result.finished).toBe(true)
        expect(result.invocation.queueScheduledAt).toBeUndefined()
        expect(result.logs.map((entry) => entry.message)).toEqual([
            'Could not generate text (deadline_exceeded). Generation did not report a result within 5 minutes and stopped. Run the workflow again, or try a faster model.',
        ])
    })

    it('retrieves the pending generation and hands the envelope to the step once it succeeds', async () => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = { generationId: 'gen-1', startedAt: DateTime.utc().toISO(), polls: 0 }
        mockFetch.mockResolvedValue(
            jsonResponse(200, {
                id: 'gen-1',
                status: 'succeeded',
                result: { text: 'Your weekly digest', fields: { subject: 'Your weekly digest' } },
                error: null,
            })
        )

        const result = await service.execute(invocation, false)

        expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:8000/api/projects/1/workflow_llm_generations/gen-1/',
            expect.objectContaining({ method: 'GET', timeoutMs: 3000 })
        )
        const envelope = { text: 'Your weekly digest', fields: { subject: 'Your weekly digest' } }
        expect(result.finished).toBe(true)
        expect(result.invocation.state.vmState!.stack).toEqual([envelope])
        expect(result.execResult).toEqual(envelope)
        expect(result.invocation.queueScheduledAt).toBeUndefined()
    })

    it('fails the step when the generation comes back failed, naming the code in the run log', async () => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = { generationId: 'gen-1', startedAt: DateTime.utc().toISO(), polls: 0 }
        mockFetch.mockResolvedValue(
            jsonResponse(200, {
                id: 'gen-1',
                status: 'failed',
                result: null,
                error: { code: 'quota_exceeded', message: 'Add credits in billing to run this step again.' },
            })
        )

        const result = await service.execute(invocation, false)

        expect(result.finished).toBe(true)
        expect(result.invocation.queueScheduledAt).toBeUndefined()
        // Nothing may reach the stack: a downstream step must not read a variable this run never set.
        expect(result.invocation.state.vmState!.stack).toEqual([])
        expect(result.logs.map((log) => log.message)).toEqual([
            'Could not generate text (quota_exceeded). Add credits in billing to run this step again.',
        ])
        expect(result.error).toBeTruthy()
    })

    it.each([
        [
            'the flag is off',
            {
                id: null,
                status: 'failed',
                result: null,
                error: { code: 'feature_unavailable', message: 'Contact support to request access.' },
            },
            'Could not generate text (feature_unavailable). Contact support to request access.',
        ],
        // A retrieve for a record that is gone answers DRF's own 404 body, which carries no envelope.
        [
            'the generation is gone',
            { detail: 'Not found.' },
            'Could not generate text (feature_unavailable). Generate text is not available for this project. Contact support to request access.',
        ],
    ])('stops on a 404 when %s rather than polling a generation that will never exist', async (_case, body, log) => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = { generationId: 'gen-1', startedAt: DateTime.utc().toISO(), polls: 0 }
        mockFetch.mockResolvedValue(jsonResponse(404, body))

        const result = await service.execute(invocation, false)

        expect(result.finished).toBe(true)
        expect(result.invocation.queueScheduledAt).toBeUndefined()
        expect(result.invocation.state.vmState!.stack).toEqual([])
        expect(result.logs.map((entry) => entry.message)).toEqual([log])
    })

    it('waits out the submit throttle without claiming a generation it never got', async () => {
        const invocation = createLlmInvocation()
        mockFetch.mockResolvedValue(jsonResponse(429, { detail: 'Request was throttled.' }, { 'retry-after': '7' }))

        const result = await service.execute(invocation, false)

        expect(result.finished).toBe(false)
        expect(result.invocation.queueScheduledAt!.diff(DateTime.utc(), 'seconds').seconds).toBeCloseTo(7, 1)
        // Nothing was enqueued, so the next run has to submit again rather than retrieve a handle
        // that does not exist.
        expect(result.invocation.queueMetadata).toEqual(
            expect.objectContaining({ generationId: undefined, throttles: 1 })
        )
    })

    it('keeps waiting out a long throttle instead of reporting a generation that never started as too slow', async () => {
        const invocation = createLlmInvocation()
        // Two minutes already spent in the submit throttle. The bounce cap, not the ladder, is what
        // bounds a step that has not started a generation yet.
        invocation.queueMetadata = { startedAt: DateTime.utc().minus({ seconds: 120 }).toISO(), polls: 0, throttles: 2 }
        mockFetch.mockResolvedValue(jsonResponse(429, { detail: 'Request was throttled.' }, { 'retry-after': '60' }))

        const result = await service.execute(invocation, false)

        expect(result.finished).toBe(false)
        expect(result.invocation.queueScheduledAt!.diff(DateTime.utc(), 'seconds').seconds).toBeCloseTo(60, 1)
        expect(result.invocation.queueMetadata).toEqual(expect.objectContaining({ throttles: 3 }))
    })

    it('starts the ladder clock when the generation is accepted, so time lost to the throttle is not charged to it', async () => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = { startedAt: DateTime.utc().minus({ seconds: 80 }).toISO(), polls: 0, throttles: 1 }
        mockFetch.mockResolvedValue(jsonResponse(202, { id: 'gen-1', status: 'pending', result: null, error: null }))

        const result = await service.execute(invocation, false)

        const metadata = result.invocation.queueMetadata as { generationId: string; startedAt: string }
        expect(metadata.generationId).toBe('gen-1')
        expect(DateTime.fromISO(metadata.startedAt).diff(DateTime.utc(), 'seconds').seconds).toBeCloseTo(0, 1)
    })

    it('gives up after ten throttle bounces instead of bouncing forever', async () => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = { startedAt: DateTime.utc().toISO(), polls: 0, throttles: 10 }
        mockFetch.mockResolvedValue(jsonResponse(429, { detail: 'Request was throttled.' }, { 'retry-after': '7' }))

        const result = await service.execute(invocation, false)

        expect(result.finished).toBe(true)
        expect(result.invocation.queueScheduledAt).toBeUndefined()
        expect(result.logs.map((entry) => entry.message)).toEqual([
            'Could not generate text (throttled). Text generation is busy right now, so this step could not run. Try again in a few minutes.',
        ])
    })

    it('counts every execution it spends, so the last one before the backstop still runs and the next one stops', async () => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = { generationId: 'gen-1', startedAt: DateTime.utc().toISO(), polls: 19, throttles: 0 }
        mockFetch.mockResolvedValue(jsonResponse(202, { id: 'gen-1', status: 'pending', result: null, error: null }))

        const result = await service.execute(invocation, false)

        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(result.finished).toBe(false)
        expect(result.invocation.queueMetadata).toEqual(expect.objectContaining({ polls: 20 }))
    })

    it('stops a job whose executions outran the backstop without making another call', async () => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = { generationId: 'gen-1', startedAt: DateTime.utc().toISO(), polls: 20, throttles: 0 }

        const result = await service.execute(invocation, false)

        expect(mockFetch).not.toHaveBeenCalled()
        expect(result.finished).toBe(true)
        expect(result.invocation.queueScheduledAt).toBeUndefined()
        expect(result.logs.map((entry) => entry.message)).toEqual([
            'Could not generate text (deadline_exceeded). Generation did not report a result within 5 minutes and stopped. Run the workflow again, or try a faster model.',
        ])
    })

    it('fails the step on a server error rather than handing it an empty envelope', async () => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = { generationId: 'gen-1', startedAt: DateTime.utc().toISO(), polls: 0, throttles: 0 }
        mockFetch.mockResolvedValue(jsonResponse(500, { detail: 'Server error.' }))

        const result = await service.execute(invocation, false)

        expect(result.finished).toBe(true)
        expect(result.invocation.state.vmState!.stack).toEqual([])
        expect(result.execResult).toBeUndefined()
        expect(result.logs.map((entry) => entry.message)).toEqual([
            'Could not generate text (gateway_unavailable). Could not reach PostHog to run this step. Try again later.',
        ])
    })

    it('fails the step on a gateway error page rather than throwing on a body that is not JSON', async () => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = { generationId: 'gen-1', startedAt: DateTime.utc().toISO(), polls: 0, throttles: 0 }
        mockFetch.mockResolvedValue({
            status: 502,
            headers: {},
            json: () => Promise.reject(new Error('Unexpected token < in JSON at position 0')),
            text: () => Promise.resolve('<html>502 Bad Gateway</html>'),
            dump: () => Promise.resolve(),
        } as FetchResponse)

        const result = await service.execute(invocation, false)

        expect(result.finished).toBe(true)
        expect(result.logs.map((entry) => entry.message)).toEqual([
            'Could not generate text (gateway_unavailable). Could not reach PostHog to run this step. Try again later.',
        ])
    })

    it('keeps polling when a retrieve cannot reach PostHog, because the generation is still running', async () => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = { generationId: 'gen-1', startedAt: DateTime.utc().toISO(), polls: 0, throttles: 0 }
        mockFetch.mockRejectedValue(new Error('The operation was aborted due to timeout'))

        const result = await service.execute(invocation, false)

        expect(result.finished).toBe(false)
        expect(result.error).toBeUndefined()
        expect(result.invocation.queueScheduledAt!.diff(DateTime.utc(), 'seconds').seconds).toBeCloseTo(2, 1)
        expect(result.invocation.queueMetadata).toEqual(expect.objectContaining({ generationId: 'gen-1' }))
    })

    it('gives a fresh transport budget back once a poll reaches the endpoint again', async () => {
        const invocation = createLlmInvocation()
        // Two of three transport failures spent. Over a five-minute ladder every mark may hit its
        // own blip, so a budget that never resets would fail a healthy generation as the gateway.
        invocation.queueMetadata = {
            generationId: 'gen-1',
            startedAt: DateTime.utc().minus({ seconds: 60 }).toISO(),
            polls: 2,
            throttles: 0,
            transportFailures: 2,
        }
        mockFetch.mockResolvedValue(jsonResponse(202, { id: 'gen-1', status: 'pending', result: null, error: null }))

        const result = await service.execute(invocation, false)

        expect(result.invocation.queueMetadata).toEqual(expect.objectContaining({ transportFailures: 0 }))
    })

    it('stops naming the gateway once PostHog has stayed unreachable, rather than blaming the model', async () => {
        const invocation = createLlmInvocation()
        invocation.queueMetadata = {
            generationId: 'gen-1',
            startedAt: DateTime.utc().toISO(),
            polls: 0,
            throttles: 0,
            transportFailures: 3,
        }
        mockFetch.mockRejectedValue(new Error('The operation was aborted due to timeout'))

        const result = await service.execute(invocation, false)

        expect(result.finished).toBe(true)
        expect(result.invocation.queueScheduledAt).toBeUndefined()
        expect(result.logs.map((entry) => entry.message)).toEqual([
            'Could not generate text (gateway_unavailable). Could not reach PostHog to run this step. Try again later.',
        ])
    })

    it('runs a preview to completion in process, because a preview never gets dequeued again', async () => {
        jest.useFakeTimers()
        try {
            const invocation = createLlmInvocation()
            const envelope = { text: 'Your weekly digest', fields: { subject: 'Your weekly digest' } }
            mockFetch
                .mockResolvedValueOnce(jsonResponse(202, { id: 'gen-1', status: 'pending', result: null, error: null }))
                .mockResolvedValueOnce(jsonResponse(202, { id: 'gen-1', status: 'pending', result: null, error: null }))
                .mockResolvedValueOnce(
                    jsonResponse(200, { id: 'gen-1', status: 'succeeded', result: envelope, error: null })
                )

            const pending = service.execute(invocation, true)
            await jest.advanceTimersByTimeAsync(5000)
            const result = await pending

            expect(mockFetch).toHaveBeenCalledTimes(3)
            expect(result.finished).toBe(true)
            expect(result.invocation.queueScheduledAt).toBeUndefined()
            expect(result.execResult).toEqual(envelope)
        } finally {
            jest.useRealTimers()
        }
    })

    it('ends a preview that outlives its deadline with a message about the preview, not a failed step', async () => {
        jest.useFakeTimers()
        try {
            const invocation = createLlmInvocation()
            mockFetch.mockResolvedValue(
                jsonResponse(202, { id: 'gen-1', status: 'pending', result: null, error: null })
            )

            const pending = service.execute(invocation, true)
            await jest.advanceTimersByTimeAsync(30000)
            const result = await pending

            expect(result.finished).toBe(true)
            // A preview that ran out of its own window says nothing about the step, which gets longer
            // in a real run - so L3 must not have to read a node failure to render this.
            expect(result.error).toBeUndefined()
            expect(result.logs.map((entry) => [entry.level, entry.message])).toEqual([
                [
                    'warn',
                    'The preview stopped after 25 seconds. The step gets longer when the workflow runs. Try a shorter prompt or a faster model.',
                ],
            ])
        } finally {
            jest.useRealTimers()
        }
    })
})
