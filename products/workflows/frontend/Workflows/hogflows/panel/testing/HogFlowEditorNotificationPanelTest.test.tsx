import '@testing-library/jest-dom'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BindLogic, Provider } from 'kea'

import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'
import { AccessControlLevel } from '~/types'

import { workflowLogic } from '../../../workflowLogic'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import { HogFlow } from '../../types'
import { hogFlowEditorNotificationTestLogic } from './hogFlowEditorNotificationTestLogic'

const WORKFLOW: HogFlow = {
    id: 'confirmation-workflow',
    name: 'Confirmation test',
    team_id: 1,
    status: 'draft',
    version: 1,
    user_access_level: AccessControlLevel.Editor,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    actions: [
        {
            id: 'email',
            type: 'function_email',
            name: 'Email',
            description: '',
            created_at: 0,
            updated_at: 0,
            config: { template_id: 'template-email', inputs: {} },
        },
    ],
    edges: [],
    conversion: { filters: [] },
    exit_condition: 'exit_only_at_end',
    trigger: { type: 'event', filters: {} },
}

describe('EmailActionTestContent', () => {
    afterEach(cleanup)

    it.each([200, 503])('disables the send confirmation until the email test finishes with HTTP %s', async (status) => {
        let release!: () => void
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        const requests: unknown[] = []
        useMocks({
            get: {
                '/api/environments/:team_id/hog_flows/:id/': WORKFLOW,
                '/api/projects/:team_id/persons/': { results: [] },
                '/api/environments/:team_id/hog_flows/:id/schedules': { results: [] },
                '/api/projects/:team_id/messaging_categories': { results: [] },
            },
            post: {
                '/api/environments/:team_id/hog_flows/:id/invocations': async ({ request }) => {
                    requests.push(await request.json())
                    await pending
                    return [
                        status,
                        status === 200 ? { status: 'success', logs: [] } : { detail: 'Synthetic service unavailable' },
                    ]
                },
            },
        })
        initKeaTests()
        const { EmailActionTestContent } = await import('./HogFlowEditorNotificationPanelTest')
        featureFlagLogic.actions.setFeatureFlags(['workflows-testing-v2'], { 'workflows-testing-v2': true })
        const props = { id: WORKFLOW.id }
        const workflow = workflowLogic(props)
        workflow.mount()
        await act(async () => {
            await workflow.asyncActions.loadWorkflow()
        })
        const editor = hogFlowEditorLogic(props)
        const testing = hogFlowEditorNotificationTestLogic(props)
        editor.mount()
        testing.mount()
        act(() => {
            editor.actions.setSelectedNodeId('email')
            testing.actions.setSampleGlobals(
                JSON.stringify({ person: { id: 'synthetic-person', properties: { email: 'qa@example.com' } } })
            )
        })
        render(
            <Provider>
                <BindLogic logic={workflowLogic} props={props}>
                    <BindLogic logic={hogFlowEditorLogic} props={props}>
                        <EmailActionTestContent />
                    </BindLogic>
                </BindLogic>
            </Provider>
        )
        fireEvent.click(screen.getByText('Run test'))
        const send = await screen.findByText('Send email')
        fireEvent.click(send)
        await waitFor(() => expect(requests).toHaveLength(1))
        const button = send.closest('button')!
        expect(button).toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(button)
        expect(requests).toHaveLength(1)
        await act(async () => {
            release()
            await pending
        })
        await waitFor(() => expect(testing.values.isTestInvocationSubmitting).toBe(false))
        if (status === 200) {
            await screen.findByText('Success')
        } else {
            fireEvent.click(screen.getByText('Run test'))
            const retry = await screen.findByText('Send email')
            await waitFor(() => {
                if (retry.closest('button')?.getAttribute('aria-disabled') !== 'false') {
                    throw new Error('Retry remains disabled')
                }
            })
            fireEvent.click(screen.getByText('Cancel'))
        }
        testing.unmount()
        editor.unmount()
        workflow.unmount()
    })
})
