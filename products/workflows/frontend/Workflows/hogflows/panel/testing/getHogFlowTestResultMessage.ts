import { HogflowTestResult } from '../../steps/types'

export function getHogFlowTestResultMessage(result: HogflowTestResult): string {
    if (result.status === 'success') {
        return 'Success'
    }
    if (result.status === 'error') {
        return 'Error: ' + result.errors?.join(', ')
    }
    return (
        result.logs?.findLast((log) => /^Skipping send:|sandbox/i.test(log.message))?.message ??
        (result.nextActionId
            ? 'This step was skipped. See the logs for details.'
            : 'Workflow was skipped because the event did not match the filter criteria')
    )
}
