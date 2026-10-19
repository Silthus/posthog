import { HogflowTestResult } from '../../steps/types'

export function skippedSendReasons(result: HogflowTestResult): string[] {
    return (
        result.logs
            ?.map((log) => log.message.replace(/^\[Action:[^\]]+\]\s*/, ''))
            .filter(
                (message) => message.startsWith('Skipping send:') || message.includes('skipping message delivery.')
            ) ?? []
    )
}

export function getHogFlowTestResultMessage(result: HogflowTestResult): string {
    if (result.status === 'success') {
        return 'Success'
    }
    if (result.status === 'error') {
        return 'Error: ' + result.errors?.join(', ')
    }
    return (
        skippedSendReasons(result).at(-1) ??
        (result.nextActionId
            ? 'This step was skipped. See the logs for details.'
            : 'Workflow was skipped because the event did not match the filter criteria')
    )
}
