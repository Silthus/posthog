import { HogflowTestResult } from '../../steps/types'
import { getHogFlowTestResultMessage } from './getHogFlowTestResultMessage'

describe('getHogFlowTestResultMessage', () => {
    it.each<[string, HogflowTestResult, string]>([
        ['a success', { status: 'success', nextActionId: 'exit' }, 'Success'],
        ['an error', { status: 'error', nextActionId: null, errors: ['Invalid input'] }, 'Error: Invalid input'],
        [
            'an email the worker declined to send',
            {
                status: 'skipped',
                nextActionId: 'exit',
                emailSendResult: {
                    status: 'skipped',
                    reason: 'Skipping send: recipient(s) on the suppression list — person@example.com',
                },
            },
            'Skipping send: recipient(s) on the suppression list — person@example.com',
        ],
        [
            'a skipped step without a reason',
            { status: 'skipped', nextActionId: 'exit' },
            'This step was skipped. See the logs for details.',
        ],
        [
            'an event that did not match the trigger',
            { status: 'skipped', nextActionId: null },
            'Workflow was skipped because the event did not match the filter criteria',
        ],
    ])('describes %s', (_label, result, expected) => {
        expect(getHogFlowTestResultMessage(result)).toBe(expected)
    })
})
