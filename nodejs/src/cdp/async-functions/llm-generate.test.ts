import { createExampleInvocation } from '~/cdp/_tests/fixtures'
import { CyclotronJobInvocationHogFunction, CyclotronJobInvocationResult, MinimalLogEntry } from '~/cdp/types'
import { createInvocationResult } from '~/cdp/utils/invocation-utils'

import { AsyncFunctionContext, getAsyncFunctionHandler } from '../async-function-registry'
import './llm-generate'

describe('llmGenerate async function', () => {
    const handler = getAsyncFunctionHandler('llmGenerate')!

    const createResult = (): CyclotronJobInvocationResult<CyclotronJobInvocationHogFunction> =>
        createInvocationResult<CyclotronJobInvocationHogFunction>(createExampleInvocation(), {}, { finished: false })

    const context = {} as AsyncFunctionContext

    it('stages the prompt, model and output fields as llmGenerate queue parameters', async () => {
        const result = createResult()

        await handler.execute(
            [{ prompt: 'Write a subject line', model: 'gpt-5-mini', output_fields: { subject: 'A subject line' } }],
            context,
            result
        )

        expect(result.invocation.queueParameters).toEqual({
            type: 'llmGenerate',
            prompt: 'Write a subject line',
            model: 'gpt-5-mini',
            output_fields: { subject: 'A subject line' },
        })
    })

    it('mocks the envelope with placeholders that cannot be mistaken for a generation', () => {
        const logs: MinimalLogEntry[] = []

        const mocked = handler.mock(
            [
                {
                    prompt: 'Write a subject line for Jane',
                    model: 'gpt-5-mini',
                    output_fields: { subject: 'A subject line', tone: 'One word for the tone' },
                },
            ],
            logs
        )

        expect(mocked).toEqual({
            text: "This is example text. Turn on 'Make real HTTP requests' to run your prompt.",
            fields: {
                subject: 'Example value for `subject`',
                tone: 'Example value for `tone`',
            },
        })
        expect(logs.map((log) => log.message)).toEqual([
            'Generate text was mocked. Prompt: Write a subject line for Jane',
        ])
    })
})
