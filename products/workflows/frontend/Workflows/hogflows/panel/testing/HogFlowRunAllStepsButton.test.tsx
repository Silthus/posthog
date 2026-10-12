import '@testing-library/jest-dom'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BindLogic, Provider } from 'kea'
import { expectLogic } from 'kea-test-utils'

import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { workflowLogic } from '../../../workflowLogic'
import { TestRunSource, hogFlowEditorTestLogic } from './hogFlowEditorTestLogic'
import { HogFlowRunAllStepsButton } from './HogFlowRunAllStepsButton'

describe('HogFlowRunAllStepsButton', () => {
    afterEach(cleanup)

    let requests: { mock_async_functions: boolean }[]
    let workflow: ReturnType<typeof workflowLogic.build>
    let releaseRequest: () => void

    beforeEach(() => {
        requests = []
        const pending = new Promise<void>((resolve) => {
            releaseRequest = resolve
        })
        useMocks({
            post: {
                '/api/environments/:team_id/hog_flows/:id/invocations': async ({ request }) => {
                    const body = (await request.json()) as { mock_async_functions: boolean }
                    requests.push({ mock_async_functions: body.mock_async_functions })
                    await pending
                    return [200, { status: 'success', nextActionId: null, logs: [] }]
                },
            },
        })
        initKeaTests()
        featureFlagLogic.actions.setFeatureFlags(['workflows-testing-v2'], { 'workflows-testing-v2': true })
    })

    const renderButton = async (source: TestRunSource, mocked: boolean): Promise<void> => {
        const props = { id: 'new' }
        workflow = workflowLogic(props)
        workflow.mount()
        await act(async () => {
            await workflow.asyncActions.loadWorkflow()
        })
        render(
            <Provider>
                <BindLogic logic={workflowLogic} props={props}>
                    <HogFlowRunAllStepsButton
                        source={source}
                        testInvocation={{ globals: '{}', mock_async_functions: mocked }}
                        hasTestData
                        isTestInvocationSubmitting={false}
                    />
                </BindLogic>
            </Provider>
        )
    }

    const finishRun = async (): Promise<void> => {
        await act(async () => {
            releaseRequest()
            await expectLogic(hogFlowEditorTestLogic({ id: 'new' })).toFinishAllListeners()
        })
        workflow.unmount()
    }

    it('requires confirmation before a full run makes real requests', async () => {
        await renderButton('workflow', false)
        fireEvent.click(screen.getByText('Run all steps'))
        await screen.findByText('Run workflow with real HTTP requests?')
        expect(requests).toEqual([])
        expect(
            screen.getByText(
                'Every HTTP step will run for real, including third-party email or SMS destinations. Built-in email, SMS and push steps stay mocked.'
            )
        ).toBeInTheDocument()
        fireEvent.click(screen.getByText('Cancel'))
        expect(requests).toEqual([])

        fireEvent.click(screen.getByText('Run all steps'))
        fireEvent.click(await screen.findByText('Run with real requests'))
        await waitFor(() => expect(requests).toEqual([{ mock_async_functions: false }]))
        expect(screen.getByText('Run all steps').closest('button')).toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(screen.getByText('Run all steps'))
        expect(requests).toHaveLength(1)
        await finishRun()
    })

    it.each([
        ['workflow', true],
        ['email', false],
    ] as const)('runs from %s with mock setting %s without a real-request confirmation', async (source, mocked) => {
        await renderButton(source, mocked)
        fireEvent.click(screen.getByText('Run all steps'))
        await waitFor(() => expect(requests).toEqual([{ mock_async_functions: true }]))
        expect(screen.queryByText('Run workflow with real HTTP requests?')).not.toBeInTheDocument()
        await finishRun()
    })
})
