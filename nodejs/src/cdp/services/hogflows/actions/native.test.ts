import { FixtureHogFlowBuilder } from '~/cdp/_tests/builders/hogflow.builder'
import { createExampleHogFlowInvocation } from '~/cdp/_tests/fixtures-hogflows'
import { HogFlow, HogFlowAction } from '~/cdp/schema/hogflow'
import { PosthogJwtAudience } from '~/cdp/utils/jwt-utils'
import { ScopedServiceJwt } from '~/cdp/utils/scoped-service-jwt'
import { parseJSON } from '~/common/utils/json-parse'
import { FetchResponse, internalFetch } from '~/common/utils/request'

import { HogExecutorAsyncService } from '../../hog-executor-async.service'
import { HogExecutorService } from '../../hog-executor.service'
import { HogInputsService } from '../../hog-inputs.service'
import { HogFunctionTemplateManagerService } from '../../managers/hog-function-template-manager.service'
import { EmailValidationService } from '../../messaging/email-validation.service'
import { RecipientPreferencesService } from '../../messaging/recipient-preferences.service'
import { HogFlowExecutorService } from '../hogflow-executor.service'
import { HogFlowFunctionsService } from '../hogflow-functions.service'
import { SlackAppLookup } from './trigger.handler'

jest.mock('~/common/utils/request', () => ({
    ...jest.requireActual('~/common/utils/request'),
    internalFetch: jest.fn(),
}))

const INTERNAL_API_BASE_URL = 'http://django.internal'
const SIGNING_KEY = 'native-steps-test-key'

describe('native workflow steps', () => {
    const mockInternalFetch = jest.mocked(internalFetch)
    const routeKey = new ScopedServiceJwt(PosthogJwtAudience.WORKFLOW_NODES_RUN, SIGNING_KEY)

    const buildExecutor = (signingKey: string): HogFlowExecutorService => {
        const hogInputsService = new HogInputsService({} as any, undefined, {} as any)
        const hogExecutorAsync = {
            hogExecutor: new HogExecutorService({ executionTimeoutMs: 60_000 }, hogInputsService),
        } as HogExecutorAsyncService
        const hogFlowFunctionsService = new HogFlowFunctionsService(
            'http://localhost:8000',
            {} as HogFunctionTemplateManagerService,
            hogExecutorAsync
        )
        return new HogFlowExecutorService(
            hogFlowFunctionsService,
            {} as RecipientPreferencesService,
            {} as EmailValidationService,
            { getMemberCohortIds: () => Promise.resolve([]) },
            {} as SlackAppLookup,
            undefined,
            undefined,
            {
                nativeSteps: {
                    jwt: new ScopedServiceJwt(PosthogJwtAudience.WORKFLOW_NODES_RUN, signingKey),
                    internalApiBaseUrl: INTERNAL_API_BASE_URL,
                },
            }
        )
    }

    const buildFlow = ({
        onError = 'continue',
        rolloutTemplate = '{{ variables.next_percentage }}',
        wireFailed = false,
    }: {
        onError?: HogFlowAction['on_error']
        rolloutTemplate?: string
        wireFailed?: boolean
    } = {}): HogFlow =>
        new FixtureHogFlowBuilder()
            .withWorkflow({
                actions: {
                    trigger: { type: 'trigger', config: { type: 'event', filters: {} } },
                    flag_step: {
                        type: 'native',
                        on_error: onError,
                        output_variable: { key: 'flag' },
                        config: {
                            node: 'feature_flag',
                            operation: 'set_rollout_percentage',
                            inputs: {
                                flag_key: { value: 'new-checkout' },
                                rollout_percentage: {
                                    value: rolloutTemplate,
                                    templating: 'liquid',
                                },
                            },
                        },
                    },
                    after_done: { type: 'exit', config: {} },
                    after_changed_elsewhere: { type: 'exit', config: {} },
                    after_failed: { type: 'exit', config: {} },
                },
                edges: [
                    { from: 'trigger', to: 'flag_step', type: 'continue' },
                    {
                        from: 'flag_step',
                        to: 'after_changed_elsewhere',
                        type: 'continue',
                        outcome: 'changed_elsewhere',
                    },
                    { from: 'flag_step', to: 'after_done', type: 'continue' },
                    ...(wireFailed
                        ? [{ from: 'flag_step', to: 'after_failed', type: 'branch' as const, outcome: 'failed' }]
                        : []),
                ],
            })
            .build()

    const respondWith = (status: number, body: unknown): void => {
        mockInternalFetch.mockResolvedValue({
            status,
            headers: {},
            json: () => Promise.resolve(body),
            text: () => Promise.resolve(JSON.stringify(body)),
            dump: () => Promise.resolve(),
        } as FetchResponse)
    }

    const runFlow = async (hogFlow: HogFlow, signingKey = SIGNING_KEY, variables: Record<string, unknown> = {}) => {
        const invocation = createExampleHogFlowInvocation(hogFlow)
        invocation.state.variables = { next_percentage: 25, ...variables }
        const result = await buildExecutor(signingKey).execute(invocation)
        return { invocation, result }
    }

    const flagResult = { flag_id: 7, flag_key: 'new-checkout', rollout_percentage: 25, version: 4 }

    it('posts the rendered inputs to the internal route with the step claims', async () => {
        respondWith(200, { status: 'outcome', outcome: 'done', result: flagResult })

        const { invocation } = await runFlow(buildFlow())

        expect(mockInternalFetch).toHaveBeenCalledTimes(1)
        const [url, request] = mockInternalFetch.mock.calls[0]
        expect(url).toBe(`${INTERNAL_API_BASE_URL}/api/projects/${invocation.teamId}/internal/workflow_nodes/run/`)
        expect(request?.method).toBe('POST')
        expect(parseJSON(request?.body as string)).toEqual({
            node: 'feature_flag',
            operation: 'set_rollout_percentage',
            inputs: { flag_key: 'new-checkout', rollout_percentage: '25' },
        })
        const token = (request?.headers as Record<string, string>).Authorization.replace('Bearer ', '')
        expect(routeKey.verify(token)).toMatchObject({
            team_id: invocation.teamId,
            hog_flow_id: invocation.hogFlow.id,
            hog_flow_version: invocation.hogFlow.version,
            action_id: 'flag_step',
            dispatch_key: `${invocation.id}:flag_step:0`,
        })
    })

    it.each([
        {
            case: 'the primary outcome follows the continue edge',
            response: { status: 200, body: { status: 'outcome', outcome: 'done', result: flagResult } },
            endsAt: 'after_done',
            error: undefined,
            flag: flagResult,
        },
        {
            case: 'an outcome follows the edge wired to it',
            response: {
                status: 200,
                body: { status: 'outcome', outcome: 'changed_elsewhere', result: { ...flagResult, version: 5 } },
            },
            endsAt: 'after_changed_elsewhere',
            error: undefined,
            flag: { ...flagResult, version: 5 },
        },
        {
            case: 'an unwired non-primary outcome ends the run with an error despite on_error continue',
            response: {
                status: 200,
                body: { status: 'outcome', outcome: 'needs_approval', result: { change_request_id: 'cr-1' } },
            },
            endsAt: 'flag_step',
            error: expect.stringContaining('needs_approval'),
            flag: { change_request_id: 'cr-1' },
        },
        {
            case: 'an unwired failed outcome follows on_error',
            response: { status: 200, body: { status: 'outcome', outcome: 'failed', result: { reason: 'No flag.' } } },
            endsAt: 'after_done',
            error: undefined,
            flag: { reason: 'No flag.' },
        },
        {
            case: 'a rejected call is a failed outcome',
            response: { status: 401, body: { detail: 'Invalid token.' } },
            endsAt: 'after_done',
            error: undefined,
            flag: { reason: expect.stringContaining('401') },
        },
        {
            case: 'an answer without an outcome is a failed outcome',
            response: { status: 200, body: { status: 'pending', wait: 'recheck' } },
            endsAt: 'after_done',
            error: undefined,
            flag: { reason: expect.any(String) },
        },
    ])('$case', async ({ response, endsAt, error, flag }) => {
        respondWith(response.status, response.body)

        const { result } = await runFlow(buildFlow())

        expect(result.finished).toBe(true)
        expect(result.error).toEqual(error)
        expect(result.invocation.state.currentAction?.id).toBe(endsAt)
        expect(result.invocation.state.variables?.flag).toEqual(flag)
    })

    it('fails the step without calling Django when no signing key is configured', async () => {
        const { result } = await runFlow(buildFlow({ onError: 'abort' }), '')

        expect(mockInternalFetch).not.toHaveBeenCalled()
        expect(result.finished).toBe(true)
        expect(result.invocation.state.currentAction?.id).toBe('flag_step')
        expect(result.error).toEqual(expect.stringContaining('WORKFLOW_NODES_RUN_JWT_SECRET'))
    })

    it('ends the run on an unwired outcome even when its result overflows the run variables', async () => {
        respondWith(200, { status: 'outcome', outcome: 'not_permitted', result: { missing_permission: 'editor' } })

        const { result } = await runFlow(buildFlow(), SIGNING_KEY, { notes: 'x'.repeat(5080) })

        expect(result.finished).toBe(true)
        expect(result.invocation.state.currentAction?.id).toBe('flag_step')
        expect(result.error).toEqual(expect.stringContaining('not_permitted'))
    })

    it('follows a wired failed edge when the inputs cannot be rendered', async () => {
        const { result } = await runFlow(buildFlow({ rolloutTemplate: '{% if %}', wireFailed: true }))

        expect(mockInternalFetch).not.toHaveBeenCalled()
        expect(result.invocation.state.currentAction?.id).toBe('after_failed')
        expect(result.invocation.state.variables?.flag).toEqual({ reason: expect.stringContaining('render') })
    })
})
