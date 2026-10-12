import { describe, expect, it, vi } from 'vitest'

import { GENERATED_TOOLS } from '@/tools/generated/workflows'
import type { Context } from '@/tools/types'

interface SearchResponse {
    results: Record<string, unknown>[]
}

const SEARCH_RESULT = {
    count: 1,
    next: null,
    previous: null,
    results: [{ id: 'wf-123', name: 'Welcome series', status: 'active', matched_step_count: 2 }],
}

function createMockContext(): Context {
    return {
        api: {
            request: vi.fn().mockResolvedValue(SEARCH_RESULT),
            getProjectBaseUrl: vi.fn().mockReturnValue('https://us.posthog.com/project/1'),
        },
        stateManager: { getProjectId: vi.fn().mockResolvedValue('1') },
    } as unknown as Context
}

const searchTool = GENERATED_TOOLS['workflows-search']!()

describe('workflows-search handler', () => {
    it.each([
        { fields: undefined, expectedKeys: ['_posthogUrl', 'id', 'matched_step_count', 'name', 'status'] },
        { fields: ['name'], expectedKeys: ['_posthogUrl', 'id', 'name'] },
    ])('links each result to its workflow when fields is $fields', async ({ fields, expectedKeys }) => {
        const params = searchTool.schema.parse({ q: 'welcome', fields })

        const { results } = (await searchTool.handler(createMockContext(), params)) as SearchResponse

        const [row] = results
        expect(row!._posthogUrl).toBe('https://us.posthog.com/project/1/workflows/wf-123/workflow')
        expect(Object.keys(row!).sort()).toEqual(expectedKeys)
    })
})
