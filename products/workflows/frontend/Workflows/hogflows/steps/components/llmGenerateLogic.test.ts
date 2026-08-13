import { expectLogic } from 'kea-test-utils'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { workflowLogic } from '../../../workflowLogic'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import { hogFlowOutputMappingLogic } from '../../panel/hogFlowOutputMappingLogic'
import { HogFlowAction, HogFlowActionNode } from '../../types'
import { DEFAULT_LLM_MODEL, LLM_MODEL_OPTIONS, llmGenerateLogic } from './llmGenerateLogic'

const WORKFLOW_ID = 'test-workflow'
const ACTION_ID = 'llm-action'

const makeLlmNode = (): HogFlowActionNode => ({
    id: ACTION_ID,
    type: 'hogFlowAction',
    position: { x: 0, y: 0 },
    data: {
        id: ACTION_ID,
        type: 'function',
        name: 'Generate text',
        description: '',
        created_at: 0,
        updated_at: 0,
        config: { template_id: 'template-workflow-llm', inputs: {} },
        output_variable: { key: 'subject', result_path: 'fields.subject' },
    } as HogFlowAction,
})

describe('llmGenerateLogic', () => {
    // The picker is the frontend half of a pin: these ids are the deliberate subset the endpoint
    // validates against (products/workflows/backend/services/llm_models.py). Drift here means a
    // saved workflow naming a model the endpoint rejects, or a picker the backend never offered.
    describe('model options', () => {
        it('offers the six backend picker models, grouped by provider and cheapest first', () => {
            expect(LLM_MODEL_OPTIONS.flatMap((section) => section.options.map((option) => option.value))).toEqual([
                'gpt-4.1-mini',
                'gpt-5-mini',
                'gpt-5.4',
                'claude-haiku-4-5',
                'claude-sonnet-4-6',
                'claude-opus-4-8',
            ])
        })

        it('defaults to a model the picker offers', () => {
            expect(DEFAULT_LLM_MODEL).toBe('gpt-5-mini')
        })
    })

    describe('logic', () => {
        let logic: ReturnType<typeof llmGenerateLogic.build>
        let mappingLogic: ReturnType<typeof hogFlowOutputMappingLogic.build>
        let editorLogic: ReturnType<typeof hogFlowEditorLogic.build>
        let wfLogic: ReturnType<typeof workflowLogic.build>
        let invocationBodies: Record<string, any>[]
        let invocationResponse: () => Promise<Record<string, any>>

        beforeEach(async () => {
            invocationBodies = []
            invocationResponse = () => Promise.resolve({ status: 'success', nextActionId: null, execResult: null })
            useMocks({
                post: {
                    '/api/environments/:team_id/hog_flows/:id/invocations/': async ({ request }) => {
                        invocationBodies.push((await request.json()) as Record<string, any>)
                        return [200, await invocationResponse()]
                    },
                },
                get: {
                    '/api/environments/:team_id/hog_flows/:id/': {
                        id: WORKFLOW_ID,
                        name: 'Test workflow',
                        actions: [makeLlmNode().data],
                        edges: [],
                        variables: [],
                        version: 1,
                        status: 'draft',
                        exit_condition: 'exit_only_at_end',
                        team_id: 1,
                        created_at: '',
                        updated_at: '',
                    },
                    '/api/environments/:team_id/messaging_categories/': { results: [], count: 0 },
                    '/api/projects/:team_id/hog_function_templates/': { results: [], count: 0 },
                },
            })
            initKeaTests()

            wfLogic = workflowLogic({ id: WORKFLOW_ID })
            wfLogic.mount()
            await expectLogic(wfLogic).toDispatchActions(['loadWorkflowSuccess'])
            // Autosave would PATCH the workflow on every edit these tests make, which says nothing
            // about the logic under test.
            wfLogic.actions.setAutoSaveEnabled(false)
            editorLogic = hogFlowEditorLogic({ id: WORKFLOW_ID })
            editorLogic.mount()
            mappingLogic = hogFlowOutputMappingLogic({ id: WORKFLOW_ID })
            mappingLogic.mount()
            logic = llmGenerateLogic({ id: WORKFLOW_ID })
            logic.mount()

            const node = makeLlmNode()
            await expectLogic(editorLogic, () => {
                editorLogic.actions.setNodesRaw([node])
                editorLogic.actions.setSelectedNodeId(ACTION_ID)
            }).toMatchValues({ selectedNode: node })
        })

        describe('derived output variables', () => {
            // A row a field does not own is the author's: the raw generation captured under a
            // variable, or one extracted field routed into a second variable.
            it('regenerates a row per output field and leaves rows no field owns alone', async () => {
                mappingLogic.actions.initMappings([
                    { key: 'whole_thing', result_path: 'text' },
                    { key: 'copy_of_subject', result_path: 'fields.subject' },
                    { key: 'subject', result_path: 'fields.subject' },
                ])

                await expectLogic(logic, () => {
                    logic.actions.setOutputFields([
                        { key: 'subject', instruction: 'A short subject line' },
                        { key: 'body', instruction: 'The email body' },
                    ])
                }).toFinishAllListeners()

                expect(mappingLogic.values.mappings).toEqual([
                    { key: 'subject', result_path: 'fields.subject' },
                    { key: 'body', result_path: 'fields.body' },
                    { key: 'whole_thing', result_path: 'text' },
                    { key: 'copy_of_subject', result_path: 'fields.subject' },
                ])
            })

            it('drops the row of a removed field and keeps the rest', async () => {
                mappingLogic.actions.initMappings([
                    { key: 'subject', result_path: 'fields.subject' },
                    { key: 'body', result_path: 'fields.body' },
                ])

                await expectLogic(logic, () => {
                    logic.actions.setOutputFields([{ key: 'body', instruction: 'The email body' }])
                }).toFinishAllListeners()

                expect(mappingLogic.values.mappings).toEqual([{ key: 'body', result_path: 'fields.body' }])
            })

            // The instructions and the mappings are two halves of one step: a run that keeps the
            // mappings but loses the instructions generates nothing, bills for it, and leaves the
            // variables downstream steps read unset.
            it('saves the declared fields alongside the mappings they generate', async () => {
                await expectLogic(logic, () => {
                    logic.actions.setModel('claude-haiku-4-5')
                    logic.actions.setOutputFields([{ key: 'subject', instruction: 'A short subject line' }])
                }).toFinishAllListeners()

                const action = wfLogic.values.workflow.actions.find((a) => a.id === ACTION_ID)
                expect(action?.config).toMatchObject({
                    inputs: {
                        model: { value: 'claude-haiku-4-5' },
                        output_fields: { value: { subject: 'A short subject line' } },
                    },
                })
                expect(action?.output_variable).toEqual({ key: 'subject', result_path: 'fields.subject' })
            })

            it('ignores a field row that has no variable picked yet', async () => {
                await expectLogic(logic, () => {
                    logic.actions.setOutputFields([
                        { key: '', instruction: 'Not pointed at a variable yet' },
                        { key: 'body', instruction: 'The email body' },
                    ])
                }).toFinishAllListeners()

                expect(mappingLogic.values.mappings).toEqual([{ key: 'body', result_path: 'fields.body' }])
            })
        })

        // Two rows writing one variable is last-write-wins at runtime, so the picker only offers
        // variables nothing else already writes.
        it('offers only the variables no field and no mapping writes', async () => {
            wfLogic.actions.setWorkflowInfo({
                variables: [
                    { key: 'subject', label: 'Subject', type: 'string', default: '' },
                    { key: 'whole_thing', label: 'Whole thing', type: 'string', default: '' },
                    { key: 'body', label: 'Body', type: 'string', default: '' },
                ],
            })
            mappingLogic.actions.initMappings([{ key: 'whole_thing', result_path: 'text' }])

            await expectLogic(logic, () => {
                logic.actions.setOutputFields([{ key: 'subject', instruction: 'A short subject line' }])
            }).toFinishAllListeners()

            expect(logic.values.availableVariableKeys).toEqual(['body'])
        })

        describe('preview', () => {
            it('splits the response into generated text, extracted fields and variable values', async () => {
                invocationResponse = () =>
                    Promise.resolve({
                        status: 'success',
                        nextActionId: null,
                        variables: { subject: 'Your weekly digest' },
                        execResult: { text: 'Hello there', fields: { subject: 'Your weekly digest' } },
                    })

                await expectLogic(logic, () => {
                    logic.actions.runPreview()
                }).toFinishAllListeners()

                expect(logic.values.previewResult).toEqual({
                    text: 'Hello there',
                    fields: { subject: 'Your weekly digest' },
                    variables: { subject: 'Your weekly digest' },
                })
                expect(logic.values.previewError).toBeNull()
                expect(logic.values.previewLoading).toBe(false)
            })

            it('runs the real model against the step, keeping its output variables', async () => {
                await expectLogic(logic, () => {
                    logic.actions.runPreview()
                }).toFinishAllListeners()

                expect(invocationBodies).toHaveLength(1)
                expect(invocationBodies[0]).toMatchObject({
                    mock_async_functions: false,
                    current_action_id: ACTION_ID,
                })
                expect(invocationBodies[0].configuration.actions[0].output_variable).toEqual({
                    key: 'subject',
                    result_path: 'fields.subject',
                })
            })

            // A generation-less run has two very different causes, and the runtime tells them apart
            // only in the logs: telling a skipped step it timed out sends the author after the
            // prompt and the model, neither of which ran.
            it.each([
                {
                    name: 'a preview that ran out of time',
                    log: 'The preview stopped after 25 seconds. The step gets longer when the workflow runs. Try a shorter prompt or a faster model.',
                    expected:
                        'The preview stopped after 25 seconds. The step gets longer when the workflow runs. Try a shorter prompt or a faster model.',
                },
                {
                    name: 'a step skipped by its own conditions',
                    log: 'Skipped due to filter conditions',
                    expected:
                        "The sample event didn't match this step's conditions, so the step was skipped. Change the conditions or the sample event, then run the preview again.",
                },
                {
                    name: 'a run that came back with nothing to show',
                    log: 'Executing action llm-action',
                    expected: "The preview didn't return any generated text. Try running it again.",
                },
            ])('reports $name as a notice, not a failed step', async ({ log, expected }) => {
                invocationResponse = () =>
                    Promise.resolve({
                        status: 'success',
                        nextActionId: null,
                        variables: {},
                        execResult: null,
                        logs: [{ level: 'info', timestamp: '2026-01-01T00:00:00Z', message: log }],
                    })

                await expectLogic(logic, () => {
                    logic.actions.runPreview()
                }).toFinishAllListeners()

                expect(logic.values.previewNotice).toBe(expected)
                expect(logic.values.previewError).toBeNull()
                expect(logic.values.previewResult).toBeNull()
            })

            it('surfaces a failed step as an error', async () => {
                invocationResponse = () =>
                    Promise.resolve({
                        status: 'error',
                        nextActionId: null,
                        errors: ['Could not generate text (quota_exceeded). You are out of AI credits.'],
                        execResult: null,
                    })

                await expectLogic(logic, () => {
                    logic.actions.runPreview()
                }).toFinishAllListeners()

                expect(logic.values.previewError).toBe(
                    'Could not generate text (quota_exceeded). You are out of AI credits.'
                )
                expect(logic.values.previewNotice).toBeNull()
            })

            // Prose reads as if the step produced it, so a result that lands after the author moved
            // on would be read as the wrong step's behavior.
            it('drops a result that arrives after the author moved to another step', async () => {
                let release: (response: Record<string, any>) => void = () => {}
                const inFlight = new Promise<Record<string, any>>((resolve) => {
                    release = resolve
                })
                invocationResponse = () => inFlight

                logic.actions.runPreview()
                await expectLogic(logic).toMatchValues({ previewLoadingForSelected: true })

                editorLogic.actions.setSelectedNodeId(null)
                logic.actions.setSelectedActionId(null)
                expect(logic.values.previewLoadingForSelected).toBe(false)

                release({ status: 'success', nextActionId: null, execResult: { text: 'Hello there' } })
                await expectLogic(logic).toDispatchActions(['endPreview'])

                expect(logic.values.previewResult).toBeNull()
            })

            // Every preview spends the project's AI credits, so a second click while one is in flight
            // must not buy a second generation.
            it('ignores a second preview while one is in flight', async () => {
                let release: (response: Record<string, any>) => void = () => {}
                const inFlight = new Promise<Record<string, any>>((resolve) => {
                    release = resolve
                })
                invocationResponse = () => inFlight

                logic.actions.runPreview()
                await expectLogic(logic).toMatchValues({ previewLoading: true })
                logic.actions.runPreview()
                release({ status: 'success', nextActionId: null, execResult: { text: 'ok' } })

                await expectLogic(logic).toFinishAllListeners()
                expect(invocationBodies).toHaveLength(1)
            })
        })
    })
})
