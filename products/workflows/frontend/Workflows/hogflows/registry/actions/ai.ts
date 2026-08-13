import { FEATURE_FLAGS } from 'lib/constants'

import { registerActionNodeCategory } from 'products/workflows/frontend/Workflows/hogflows/registry/actions/actionNodeRegistry'

registerActionNodeCategory({
    label: 'AI',
    featureFlag: FEATURE_FLAGS.WORKFLOWS_LLM_ACTION,
    nodes: [
        {
            type: 'function',
            name: 'Generate text',
            description: 'Run a prompt and store the result in workflow variables.',
            config: { template_id: 'template-workflow-llm', inputs: {} },
            // A failed generation has already been billed and leaves the variables downstream steps
            // read unset, so this step stops the run instead of sending on empty text.
            on_error: 'abort',
        },
    ],
})
