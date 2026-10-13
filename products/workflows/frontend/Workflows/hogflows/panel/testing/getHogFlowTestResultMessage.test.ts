import '@testing-library/jest-dom'

import { act, cleanup, render } from '@testing-library/react'
import { BindLogic } from 'kea'
import { expectLogic } from 'kea-test-utils'
import { createElement } from 'react'

import { dayjs } from 'lib/dayjs'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { workflowLogic } from '../../../workflowLogic'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import { HogflowTestResult } from '../../steps/types'
import { getHogFlowTestResultMessage } from './getHogFlowTestResultMessage'
import { EmailActionTestContent } from './HogFlowEditorNotificationPanelTest'
import { hogFlowEditorNotificationTestLogic } from './hogFlowEditorNotificationTestLogic'

jest.mock('scenes/hog-functions/configuration/HogFunctionTest', () => ({ HogFunctionTestEditor: () => null }))

describe('rendered workflow test result message', () => {
    let workflow: ReturnType<typeof workflowLogic.build>
    let editor: ReturnType<typeof hogFlowEditorLogic.build>
    let logic: ReturnType<typeof hogFlowEditorNotificationTestLogic.build>

    beforeEach(async () => {
        initKeaTests()
        useMocks({
            get: {
                '/api/environments/:team_id/persons/': { results: [] },
                '/api/environments/@current/messaging_categories': { results: [] },
                '/api/projects/:team_id/hog_flows/test-workflow-id/': {
                    id: 'test-workflow-id',
                    team_id: 997,
                    name: 'Test workflow',
                    status: 'draft',
                    actions: [
                        {
                            id: 'send-email',
                            type: 'function_email',
                            name: 'Send email',
                            config: { template_id: 'template-email', inputs: {} },
                        },
                    ],
                    edges: [],
                },
            },
        })
        workflow = workflowLogic({ id: 'test-workflow-id' })
        workflow.mount()
        await expectLogic(workflow).toDispatchActions(['loadWorkflowSuccess']).toFinishAllListeners()
        editor = hogFlowEditorLogic({ id: 'test-workflow-id' })
        editor.mount()
        editor.actions.setSelectedNodeId('send-email')
        logic = hogFlowEditorNotificationTestLogic({ id: 'test-workflow-id' })
        logic.mount()
        await expectLogic(logic).toFinishAllListeners()
    })

    afterEach(() => {
        cleanup()
        logic?.unmount()
        editor?.unmount()
        workflow?.unmount()
    })

    it.each([
        [
            "Skipping send: this email would go over the sandbox sender's daily limit for this project. Verify your own domain to send more.",
            'next-step',
        ],
        [
            'Skipping send: the sandbox sender only sends to active organization members with verified email addresses. Blocked addresses: outsider@example.com.',
            'next-step',
        ],
        [
            'Skipping send: could not check organization members for these addresses: member@example.com. Try again, or verify your own domain to send to anyone.',
            null,
        ],
        ['Skipping send: recipient is on the suppression list.', 'next-step'],
        ['Recipient has opted out, skipping message delivery.', 'next-step'],
        ['Skipping send: the sandbox sender is paused. Try again later.', 'next-step'],
    ])('shows the action-prefixed delivery skip reason above the logs: %s', (reason, nextActionId) => {
        const result: HogflowTestResult = {
            status: 'skipped',
            nextActionId,
            logs: [
                'Sandbox sender selected.',
                reason,
                'Email recipients: sandbox-user@example.com',
                'Function finished.',
            ].map((message) => ({
                instanceId: 'test-run',
                timestamp: dayjs('2026-05-01T00:00:00Z'),
                rawTimestamp: '2026-05-01T00:00:00Z',
                level: 'INFO',
                message: `[Action:send-email] ${message}`,
            })),
        }
        const { container } = render(
            createElement(BindLogic, {
                logic: workflowLogic,
                props: { id: 'test-workflow-id' },
                children: createElement(BindLogic, {
                    logic: hogFlowEditorLogic,
                    props: { id: 'test-workflow-id' },
                    children: createElement(EmailActionTestContent),
                }),
            })
        )
        act(() => logic.actions.setTestResult(result))
        expect(container.querySelector('.LemonBanner')).toHaveTextContent(reason)
        expect(container.querySelector('.LemonBanner')).not.toHaveTextContent('sandbox-user@example.com')
    })
})

describe('workflow test result message', () => {
    it.each([
        [{ status: 'success', nextActionId: 'next-step' }, 'Success'],
        [{ status: 'error', nextActionId: null, errors: ['Invalid input'] }, 'Error: Invalid input'],
        [{ status: 'skipped', nextActionId: 'next-step' }, 'This step was skipped. See the logs for details.'],
        [
            { status: 'skipped', nextActionId: null },
            'Workflow was skipped because the event did not match the filter criteria',
        ],
    ] as [HogflowTestResult, string][])('preserves the existing outcome message for %j', (result, expected) => {
        expect(getHogFlowTestResultMessage(result)).toBe(expected)
    })
})
