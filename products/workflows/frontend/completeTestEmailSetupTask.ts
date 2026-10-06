import { SetupTaskId, globalSetupLogic } from 'lib/components/ProductSetup'

import { findTestSendSkipReason } from './Workflows/hogflows/findTestSendSkipReason'
import type { HogflowTestResult } from './Workflows/hogflows/steps/types'

export function completeTestEmailSetupTask(result: HogflowTestResult | null): void {
    if (result?.status === 'success' && !findTestSendSkipReason(result)) {
        globalSetupLogic.findMounted()?.actions.markTaskAsCompleted(SetupTaskId.SendWorkflowTestEmail)
    }
}
