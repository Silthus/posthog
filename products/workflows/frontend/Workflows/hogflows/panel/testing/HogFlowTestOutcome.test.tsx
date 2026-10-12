import '@testing-library/jest-dom'

import { act, cleanup, render, screen } from '@testing-library/react'
import { BindLogic, Provider } from 'kea'

import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { NEW_WORKFLOW, workflowLogic } from '../../../workflowLogic'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import { HogflowTestResult } from '../../steps/types'
import { createExampleEventForTrigger } from '../../testEventFactory'
import { HogFlow } from '../../types'
import { EmailActionTestContent } from './HogFlowEditorNotificationPanelTest'
import { hogFlowEditorNotificationTestLogic } from './hogFlowEditorNotificationTestLogic'
import { HogFlowEditorPanelTest } from './HogFlowEditorPanelTest'
import { hogFlowEditorTestLogic } from './hogFlowEditorTestLogic'

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
    edges: [
        { from: 'trigger_node', to: 'webhook', type: 'continue' },
        { from: 'webhook', to: 'email', type: 'continue' },
        { from: 'email', to: 'exit_node', type: 'continue' },
    ],
}

describe('workflow test exit outcomes', () => {
    afterEach(cleanup)

    it.each(['single step', 'email pane', 'full run'] as const)('shows an early exit in the %s', async (view) => {
        let invocationCount = 0
        const requestedActions: string[] = []
        useMocks({
            post: {
                '/api/environments/:team_id/hog_flows/:id/invocations': async ({ request }) => {
                    const body = (await request.json()) as { current_action_id: string }
                    requestedActions.push(body.current_action_id)
                    invocationCount++
                    return [
                        200,
                        invocationCount === 1
                            ? {
                                  status: 'success',
                                  nextActionId: view === 'full run' ? 'webhook' : 'exit_node',
                                  logs: [],
                              }
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
        featureFlagLogic.actions.setFeatureFlags(['workflows-testing-v2'], { 'workflows-testing-v2': true })
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
        act(() =>
            editor.actions.setSelectedNodeId(
                view === 'full run' ? 'trigger_node' : view === 'single step' ? 'webhook' : 'email'
            )
        )

        render(
            <Provider>
                <BindLogic logic={workflowLogic} props={props}>
                    <BindLogic logic={hogFlowEditorLogic} props={props}>
                        {view === 'email pane' ? <EmailActionTestContent /> : <HogFlowEditorPanelTest />}
                    </BindLogic>
                </BindLogic>
            </Provider>
        )
        if (view === 'full run') {
            act(() => {
                testing.actions.setSampleGlobals(
                    JSON.stringify(createExampleEventForTrigger({ type: 'event' }, 997, 'test-workflow'))
                )
                testing.actions.runAllSteps({ ...testing.values.testInvocation, mock_async_functions: true })
            })
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
        if (view !== 'full run') {
            expect(screen.queryByText('Success')).not.toBeInTheDocument()
        }
        expect(screen.queryByText('Go to next step')).not.toBeInTheDocument()
        expect(invocationCount).toBe(2)
        if (view === 'full run') {
            expect(screen.getByText('Exited')).toBeInTheDocument()
            expect(requestedActions).toEqual(['trigger_node', 'webhook'])
        }
        emailTesting.unmount()
        testing.unmount()
        editor.unmount()
        workflow.unmount()
    })
})
