import { createExampleInvocation } from '~/cdp/_tests/fixtures'
import { CyclotronJobInvocationHogFunction } from '~/cdp/types'
import { createInvocationResult } from '~/cdp/utils/invocation-utils'

import { HogExecutorAsyncService } from './hog-executor-async.service'
import { HogExecutorService } from './hog-executor.service'

describe('HogExecutorAsyncService', () => {
    const createService = (llmGenerationService: { execute: jest.Mock }): HogExecutorAsyncService =>
        new HogExecutorAsyncService(
            new HogExecutorService({ executionTimeoutMs: 100 }, undefined as any),
            {
                googleAdwordsDeveloperToken: '',
                fetchRetries: 3,
                fetchBackoffBaseMs: 1000,
                fetchBackoffMaxMs: 10000,
                siteUrl: 'http://localhost:8000',
            },
            {
                teamManager: undefined as any,
                hogInputsService: undefined as any,
                emailService: undefined as any,
                recipientTokensService: undefined as any,
                pushNotificationService: undefined as any,
                llmGenerationService: llmGenerationService as any,
            }
        )

    it('dispatches an llmGenerate invocation to the generation service instead of resuming the hog VM', async () => {
        const invocation = createExampleInvocation()
        invocation.queueParameters = {
            type: 'llmGenerate',
            prompt: 'Write a subject line',
            model: 'gpt-5-mini',
            output_fields: {},
        }
        invocation.state.vmState = { stack: [] } as any

        const serviceResult = createInvocationResult<CyclotronJobInvocationHogFunction>(
            invocation,
            {},
            { finished: true, execResult: { text: 'Hello', fields: {} } }
        )
        const llmGenerationService = { execute: jest.fn().mockResolvedValue(serviceResult) }

        const result = await createService(llmGenerationService).executeWithAsyncFunctions(invocation)

        expect(llmGenerationService.execute).toHaveBeenCalledWith(invocation, false)
        expect(result.execResult).toEqual({ text: 'Hello', fields: {} })
    })
})
