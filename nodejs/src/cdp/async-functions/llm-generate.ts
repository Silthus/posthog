import { DateTime } from 'luxon'

import { CyclotronInvocationQueueParametersLlmGenerateSchema } from '~/cdp/schema/cyclotron'

import { registerAsyncFunction } from '../async-function-registry'

// A mocked test walk spends no AI credits, so it has nothing real to show. Every value it returns has
// to read as a placeholder, or an author reviewing a test run will take it for a generation.
const MOCK_TEXT = "This is example text. Turn on 'Make real HTTP requests' to run your prompt."

registerAsyncFunction('llmGenerate', {
    execute: (args, _context, result) => {
        result.invocation.queueParameters = CyclotronInvocationQueueParametersLlmGenerateSchema.parse({
            ...args[0],
            type: 'llmGenerate',
        })
    },

    mock: (args, logs) => {
        const [opts] = args as [{ prompt?: string; output_fields?: Record<string, string> } | undefined]

        logs.push({
            level: 'info',
            timestamp: DateTime.now(),
            message: `Generate text was mocked. Prompt: ${opts?.prompt ?? ''}`,
        })

        return {
            text: MOCK_TEXT,
            fields: Object.fromEntries(
                Object.keys(opts?.output_fields ?? {}).map((key) => [key, `Example value for \`${key}\``])
            ),
        }
    },
})
