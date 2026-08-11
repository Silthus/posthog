import { HogFunctionTemplate } from '~/cdp/types'

export const template: HogFunctionTemplate = {
    // Not free: each run spends the project's PostHog AI credits, and the step meters a billable
    // invocation the same way a fetch does.
    free: false,
    status: 'hidden',
    type: 'destination',
    id: 'template-workflow-llm',
    name: 'Generate text',
    description: 'Run a prompt and store the result in workflow variables.',
    icon_url: '/static/posthog-icon.svg',
    category: ['AI'],
    code_language: 'hog',
    code: `
return llmGenerate({
    'prompt': inputs.prompt,
    'model': inputs.model,
    'output_fields': inputs.output_fields
})
`,
    inputs_schema: [
        {
            key: 'prompt',
            type: 'string',
            label: 'Prompt',
            required: true,
            // Liquid, so a bare { stays text: JSON examples and few-shot blocks need no escaping, and
            // {% if %} covers a prompt that has to handle several segments.
            templating: 'liquid',
            description: 'Type { to insert a person property, an event property, or a workflow variable.',
        },
        {
            key: 'output_fields',
            type: 'dictionary',
            label: 'Output fields',
            default: {},
            description:
                'One entry per workflow variable you want filled in. The key is the variable, the value tells the model what to put in it.',
        },
        {
            key: 'model',
            type: 'choice',
            label: 'Model',
            required: true,
            default: 'gpt-5-mini',
            searchable: true,
            templating: false,
            // Grouped by provider, cheapest first. A deliberate subset of what the endpoint accepts, so
            // refreshing this list can never invalidate a saved workflow.
            choices: [
                { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
                { value: 'gpt-5-mini', label: 'GPT-5 mini' },
                { value: 'gpt-5.4', label: 'GPT-5.4' },
                { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
                { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
                { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
            ],
            description: 'Each run of this node uses your PostHog AI credits. More capable models cost more.',
        },
    ],
}
