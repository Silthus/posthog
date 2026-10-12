import { MOCK_DEFAULT_ORGANIZATION } from 'lib/api.mock'

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expectLogic } from 'kea-test-utils'

import { ObjectTags } from 'lib/components/ObjectTags/ObjectTags'
import { organizationLogic } from 'scenes/organizationLogic'

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

    it('opens the tag picker from a keyboard reachable pencil without an edit link', async () => {
        const workflow = buildWorkflowRow({ id: 'workflow-pencil', tags: ['billing', 'eu'] })
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flows/summaries/': () => [200, paginated([workflow])],
                '/api/projects/:team_id/messaging_templates/': () => [200, paginated([])],
                '/api/projects/:team_id/hog_flows/metrics/global/': () => [200, []],
                '/api/projects/:team_id/tags/': () => [200, ['billing', 'eu']],
            },
        })
        initKeaTests()
        const logic = workflowsListV2Logic()
        logic.mount()
        try {
            render(<WorkflowTagsCell row={buildWorkflowListRows([workflow], null)[0]} />)
            const button = screen.getByRole('button', { name: 'Edit tags' })
            expect(screen.queryByText('Edit tags')).toBeNull()
            button.focus()
            await userEvent.setup().keyboard('{Enter}')
            await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')))
        } finally {
            logic.unmount()
        }
    })

    it('renames a shared tag from the picker and refreshes workflows, templates and the active filter', async () => {
        const workflow = buildWorkflowRow({ id: 'workflow-billing', tags: ['billing', 'eu'] })
        const template = { id: 'template-billing', name: 'Billing email', type: 'email', tags: ['billing'] }
        let renamed = false
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flows/summaries/': () => [
                    200,
                    paginated([{ ...workflow, tags: renamed ? ['eu'] : workflow.tags }]),
                ],
                '/api/projects/:team_id/messaging_templates/': () => [
                    200,
                    paginated([{ ...template, tags: renamed ? ['eu'] : template.tags }]),
                ],
                '/api/projects/:team_id/hog_flows/metrics/global/': () => [200, []],
                '/api/projects/:team_id/tags/': () => [200, renamed ? ['eu'] : ['billing', 'eu']],
            },
            post: {
                '/api/projects/:team_id/tags/rename/': async ({ request }) => {
                    expect(await request.json()).toEqual({ name: 'billing', new_name: 'eu' })
                    renamed = true
                    return [200, { name: 'eu' }]
                },
            },
        })
        initKeaTests()
        organizationLogic.actions.loadCurrentOrganizationSuccess(MOCK_DEFAULT_ORGANIZATION)
        const logic = workflowsListV2Logic()
        logic.mount()
        try {
            await waitFor(() => expect(logic.values.rows).toHaveLength(2))
            logic.actions.setValue({ text: '', filters: [{ facet: 'tag', value: 'billing', negated: false }] })
            render(<WorkflowTagsCell row={logic.values.rows.find((row) => row.kind === 'workflow')!} />)
            const user = userEvent.setup()
            await user.click(screen.getByRole('button', { name: 'Edit tags' }))
            const option = await screen.findByText('billing')
            const optionButtons = within(option.closest('.LemonButtonWithSideAction') as HTMLElement).getAllByRole(
                'button'
            )
            await user.click(optionButtons[1])
            const dialog = await screen.findByRole('dialog')
            await user.clear(within(dialog).getByRole('textbox'))
            await user.type(within(dialog).getByRole('textbox'), 'eu')
            await user.click(within(dialog).getByRole('button', { name: 'Rename' }))
            await waitFor(() => expect(logic.values.workflows?.[0].tags).toEqual(['eu']))
            await waitFor(() => expect(logic.values.emailTemplates?.[0].tags).toEqual(['eu']))
            expect(logic.values.value.filters).toEqual([{ facet: 'tag', value: 'eu', negated: false }])
            expect(logic.values.filteredRows).toHaveLength(2)
            await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        } finally {
            logic.unmount()
        }
    })

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
            await user.click(screen.getByRole('button', { name: 'Add tag' }))
            await user.keyboard('onboarding')
            await user.keyboard('{Enter}')
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
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add tag' }))
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
