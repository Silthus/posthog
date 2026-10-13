import { HogflowTestResult } from '../../steps/types'

export function getHogFlowTestResultMessage(result: HogflowTestResult): string {
    if (result.status === 'success') {
        return 'Success'
    }
    if (result.status === 'error') {
        return 'Error: ' + result.errors?.join(', ')
    }
    return (
        result.logs
            ?.map((log) => log.message.replace(/^\[Action:[^\]]+\]\s*/, ''))
            .findLast(
                (message) => message.startsWith('Skipping send:') || message.includes('skipping message delivery.')
            ) ??
        (result.nextActionId
            ? 'This step was skipped. See the logs for details.'
            : 'Workflow was skipped because the event did not match the filter criteria')
    )
}
