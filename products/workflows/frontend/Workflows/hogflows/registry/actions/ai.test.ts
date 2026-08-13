import './ai'

import { FEATURE_FLAGS } from 'lib/constants'

import { getRegisteredActionNodeCategories } from './actionNodeRegistry'

describe('ai action registry', () => {
    const getCategory = (): ReturnType<typeof getRegisteredActionNodeCategories>[number] => {
        const category = getRegisteredActionNodeCategories().find((c) => c.label === 'AI')
        if (!category) {
            throw new Error('AI action category not registered')
        }
        return category
    }

    it('gates the category behind the workflows LLM action feature flag', () => {
        expect(getCategory().featureFlag).toBe(FEATURE_FLAGS.WORKFLOWS_LLM_ACTION)
    })

    it('wires Generate text to the workflow LLM template', () => {
        expect(getCategory().nodes).toEqual([
            {
                type: 'function',
                name: 'Generate text',
                description: 'Run a prompt and store the result in workflow variables.',
                config: { template_id: 'template-workflow-llm', inputs: {} },
                on_error: 'abort',
            },
        ])
    })
})
