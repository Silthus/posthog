import { useActions, useValues } from 'kea'

import { LemonButton, LemonDivider, LemonLabel, LemonSelect, Spinner } from '@posthog/lemon-ui'

import { CyclotronJobInputs } from 'lib/components/CyclotronJob/CyclotronJobInputs'

import { CyclotronJobInputSchemaType, CyclotronJobInputType } from '~/types'

import { workflowLogic } from '../../workflowLogic'
import { NATIVE_PRIMARY_OUTCOME, getOutcomeLabel } from '../hogFlowEdges'
import { buildSampleGlobals } from './components/HogFlowFunctionConfiguration'
import { StepSchemaErrors } from './components/StepSchemaErrors'
import { NativeAction, stepNativeLogic } from './stepNativeLogic'

export function StepNativeConfiguration({ action }: { action: NativeAction }): JSX.Element {
    const { workflow, logicProps } = useValues(workflowLogic)
    const { partialSetWorkflowActionConfig } = useActions(workflowLogic)
    const logic = stepNativeLogic({ workflowLogicProps: logicProps, actionId: action.id })
    const { workflowNodes, workflowNodesLoading, operation, operationOptions, outcomePaths } = useValues(logic)
    const { setOperation, addOutcomePath, removeOutcomePath } = useActions(logic)

    if (workflowNodesLoading) {
        return <Spinner />
    }

    if (!workflowNodes) {
        return <p className="text-secondary">Couldn't load this step's settings. Refresh the page to try again.</p>
    }

    if (!operation) {
        return (
            <p className="text-secondary">
                This step's operation isn't available anymore. Delete the step and add a new one.
            </p>
        )
    }

    const inputs = action.config.inputs as Record<string, CyclotronJobInputType>

    return (
        <div className="flex flex-col gap-3">
            <StepSchemaErrors />

            <div className="flex flex-col gap-1">
                <LemonLabel>Operation</LemonLabel>
                <LemonSelect
                    options={operationOptions}
                    value={operation.key}
                    onChange={setOperation}
                    data-attr="workflow-native-step-operation"
                />
            </div>

            <CyclotronJobInputs
                // The input renderer snapshots its values on mount, so another operation must remount it.
                key={`${action.id}-${operation.key}`}
                configuration={{
                    inputs,
                    inputs_schema: operation.inputs_schema as CyclotronJobInputSchemaType[],
                }}
                showSource={false}
                sampleGlobalsWithInputs={buildSampleGlobals(workflow.trigger, workflow.variables)}
                onInputChange={(key, value) =>
                    partialSetWorkflowActionConfig(action.id, { inputs: { ...inputs, [key]: value } })
                }
            />

            <LemonDivider className="my-0" />

            <div className="flex flex-col gap-2">
                <LemonLabel>Outcome paths</LemonLabel>
                <p className="mb-0 text-xs text-secondary">
                    {getOutcomeLabel(NATIVE_PRIMARY_OUTCOME)} continues on the main path. Failed follows the step's
                    error handling. Any other outcome without its own path ends the run with an error.
                </p>
                {outcomePaths.map((path) => (
                    <div key={path.outcome} className="flex items-center justify-between gap-2">
                        <span>{path.label}</span>
                        {path.hasPath ? (
                            <LemonButton
                                size="small"
                                type="secondary"
                                status="danger"
                                disabledReason={path.removeDisabledReason}
                                onClick={() => removeOutcomePath(path.outcome)}
                                data-attr="workflow-native-step-remove-outcome-path"
                            >
                                Remove path
                            </LemonButton>
                        ) : (
                            <LemonButton
                                size="small"
                                type="secondary"
                                onClick={() => addOutcomePath(path.outcome)}
                                data-attr="workflow-native-step-add-outcome-path"
                            >
                                Add path
                            </LemonButton>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
