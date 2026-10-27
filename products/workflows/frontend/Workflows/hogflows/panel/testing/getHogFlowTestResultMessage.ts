import { HogflowTestResult } from '../../steps/types'

export function emailSkipReason(result: HogflowTestResult | null): string | undefined {
    return result?.emailSendResult?.status === 'skipped' ? result.emailSendResult.reason : undefined
}

export function getHogFlowTestResultMessage(result: HogflowTestResult): string {
    if (result.status === 'success') {
        return 'Success'
    }
    if (result.status === 'error') {
        return 'Error: ' + result.errors?.join(', ')
    }
    return (
        emailSkipReason(result) ??
        (result.nextActionId
            ? 'This step was skipped. See the logs for details.'
            : 'Workflow was skipped because the event did not match the filter criteria')
    )
}
