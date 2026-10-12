import { useActions, useValues } from 'kea'

import { IconPlay } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { FEATURE_FLAGS } from 'lib/constants'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { workflowLogic } from '../../../workflowLogic'
import { HogflowTestInvocation, TestRunSource, hogFlowEditorTestLogic } from './hogFlowEditorTestLogic'

interface HogFlowRunAllStepsButtonProps {
    source?: TestRunSource
    testInvocation: HogflowTestInvocation
    hasTestData: boolean
    isTestInvocationSubmitting: boolean
}

export function HogFlowRunAllStepsButton({
    source = 'workflow',
    testInvocation,
    hasTestData,
    isTestInvocationSubmitting,
}: HogFlowRunAllStepsButtonProps): JSX.Element | null {
    const { logicProps } = useValues(workflowLogic)
    const { featureFlags } = useValues(featureFlagLogic)
    const { runAllSteps } = useActions(hogFlowEditorTestLogic(logicProps))

    if (featureFlags[FEATURE_FLAGS.WORKFLOWS_TESTING_V2] !== true) {
        return null
    }

    return (
        <LemonButton
            type="secondary"
            icon={<IconPlay />}
            data-attr="run-all-workflow-test-steps"
            onClick={() => runAllSteps(testInvocation, source)}
            disabledReason={
                !hasTestData
                    ? 'Load test data to run the steps'
                    : isTestInvocationSubmitting
                      ? 'Wait for the current test to finish'
                      : undefined
            }
            tooltip="Run every step from the trigger to the end. Emails, texts and push notifications are not sent in a full run. Test a message step on its own to send it."
            size="small"
        >
            Run all steps
        </LemonButton>
    )
}
