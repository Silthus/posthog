import { HOG_FUNCTION_TEMPLATES_DESTINATIONS } from '../../index'
import { TemplateTester } from '../../test/test-helpers'
import { template } from './workflow-llm.template'

describe('workflow llm template', () => {
    const tester = new TemplateTester(template)

    beforeEach(async () => {
        await tester.beforeEach()
    })

    it('hands the async function the rendered prompt, the picked model and the declared fields', async () => {
        const result = await tester.invoke({
            prompt: 'Write a subject line for {{ person.properties.email }}',
            output_fields: { subject: 'A short subject line' },
        })

        expect(result.finished).toBe(false)
        expect(result.invocation.queueParameters).toEqual({
            type: 'llmGenerate',
            prompt: 'Write a subject line for example@posthog.com',
            model: 'gpt-5-mini',
            output_fields: { subject: 'A short subject line' },
        })
    })

    it('is listed in the destination templates, so the workflow editor can build the step', () => {
        expect(HOG_FUNCTION_TEMPLATES_DESTINATIONS.map((each) => each.id)).toContain('template-workflow-llm')
    })
})
