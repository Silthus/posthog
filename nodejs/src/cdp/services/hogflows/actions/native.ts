import { DateTime } from 'luxon'
import { z } from 'zod'

import { internalApiRequest } from '~/cdp/async-functions/internal-api-call'
import { HogFlowAction } from '~/cdp/schema/hogflow'
import { CyclotronJobInvocationHogFlow, MinimalLogEntry } from '~/cdp/types'
import { ScopedServiceJwt } from '~/cdp/utils/scoped-service-jwt'
import { buildWorkflowStepDispatchKey } from '~/cdp/utils/workflow-step-dispatch-key'

import { HogExecutorExecuteAsyncOptions } from '../../hog-executor-async.service'
import { HogFlowFunctionsService } from '../hogflow-functions.service'
import { RunEndingStepError, actionIdForLogging, findActionById, findNextAction } from '../hogflow-utils'
import { ActionHandler, ActionHandlerOptions, ActionHandlerResult } from './action.interface'

type Action = Extract<HogFlowAction, { type: 'native' }>

export type NativeStepsConfig = {
    jwt: ScopedServiceJwt
    internalApiBaseUrl: string
}

// Every operation in the node manifests lists `done` as its primary outcome.
const PRIMARY_OUTCOME = 'done'
const FAILED_OUTCOME = 'failed'

const OperationAnswerSchema = z.object({
    status: z.literal('outcome'),
    outcome: z.string().min(1),
    result: z.record(z.string(), z.unknown()),
})

type OperationAnswer = Pick<z.infer<typeof OperationAnswerSchema>, 'outcome' | 'result'>

const failed = (reason: string): OperationAnswer => ({ outcome: FAILED_OUTCOME, result: { reason } })

const asyncFunctionsAreMocked = (options?: HogExecutorExecuteAsyncOptions): boolean =>
    options?.asyncFunctionsNames?.length === 0

export class NativeNodeHandler implements ActionHandler {
    constructor(
        private hogFlowFunctionsService: HogFlowFunctionsService,
        private config: NativeStepsConfig
    ) {}

    async execute({
        invocation,
        action,
        result,
        hogExecutorOptions,
    }: ActionHandlerOptions<Action>): Promise<ActionHandlerResult> {
        if (asyncFunctionsAreMocked(hogExecutorOptions)) {
            result.logs.push({
                level: 'info',
                timestamp: DateTime.now(),
                message: `${actionIdForLogging(action)} Skipped ${action.config.node}.${action.config.operation}: async functions are mocked, so the step changed nothing`,
            })
            return { nextAction: findNextAction(invocation.hogFlow, action.id) }
        }

        const answer = await this.runOperation(invocation, action, result.logs)
        result.logs.push({
            level: 'info',
            timestamp: DateTime.now(),
            message: `${actionIdForLogging(action)} Finished with outcome '${answer.outcome}'`,
        })
        return { result: answer.result, ...this.route(invocation, action, answer) }
    }

    private async runOperation(
        invocation: CyclotronJobInvocationHogFlow,
        action: Action,
        logs: MinimalLogEntry[]
    ): Promise<OperationAnswer> {
        if (!this.config.jwt.enabled) {
            return failed(
                'Native workflow steps are not configured in this environment (WORKFLOW_NODES_RUN_JWT_SECRET unset).'
            )
        }

        const { hogFlow } = invocation
        let inputs: Record<string, unknown>
        try {
            inputs = await this.hogFlowFunctionsService.renderNativeStepInputs(invocation, action)
        } catch (error) {
            return failed(`The step inputs could not be rendered. ${String(error)}`)
        }
        const response = await internalApiRequest({
            jwt: this.config.jwt,
            teamId: invocation.teamId,
            internalApiBaseUrl: this.config.internalApiBaseUrl,
            path: `/api/projects/${invocation.teamId}/internal/workflow_nodes/run/`,
            method: 'POST',
            entityClaims: {
                hog_flow_id: hogFlow.id,
                hog_flow_version: hogFlow.version,
                action_id: action.id,
                dispatch_key: buildWorkflowStepDispatchKey(
                    invocation.id,
                    action.id,
                    invocation.state.actionStepCount,
                    invocation.state.rerunAttempts
                ),
            },
            body: JSON.stringify({ node: action.config.node, operation: action.config.operation, inputs }),
            logs,
        })

        if (response.status !== 200) {
            return failed(`The step's call to PostHog failed with status code ${response.status}.`)
        }
        const answer = OperationAnswerSchema.safeParse(response.body)
        if (!answer.success) {
            return failed('PostHog answered the step without an outcome.')
        }
        return answer.data
    }

    private route(
        invocation: CyclotronJobInvocationHogFlow,
        action: Action,
        { outcome, result }: OperationAnswer
    ): Pick<ActionHandlerResult, 'nextAction' | 'error'> {
        if (outcome === PRIMARY_OUTCOME) {
            return { nextAction: findNextAction(invocation.hogFlow, action.id) }
        }

        const outcomeEdge = invocation.hogFlow.edges.find((edge) => edge.from === action.id && edge.outcome === outcome)
        if (outcomeEdge) {
            return { nextAction: findActionById(invocation.hogFlow, outcomeEdge.to) }
        }

        const reason = typeof result.reason === 'string' ? ` ${result.reason}` : ''
        if (outcome === FAILED_OUTCOME) {
            return { error: new Error(`The step failed.${reason}`) }
        }
        return {
            error: new RunEndingStepError(`The step ended with outcome '${outcome}', and no edge handles it.${reason}`),
        }
    }
}
