import { MakeLogicType, actions, connect, kea, key, listeners, path, props, reducers, selectors } from 'kea'

import api from 'lib/api'
import { LemonSelectSection } from 'lib/lemon-ui/LemonSelect/LemonSelect'
import { LogEntry } from 'scenes/hog-functions/logs/logsViewerLogic'

import type { CyclotronJobInvocationGlobals, HogFunctionTemplateType } from '~/types'

import { WorkflowLogicProps, workflowLogic } from '../../../workflowLogic'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import {
    OutputMapping,
    buildTestInvocation,
    hogFlowOutputMappingLogic,
    toOutputVariable,
} from '../../panel/hogFlowOutputMappingLogic'
import { hogFlowEditorTestLogic } from '../../panel/testing/hogFlowEditorTestLogic'
import type { HogFlow, HogFlowAction, HogFlowActionNode } from '../../types'
import { CyclotronInputType, HogflowTestResult } from '../types'

export const LLM_TEMPLATE_ID = 'template-workflow-llm'

/** A declared output field: the workflow variable it fills, and what to put in it. */
export type LlmOutputField = { key: string; instruction: string }

/** What a finished preview shows: the generation, what was extracted from it, and where it landed. */
export type LlmPreviewResult = {
    text: string
    fields: Record<string, string>
    variables: Record<string, any>
}

export const PREVIEW_DEADLINE_SECONDS = 25
export const PREVIEW_DEADLINE_MESSAGE = `The preview stopped after ${PREVIEW_DEADLINE_SECONDS} seconds. The step gets longer when the workflow runs. Try a shorter prompt or a faster model.`
const SKIPPED_MESSAGE = `The sample event didn't match this step's conditions, so the step was skipped. Change the conditions or the sample event, then run the preview again.`
const NO_GENERATION_MESSAGE = `The preview didn't return any generated text. Try running it again.`
/** What the executor logs when a step's own filters keep it from running. */
const SKIPPED_LOG = 'Skipped due to filter conditions'

/**
 * A run that produced no generation and no error is either a step the filters skipped or a preview
 * that outlived its window. Only the logs tell them apart, and pointing a skipped step at the prompt
 * and the model sends the author after two things that never ran.
 */
const previewNoticeFor = (logs: LogEntry[] | undefined): string => {
    const messages = (logs ?? []).map((log) => String(log.message))
    if (messages.some((message) => message.includes(SKIPPED_LOG))) {
        return SKIPPED_MESSAGE
    }
    if (messages.some((message) => message.includes(PREVIEW_DEADLINE_MESSAGE))) {
        return PREVIEW_DEADLINE_MESSAGE
    }
    return NO_GENERATION_MESSAGE
}

/**
 * The models the picker offers, grouped by provider and cheapest first. A deliberate subset of what
 * the generation endpoint accepts, so refreshing this list can never reject a saved workflow.
 * Kept in step with `products/workflows/backend/services/llm_models.py`.
 */
export const LLM_MODEL_OPTIONS = [
    {
        title: 'OpenAI',
        options: [
            { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
            { value: 'gpt-5-mini', label: 'GPT-5 mini' },
            { value: 'gpt-5.4', label: 'GPT-5.4' },
        ],
    },
    {
        title: 'Anthropic',
        options: [
            { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
            { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
            { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
        ],
    },
] satisfies LemonSelectSection<string>[]

export const DEFAULT_LLM_MODEL = 'gpt-5-mini'

const fieldResultPath = (key: string): string => `fields.${key}`

/**
 * A row is the fields' to rewrite only when it is exactly what a field generates. A hand-added row
 * that reads a field into a second variable (`other_var` from `fields.subject`) is the author's, and
 * so is the raw-text row, so neither is claimed here.
 */
export const isFieldOwnedMapping = (mapping: OutputMapping): boolean =>
    !!mapping.key && mapping.result_path === fieldResultPath(mapping.key)

/**
 * The output-variable rows the declared fields own, ahead of the rows they don't. A row the fields
 * own is rewritten from the fields on every change, which is also how a removed field's row goes
 * away; anything else is left exactly as the author wrote it.
 */
export function deriveOutputMappings(fields: LlmOutputField[], existing: OutputMapping[]): OutputMapping[] {
    return [
        ...fields
            .filter((field) => field.key)
            .map((field) => ({ key: field.key, result_path: fieldResultPath(field.key) })),
        ...existing.filter((mapping) => !isFieldOwnedMapping(mapping)),
    ]
}

const readOutputFields = (inputs: Record<string, CyclotronInputType> | undefined): LlmOutputField[] => {
    const stored = inputs?.output_fields?.value
    if (!stored || typeof stored !== 'object') {
        return []
    }
    return Object.entries(stored as Record<string, unknown>).map(([key, instruction]) => ({
        key,
        instruction: typeof instruction === 'string' ? instruction : '',
    }))
}

// Generated by kea-typegen. Update if you're an agent, ignore if you're human.
export interface llmGenerateLogicValues {
    selectedNode: HogFlowActionNode | null // hogFlowEditorLogic
    accumulatedVariables: Record<string, any> // hogFlowEditorTestLogic
    sampleGlobals: CyclotronJobInvocationGlobals | null // hogFlowEditorTestLogic
    hogFunctionTemplatesById: Record<string, HogFunctionTemplateType> // workflowLogic
    workflow: HogFlow // workflowLogic
    mappings: OutputMapping[] // hogFlowOutputMappingLogic
    availableVariableKeys: string[]
    model: string
    outputFields: LlmOutputField[]
    previewActionId: string | null
    previewElapsedSeconds: number
    previewError: string | null
    previewLoading: boolean
    previewLoadingForSelected: boolean
    previewNotice: string | null
    previewResult: LlmPreviewResult | null
}

// Generated by kea-typegen. Update if you're an agent, ignore if you're human.
export interface llmGenerateLogicActions {
    endPreview: () => {
        value: true
    }
    initOutputFields: (fields: LlmOutputField[]) => {
        fields: LlmOutputField[]
    }
    runPreview: () => {
        value: true
    }
    setModel: (model: string) => {
        model: string
    }
    setOutputFields: (fields: LlmOutputField[]) => {
        fields: LlmOutputField[]
    }
    setPreviewElapsedSeconds: (seconds: number) => {
        seconds: number
    }
    setPreviewError: (error: string) => {
        error: string
    }
    setPreviewNotice: (notice: string) => {
        notice: string
    }
    setPreviewResult: (result: LlmPreviewResult) => {
        result: LlmPreviewResult
    }
    setSelectedActionId: (actionId: string | null) => {
        actionId: string | null
    }
    startPreview: (actionId: string) => {
        actionId: string
    }
}

// Generated by kea-typegen. Update if you're an agent, ignore if you're human.
export interface llmGenerateLogicMeta {
    key: string
    __keaTypeGenInternalSelectorTypes: {
        previewLoadingForSelected: (
            previewLoading: boolean,
            previewActionId: string | null,
            selectedNode: HogFlowActionNode | null
        ) => boolean
        model: (selectedNode: HogFlowActionNode | null) => string
        availableVariableKeys: (
            workflow: HogFlow,
            outputFields: LlmOutputField[],
            mappings: OutputMapping[]
        ) => string[]
    }
}

export type llmGenerateLogicType = MakeLogicType<
    llmGenerateLogicValues,
    llmGenerateLogicActions,
    WorkflowLogicProps,
    llmGenerateLogicMeta
>

export const llmGenerateLogic = kea<llmGenerateLogicType>([
    path((key) => [
        'products',
        'workflows',
        'frontend',
        'Workflows',
        'hogflows',
        'steps',
        'components',
        'llmGenerateLogic',
        key,
    ]),
    props({} as WorkflowLogicProps),
    key((props) => props.id ?? 'new'),
    connect((props: WorkflowLogicProps) => ({
        values: [
            workflowLogic(props),
            ['workflow', 'hogFunctionTemplatesById'],
            hogFlowEditorLogic,
            ['selectedNode'],
            hogFlowEditorTestLogic(props),
            ['sampleGlobals', 'accumulatedVariables'],
            hogFlowOutputMappingLogic(props),
            ['mappings'],
        ],
    })),
    actions({
        setSelectedActionId: (actionId: string | null) => ({ actionId }),
        initOutputFields: (fields: LlmOutputField[]) => ({ fields }),
        setOutputFields: (fields: LlmOutputField[]) => ({ fields }),
        setModel: (model: string) => ({ model }),
        runPreview: true,
        startPreview: (actionId: string) => ({ actionId }),
        endPreview: true,
        setPreviewResult: (result: LlmPreviewResult) => ({ result }),
        setPreviewError: (error: string) => ({ error }),
        setPreviewNotice: (notice: string) => ({ notice }),
        setPreviewElapsedSeconds: (seconds: number) => ({ seconds }),
    }),
    reducers({
        outputFields: [
            [] as LlmOutputField[],
            {
                setSelectedActionId: () => [],
                initOutputFields: (_, { fields }) => fields,
                setOutputFields: (_, { fields }) => fields,
            },
        ],
        previewLoading: [
            false,
            {
                startPreview: () => true,
                endPreview: () => false,
            },
        ],
        previewActionId: [
            null as string | null,
            {
                startPreview: (_, { actionId }) => actionId,
            },
        ],
        previewElapsedSeconds: [
            0,
            {
                startPreview: () => 0,
                setPreviewElapsedSeconds: (_, { seconds }) => seconds,
            },
        ],
        previewResult: [
            null as LlmPreviewResult | null,
            {
                setSelectedActionId: () => null,
                startPreview: () => null,
                setPreviewResult: (_, { result }) => result,
            },
        ],
        previewError: [
            null as string | null,
            {
                setSelectedActionId: () => null,
                startPreview: () => null,
                setPreviewError: (_, { error }) => error,
            },
        ],
        previewNotice: [
            null as string | null,
            {
                setSelectedActionId: () => null,
                startPreview: () => null,
                setPreviewNotice: (_, { notice }) => notice,
            },
        ],
    }),
    selectors({
        // The preview runs against one step, so only that step's panel shows it running. The button
        // elsewhere stays disabled, because there is one preview at a time.
        previewLoadingForSelected: [
            (s) => [s.previewLoading, s.previewActionId, s.selectedNode],
            (
                previewLoading: boolean,
                previewActionId: string | null,
                selectedNode: HogFlowActionNode | null
            ): boolean => previewLoading && previewActionId === (selectedNode?.data.id ?? null),
        ],
        model: [
            (s) => [s.selectedNode],
            (selectedNode: HogFlowActionNode | null): string => {
                const config = selectedNode?.data.config
                const inputs = config && 'inputs' in config ? config.inputs : undefined
                const model = inputs?.model?.value
                return typeof model === 'string' && model ? model : DEFAULT_LLM_MODEL
            },
        ],
        availableVariableKeys: [
            (s) => [s.workflow, s.outputFields, s.mappings],
            (workflow: HogFlow, outputFields: LlmOutputField[], mappings: OutputMapping[]): string[] => {
                // A variable a hand-added mapping already writes is taken too: two rows on one
                // variable is last-write-wins at runtime.
                const taken = new Set(
                    [...outputFields.map((field) => field.key), ...mappings.map((mapping) => mapping.key)].filter(
                        Boolean
                    )
                )
                return (workflow.variables ?? []).map(({ key }) => key).filter((key) => !taken.has(key))
            },
        ],
    }),
    listeners(({ actions, values, props, cache }) => {
        // The editor's node only catches up with the workflow after a layout pass, so anything that
        // writes reads the action back out of the workflow first. Writing from the node instead
        // reverts whatever else was written in the same tick.
        const currentAction = (): HogFlowAction | undefined => {
            const actionId = values.selectedNode?.data.id
            return actionId ? workflowLogic(props).values.workflow.actions.find((a) => a.id === actionId) : undefined
        }

        const withInputs = (
            action: HogFlowAction,
            patch: Record<string, CyclotronInputType>
        ): HogFlowAction['config'] => {
            const inputs = 'inputs' in action.config ? action.config.inputs : {}
            return { ...action.config, inputs: { ...inputs, ...patch } } as HogFlowAction['config']
        }

        const patchInputs = (patch: Record<string, CyclotronInputType>): void => {
            const action = currentAction()
            if (!action || !('inputs' in action.config)) {
                return
            }
            workflowLogic(props).actions.setWorkflowActionConfig(action.id, withInputs(action, patch))
        }

        return {
            setSelectedActionId: () => {
                const config = values.selectedNode?.data.config
                actions.initOutputFields(readOutputFields(config && 'inputs' in config ? config.inputs : undefined))
            },
            setOutputFields: ({ fields }) => {
                const action = currentAction()
                if (!action || !('inputs' in action.config)) {
                    return
                }
                const mappingLogic = hogFlowOutputMappingLogic(props)
                const mappings = deriveOutputMappings(fields, mappingLogic.values.mappings)
                // The instructions and the mappings they generate are one edit, so they go in one
                // write. `initMappings` only refreshes the accordion; letting it persist would write
                // the action a second time and drop the instructions.
                mappingLogic.actions.initMappings(mappings)
                workflowLogic(props).actions.setWorkflowAction(action.id, {
                    ...action,
                    config: withInputs(action, {
                        output_fields: {
                            value: Object.fromEntries(
                                fields.filter((field) => field.key).map((field) => [field.key, field.instruction])
                            ),
                        },
                    }),
                    output_variable: toOutputVariable(mappings),
                } as HogFlowAction)
            },
            setModel: ({ model }) => {
                patchInputs({ model: { value: model } })
            },
            startPreview: () => {
                const startedAt = Date.now()
                cache.disposables.add(() => {
                    const timer = window.setInterval(
                        () => actions.setPreviewElapsedSeconds(Math.round((Date.now() - startedAt) / 1000)),
                        1000
                    )
                    return () => clearInterval(timer)
                }, 'previewElapsed')
            },
            endPreview: () => {
                cache.disposables.dispose('previewElapsed')
            },
            runPreview: async () => {
                const { selectedNode, workflow, hogFunctionTemplatesById } = values
                // Every preview is a real, billed generation, so a second click while one is in
                // flight must not buy a second one.
                if (!selectedNode || values.previewLoading) {
                    return
                }
                const previewedActionId = selectedNode.data.id
                actions.startPreview(previewedActionId)

                try {
                    // Unlike the generic step test, the output variables stay on the action: seeing
                    // where the generation lands is half of what the preview is for.
                    const { configuration, globals } = buildTestInvocation(
                        workflow,
                        hogFunctionTemplatesById,
                        values.sampleGlobals,
                        values.accumulatedVariables
                    )

                    const result: HogflowTestResult = await api.hogFlows.createTestInvocation(workflow.id, {
                        configuration,
                        globals,
                        mock_async_functions: false,
                        current_action_id: previewedActionId,
                    })

                    // A generation reads as prose the step produced, so it is dropped rather than
                    // shown under whichever step the author moved to while it ran.
                    if (values.selectedNode?.data.id !== previewedActionId) {
                        return
                    }

                    if (result.status === 'error') {
                        actions.setPreviewError(result.errors?.join(', ') || 'The preview could not run.')
                    } else if (result.execResult == null) {
                        actions.setPreviewNotice(previewNoticeFor(result.logs))
                    } else {
                        const envelope = result.execResult as { text?: string; fields?: Record<string, string> }
                        actions.setPreviewResult({
                            text: envelope.text ?? '',
                            fields: envelope.fields ?? {},
                            variables: result.variables ?? {},
                        })
                    }
                } catch (e: any) {
                    if (values.selectedNode?.data.id === previewedActionId) {
                        actions.setPreviewError(e?.detail || e?.message || 'The preview could not run.')
                    }
                } finally {
                    actions.endPreview()
                }
            },
        }
    }),
])
