import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expectLogic } from 'kea-test-utils'

import { ObjectTags } from 'lib/components/ObjectTags/ObjectTags'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

jest.mock('lib/utils/getAppContext', () => ({
    ...jest.requireActual('lib/utils/getAppContext'),
    getAppContext: () => ({ resource_access_control: { hog_flow: 'editor' } }),
}))

import { buildWorkflowListRows } from './workflowListRows'
import { buildWorkflowRow, paginated } from './workflowsListV2Fixtures'
import { workflowsListV2Logic } from './workflowsListV2Logic'
import { WorkflowTagsCell } from './WorkflowTagsCell'

describe('inline workflow tags', () => {
    afterEach(cleanup)

    it('keeps the shared tag editor focused while tag suggestions load', async () => {
        initKeaTests()
        const onChange = jest.fn()
        const { rerender } = render(<ObjectTags tags={[]} saving={false} onChange={onChange} />)
        await userEvent.setup().click(screen.getByText('Add tag'))
        const input = document.activeElement
        expect(input?.tagName).toBe('INPUT')
        rerender(<ObjectTags tags={[]} saving onChange={onChange} />)
        expect((input as HTMLInputElement).disabled).toBe(false)
        expect(document.activeElement).toBe(input)
    })

    it('lists an email template alongside workflows and saves its tags', async () => {
        const template = {
            id: 'email-welcome',
            name: 'Reusable welcome',
            description: '',
            type: 'email',
            created_by: null,
            created_at: '2026-09-20T09:00:00Z',
            updated_at: '2026-09-20T09:00:00Z',
            tags: [],
        }
        let savedTags: string[] = []
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flows/summaries/': () => [200, paginated([])],
                '/api/projects/:team_id/messaging_templates/': () => [200, paginated([template])],
                '/api/projects/:team_id/hog_flows/metrics/global/': () => [200, []],
                '/api/projects/:team_id/tags/': () => [200, []],
            },
            patch: {
                '/api/projects/:team_id/messaging_templates/:id/': async ({ request }) => {
                    savedTags = ((await request.json()) as { tags: string[] }).tags
                    return [200, { ...template, tags: savedTags, updated_at: '2026-10-09T12:00:00Z' }]
                },
            },
        })
        initKeaTests()
        const logic = workflowsListV2Logic()
        logic.mount()
        try {
            await waitFor(() => expect(logic.values.rows.map((row) => row.name)).toContain('Reusable welcome'))
            const user = userEvent.setup()
            render(<WorkflowTagsCell row={logic.values.rows[0]} />)
            await user.click(screen.getByText('Add tag'))
            await user.keyboard('onboarding')
            await user.click(await screen.findByText('onboarding'))
            await waitFor(() => expect(savedTags).toEqual(['onboarding']))
            logic.actions.setValue({ filters: [{ facet: 'tag', value: 'onboarding', negated: false }], text: '' })
            await waitFor(() => expect(logic.values.filteredRows.map((row) => row.name)).toEqual(['Reusable welcome']))
            expect(logic.values.emailTemplates?.[0].updated_at).toBe('2026-10-09T12:00:00Z')
        } finally {
            logic.unmount()
        }
    })

    it('saves a tag in the row and finds that workflow with tag:', async () => {
        const workflow = buildWorkflowRow({ id: 'wf-welcome', name: 'Welcome', tags: [] })
        let savedTags: string[] = []
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flows/summaries/': () => [200, paginated([workflow])],
                '/api/projects/:team_id/messaging_templates/': () => [200, paginated([])],
                '/api/projects/:team_id/hog_flows/metrics/global/': () => [200, []],
                '/api/projects/:team_id/tags/': () => [200, []],
            },
            patch: {
                '/api/projects/:team_id/hog_flows/:id/': async ({ request }) => {
                    savedTags = ((await request.json()) as { tags: string[] }).tags
                    return [200, { ...workflow, tags: savedTags }]
                },
            },
        })
        initKeaTests()
        const logic = workflowsListV2Logic()
        logic.mount()
        try {
            await expectLogic(logic).toDispatchActions(['loadWorkflowsSuccess'])
            const user = userEvent.setup()
            render(<WorkflowTagsCell row={buildWorkflowListRows([workflow], null)[0]} />)
            await user.tab()
            expect(document.activeElement).toBe(screen.getByText('Add tag').closest('button'))
            await user.keyboard('{Enter}')
            await user.keyboard('onboarding')
            await user.keyboard('{Enter}')
            await waitFor(() => expect(savedTags).toEqual(['onboarding']))
            logic.actions.setValue({ filters: [{ facet: 'tag', value: 'onboarding', negated: false }], text: '' })
            await waitFor(() => expect(logic.values.filteredRows.map((row) => row.id)).toEqual(['wf-welcome']))
            logic.actions.setValue({ filters: [{ facet: 'tag', value: 'other', negated: false }], text: '' })
            expect(logic.values.filteredRows).toEqual([])
        } finally {
            logic.unmount()
        }
    })
})
