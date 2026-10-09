import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expectLogic } from 'kea-test-utils'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { WorkflowBulkTagsButton } from './WorkflowBulkTagsButton'
import { buildWorkflowRow, paginated } from './workflowsListV2Fixtures'
import { workflowsListV2Logic } from './workflowsListV2Logic'

describe('bulk library tags', () => {
    afterEach(cleanup)
    it('adds one tag to selected workflows and email templates', async () => {
        const workflow = buildWorkflowRow({ id: 'wf-welcome', tags: ['welcome'] })
        const template = {
            id: 'email-welcome',
            name: 'Reusable welcome',
            created_at: '2026-09-20T09:00:00Z',
            updated_at: '2026-09-20T09:00:00Z',
            created_by: null,
            tags: [],
        }
        const requests: string[] = []
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flows/summaries/': () => [200, paginated([workflow])],
                '/api/projects/:team_id/messaging_templates/': () => [200, paginated([template])],
                '/api/projects/:team_id/hog_flows/metrics/global/': () => [200, []],
                '/api/projects/:team_id/tags/': () => [200, []],
            },
            post: {
                '/api/projects/:team_id/hog_flows/bulk_update_tags/': async ({ request }) => {
                    expect(await request.json()).toEqual({ ids: ['wf-welcome'], action: 'add', tags: ['onboarding'] })
                    requests.push('workflow')
                    return [200, { updated: [{ id: workflow.id, tags: ['welcome', 'onboarding'] }], skipped: [] }]
                },
                '/api/projects/:team_id/messaging_templates/bulk_update_tags/': async ({ request }) => {
                    expect(await request.json()).toEqual({
                        ids: ['email-welcome'],
                        action: 'add',
                        tags: ['onboarding'],
                    })
                    requests.push('template')
                    return [200, { updated: [{ id: template.id, tags: ['onboarding'] }], skipped: [] }]
                },
            },
        })
        initKeaTests()
        const logic = workflowsListV2Logic()
        logic.mount()
        try {
            await expectLogic(logic).toDispatchActions(['loadWorkflowsSuccess', 'loadEmailTemplatesSuccess'])
            const user = userEvent.setup()
            render(<WorkflowBulkTagsButton rows={logic.values.rows} />)
            await user.click(screen.getByText('Update tags'))
            await user.type(screen.getByPlaceholderText('Enter tags...'), 'onboarding')
            await user.click(await screen.findByText('onboarding'))
            await user.click(screen.getByText('Add tags'))
            await waitFor(() => expect(requests.sort()).toEqual(['template', 'workflow']))
            logic.actions.setValue({ filters: [{ facet: 'tag', value: 'onboarding', negated: false }], text: '' })
            await waitFor(() => expect(logic.values.filteredRows).toHaveLength(2))
        } finally {
            logic.unmount()
        }
    })
})
