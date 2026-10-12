import { dayjs } from 'lib/dayjs'

import { HogflowTestResult } from '../../steps/types'
import { getHogFlowTestResultMessage } from './getHogFlowTestResultMessage'

describe('workflow test result message', () => {
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
    ])('shows the sandbox skip reason above the logs: %s', (reason, nextActionId) => {
        const result: HogflowTestResult = {
            status: 'skipped',
            nextActionId,
            logs: ['Sandbox sender selected.', reason, 'Function finished.'].map((message) => ({
                instanceId: 'test-run',
                timestamp: dayjs('2026-05-01T00:00:00Z'),
                rawTimestamp: '2026-05-01T00:00:00Z',
                level: 'INFO',
                message,
            })),
        }
        expect(getHogFlowTestResultMessage(result)).toBe(reason)
    })

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
