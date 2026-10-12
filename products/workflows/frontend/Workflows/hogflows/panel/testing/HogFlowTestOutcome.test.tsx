import '@testing-library/jest-dom'

import { act, cleanup, render, screen } from '@testing-library/react'
import { BindLogic, Provider } from 'kea'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { NEW_WORKFLOW, workflowLogic } from '../../../workflowLogic'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import { HogflowTestResult } from '../../steps/types'
import { HogFlow } from '../../types'
import { EmailActionTestContent } from './HogFlowEditorNotificationPanelTest'
import { hogFlowEditorNotificationTestLogic } from './hogFlowEditorNotificationTestLogic'
import { HogFlowEditorPanelTest } from './HogFlowEditorPanelTest'
import { hogFlowEditorTestLogic } from './hogFlowEditorTestLogic'
import { HogFlowTestRunSteps } from './HogFlowTestRunSteps'

jest.mock('lib/utils/getAppContext', () => ({
    ...jest.requireActual('lib/utils/getAppContext'),
    getCurrentTeamId: () => 997,
}))

const EXITED_RESULT: HogflowTestResult = { status: 'exited', nextActionId: null, logs: [] }

const WORKFLOW: HogFlow = {
    ...NEW_WORKFLOW,
    actions: [
        ...NEW_WORKFLOW.actions,
        {
            id: 'webhook',
            type: 'function',
            name: 'Webhook',
            description: '',
            config: { template_id: 'template-webhook', inputs: {} },
        },
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
}

describe('workflow test exit outcomes', () => {
    afterEach(cleanup)

    it.each(['single step', 'email pane', 'run list'] as const)('shows an early exit in the %s', async (view) => {
        let invocationCount = 0
        useMocks({
            post: {
                '/api/environments/:team_id/hog_flows/:id/invocations': () => {
                    invocationCount++
                    return [
                        200,
                        invocationCount === 1
                            ? { status: 'success', nextActionId: 'exit_node', logs: [] }
                            : EXITED_RESULT,
                    ]
                },
            },
            get: {
                '/api/projects/:team_id/persons/': { results: [] },
                '/api/projects/:team_id/messaging_categories': { results: [] },
            },
        })
        initKeaTests()
        const props = { id: 'new' }
        const workflow = workflowLogic(props)
        workflow.mount()
        await act(async () => {
            await workflow.asyncActions.loadWorkflow()
            workflow.actions.resetWorkflow(WORKFLOW)
        })
        const editor = hogFlowEditorLogic(props)
        const testing = hogFlowEditorTestLogic(props)
        const emailTesting = hogFlowEditorNotificationTestLogic(props)
        editor.mount()
        testing.mount()
        emailTesting.mount()
        act(() => editor.actions.setSelectedNodeId(view === 'single step' ? 'webhook' : 'email'))

        render(
            <Provider>
                <BindLogic logic={workflowLogic} props={props}>
                    <BindLogic logic={hogFlowEditorLogic} props={props}>
                        {view === 'run list' ? (
                            <HogFlowTestRunSteps />
                        ) : view === 'email pane' ? (
                            <EmailActionTestContent />
                        ) : (
                            <HogFlowEditorPanelTest />
                        )}
                    </BindLogic>
                </BindLogic>
            </Provider>
        )
        if (view === 'run list') {
            act(() => testing.actions.addTestRunStep({ actionId: 'email', result: EXITED_RESULT, waitSkipped: false }))
        } else {
            const stepTesting = view === 'email pane' ? emailTesting : testing
            act(() => {
                stepTesting.actions.setSampleGlobals(
                    JSON.stringify({ person: { id: 'test-person', properties: { email: 'qa@example.com' } } })
                )
                stepTesting.actions.submitTestInvocation()
            })
            await screen.findByText('Success')
            expect(screen.getByText('Go to next step')).toBeInTheDocument()
            act(() => stepTesting.actions.submitTestInvocation())
        }

        await screen.findByText('Workflow exited before this step')
        expect(screen.queryByText('Success')).not.toBeInTheDocument()
        expect(screen.queryByText('Go to next step')).not.toBeInTheDocument()
        expect(invocationCount).toBe(view === 'run list' ? 0 : 2)
        if (view === 'run list') {
            expect(screen.getByText('Exited')).toBeInTheDocument()
        }
        emailTesting.unmount()
        testing.unmount()
        editor.unmount()
        workflow.unmount()
    })
})
