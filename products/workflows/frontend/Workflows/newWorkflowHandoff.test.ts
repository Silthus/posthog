import { router } from 'kea-router'
import { expectLogic } from 'kea-test-utils'

import { aiFirstHandoffLogic } from 'scenes/max/aiFirstCreate/aiFirstHandoffLogic'
import { MAX_SIDE_PANEL_ID } from 'scenes/max/components/PhaiSidePanelChat'
import { maxMocks } from 'scenes/max/testUtils'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { runnerPanelLogic, toolStreamEventsLogic } from 'products/posthog_ai/frontend/api/logics'

import { workflowHandoffWithTags, findCreatedWorkflowId } from './newWorkflowHandoff'

const WORKFLOW_ID = '2f1e9c3a-5b7d-4e8f-9a0b-1c2d3e4f5a6b'
const OLDER_ID = '7a1b2c3d-0000-4e8f-9a0b-1c2d3e4f5a6b'
const NAME = 'Win back inactive users'

describe('findCreatedWorkflowId', () => {
    beforeEach(() => {
        useMocks(maxMocks)
        useMocks({
            get: {
                // Ordered by update time like the real list, so the same-named older draft comes first.
                '/api/environments/:team_id/hog_flows/': {
                    results: [
                        { id: OLDER_ID, name: NAME, created_at: '2026-09-01T00:00:00Z' },
                        { id: WORKFLOW_ID, name: NAME, created_at: '2026-09-15T00:00:00Z' },
                        { id: 'other', name: `${NAME} v2`, created_at: '2026-09-16T00:00:00Z' },
                    ],
                    count: 3,
                },
            },
        })
        initKeaTests()
    })

    // The list is a substring search, so only the exact name counts, and the newest of those is the draft just made.
    it.each([
        { name: 'the newest exact match', input: NAME, expected: WORKFLOW_ID },
        { name: 'null for a blank name', input: '  ', expected: null },
        { name: 'null for a non-string name', input: 42, expected: null },
    ])('returns $name', async ({ input, expected }) => {
        await expect(findCreatedWorkflowId(input)).resolves.toBe(expected)
    })

    it.each([200, 500])(
        'handles inherited tags before opening an AI-created workflow (response %s)',
        async (status) => {
            const patches: unknown[] = []
            useMocks({
                get: { '/api/projects/:team_id/hog_flows/:id/': { id: WORKFLOW_ID, tags: ['campaign'] } },
                patch: {
                    '/api/projects/:team_id/hog_flows/:id/': async ({ request }) => {
                        patches.push(await request.json())
                        return [status, { id: WORKFLOW_ID, tags: ['campaign', 'onboarding'] }]
                    },
                },
            })
            router.actions.push('/workflows/new/workflow')
            const logic = aiFirstHandoffLogic(workflowHandoffWithTags(['onboarding']))
            logic.mount()
            try {
                runnerPanelLogic({ panelId: MAX_SIDE_PANEL_ID }).actions.setActiveCreation({ streamKey: 'tags-create' })
                await expectLogic(logic, () => {
                    toolStreamEventsLogic.actions.emitToolEvent({
                        streamKey: 'tags-create',
                        toolCallId: 'tags-call',
                        toolName: 'workflows-create',
                        rawToolName: 'exec',
                        phase: 'completed',
                        source: 'live',
                        invocation: {
                            toolCallId: 'tags-call',
                            rawServerName: 'posthog',
                            rawToolName: 'exec',
                            input: { command: 'call workflows-create {}' },
                            output: { content: [], _meta: { 'com.posthog.mcp/app_data': { id: WORKFLOW_ID } } },
                            status: 'completed',
                            contentBlocks: [],
                        },
                    })
                }).toFinishAllListeners()
                expect(patches).toEqual([{ tags: ['campaign', 'onboarding'] }])
                expect(router.values.location.pathname).toBe(
                    status === 200
                        ? `/project/997/workflows/${WORKFLOW_ID}/workflow`
                        : '/project/997/workflows/new/workflow'
                )
            } finally {
                logic.unmount()
            }
        }
    )
})
