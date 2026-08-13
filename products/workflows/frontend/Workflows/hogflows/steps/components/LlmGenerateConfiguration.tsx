import { useActions, useValues } from 'kea'

import { IconExternal, IconPlus, IconX } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonInput, LemonSelect } from '@posthog/lemon-ui'

import { LemonField } from 'lib/lemon-ui/LemonField/LemonField'

import { workflowLogic } from '../../../workflowLogic'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import { CyclotronJobInputSchemaType } from '../types'
import { LLM_MODEL_OPTIONS, LlmOutputField, llmGenerateLogic } from './llmGenerateLogic'

/**
 * The bespoke body of the "Generate text" step: the declared output fields and the model. The prompt
 * is rendered by the generic input renderer above this, so it keeps its templating and autocomplete.
 */
export function LlmGenerateConfiguration({
    inputsSchema,
}: {
    inputsSchema: CyclotronJobInputSchemaType[]
}): JSX.Element {
    const { logicProps } = useValues(workflowLogic)
    const { outputFields, availableVariableKeys, model } = useValues(llmGenerateLogic(logicProps))
    const { setOutputFields, setModel } = useActions(llmGenerateLogic(logicProps))
    const { setMode } = useActions(hogFlowEditorLogic)

    const fieldsSchema = inputsSchema.find((schema) => schema.key === 'output_fields')
    const modelSchema = inputsSchema.find((schema) => schema.key === 'model')

    const updateField = (index: number, patch: Partial<LlmOutputField>): void => {
        const updated = [...outputFields]
        updated[index] = { ...updated[index], ...patch }
        setOutputFields(updated)
    }

    return (
        <>
            <LemonField.Pure label={fieldsSchema?.label ?? 'Output fields'} info={fieldsSchema?.description}>
                <div className="flex flex-col gap-2">
                    {outputFields.map((field, index) => (
                        <div key={index} className="flex flex-col gap-1 w-full rounded border border-border p-2">
                            <div className="flex items-center gap-1">
                                <LemonSelect
                                    className="flex-1"
                                    size="small"
                                    placeholder="Select variable..."
                                    options={[
                                        ...(field.key ? [{ value: field.key, label: field.key }] : []),
                                        ...availableVariableKeys.map((key) => ({ value: key, label: key })),
                                    ]}
                                    value={field.key || null}
                                    onChange={(value) => updateField(index, { key: value ?? '' })}
                                />
                                <LemonButton
                                    icon={<IconX />}
                                    size="small"
                                    tooltip="Remove output field"
                                    onClick={() => setOutputFields(outputFields.filter((_, i) => i !== index))}
                                />
                            </div>
                            <LemonInput
                                size="small"
                                placeholder="What the model should put in this variable"
                                disabledReason={!field.key ? 'Select a variable first.' : undefined}
                                value={field.instruction}
                                onChange={(value) => updateField(index, { instruction: value })}
                            />
                        </div>
                    ))}
                    <div className="flex gap-2">
                        <LemonButton
                            icon={<IconPlus />}
                            size="small"
                            type="secondary"
                            onClick={() => setOutputFields([...outputFields, { key: '', instruction: '' }])}
                        >
                            Add field
                        </LemonButton>
                        <LemonButton
                            icon={<IconPlus />}
                            sideIcon={<IconExternal />}
                            size="small"
                            type="secondary"
                            onClick={() => setMode('variables')}
                        >
                            New variable
                        </LemonButton>
                    </div>
                </div>
            </LemonField.Pure>

            <LemonField.Pure label={modelSchema?.label ?? 'Model'}>
                <div className="flex flex-col gap-1">
                    <LemonSelect
                        options={LLM_MODEL_OPTIONS}
                        value={model}
                        onChange={(value) => setModel(value)}
                        size="small"
                    />
                    {modelSchema?.description && (
                        <span className="text-xs text-secondary">{modelSchema.description}</span>
                    )}
                </div>
            </LemonField.Pure>
        </>
    )
}

/** What the last preview produced: the generation, what was extracted from it, and where it landed. */
export function LlmPreviewSections(): JSX.Element | null {
    const { logicProps } = useValues(workflowLogic)
    const { previewResult, previewError, previewNotice } = useValues(llmGenerateLogic(logicProps))

    if (previewError) {
        return (
            <LemonBanner type="error" className="w-full">
                {previewError}
            </LemonBanner>
        )
    }
    if (previewNotice) {
        return (
            <LemonBanner type="info" className="w-full">
                {previewNotice}
            </LemonBanner>
        )
    }
    if (!previewResult) {
        return null
    }

    return (
        <div className="flex flex-col gap-2 w-full">
            <PreviewSection title="Generated text">
                <div className="whitespace-pre-wrap">{previewResult.text || 'The model returned nothing.'}</div>
            </PreviewSection>
            <PreviewSection title="Extracted fields">
                <PreviewEntries entries={previewResult.fields} emptyMessage="This step declares no output fields." />
            </PreviewSection>
            <PreviewSection title="Variable values">
                <PreviewEntries entries={previewResult.variables} emptyMessage="No variables were set." />
            </PreviewSection>
        </div>
    )
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
    return (
        <div>
            <p className="text-xs text-secondary mb-1">{title}</p>
            <div className="max-h-48 overflow-auto border rounded p-2 text-xs">{children}</div>
        </div>
    )
}

function PreviewEntries({
    entries,
    emptyMessage,
}: {
    entries: Record<string, any>
    emptyMessage: string
}): JSX.Element {
    const rows = Object.entries(entries ?? {})
    if (rows.length === 0) {
        return <span className="text-secondary">{emptyMessage}</span>
    }
    return (
        <div className="flex flex-col gap-1">
            {rows.map(([key, value]) => (
                <div key={key} className="flex gap-2">
                    <code className="shrink-0">{key}</code>
                    <span className="whitespace-pre-wrap break-words">
                        {typeof value === 'string' ? value : JSON.stringify(value)}
                    </span>
                </div>
            ))}
        </div>
    )
}
