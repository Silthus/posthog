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
    const { requestRunAllSteps } = useActions(hogFlowEditorTestLogic(logicProps))

    const { testRunning } = useValues(hogFlowEditorTestLogic(logicProps))

    if (featureFlags[FEATURE_FLAGS.WORKFLOWS_TESTING_V2] !== true) {
        return null
    }

    return (
        <LemonButton
            type="secondary"
            icon={<IconPlay />}
            data-attr="run-all-workflow-test-steps"
            onClick={() => requestRunAllSteps(testInvocation, source)}
            loading={testRunning}
            disabledReason={
                !hasTestData
                    ? 'Load test data to run the steps'
                    : isTestInvocationSubmitting || testRunning
                      ? 'Wait for the current test to finish'
                      : undefined
            }
            tooltip={
                source === 'email'
                    ? 'Run every step from the trigger to the end. All messages and HTTP requests stay mocked.'
                    : 'Run every step from the trigger to the end. Built-in email, SMS and push steps stay mocked. Other HTTP steps follow the request setting.'
            }
            size="small"
        >
            Run all steps
        </LemonButton>
    )
}
