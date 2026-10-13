// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// The side panel for one selected step. It opens with the same card the hover shows, then says what
// you can do with the step as labeled buttons, then the settings. Nothing else lives in this panel.
import { useActions, useValues } from 'kea'

import { IconCopy, IconDrag, IconPlay, IconPlusSmall, IconTrash, IconX } from '@posthog/icons'
import { LemonButton, LemonInput, LemonTextArea } from '@posthog/lemon-ui'

import { ErrorBoundary } from '~/layout/ErrorBoundary'

import { workflowLogic } from '../../../workflowLogic'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import { useHogFlowStep } from '../../steps/HogFlowSteps'
import type { HogFlow, HogFlowAction } from '../../types'
import { SampleMetrics } from './graphFirstModel'
import { useTileKind } from './tileKinds'
import { StepCardBody, StepCardHead } from './TileNode'

type AnyConfig = Record<string, any>

const PANEL_CARD_WIDTH = 420
const OWN_FORM_TYPES = new Set(['function', 'function_email'])
const HIDDEN_INPUTS = new Set(['slack_workspace'])

const humanize = (key: string): string => {
    const text = key.replace(/_/g, ' ')
    return text.charAt(0).toUpperCase() + text.slice(1)
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
    return (
        <section className="flex flex-col gap-2 border-t px-4 py-3">
            <h3 className="m-0 text-xs font-semibold uppercase tracking-wider text-secondary">{title}</h3>
            {children}
        </section>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold">{label}</span>
            {children}
        </label>
    )
}

/** Stand-in settings for steps whose real form needs templates that Storybook does not load. */
function InputsForm({ action }: { action: HogFlowAction }): JSX.Element {
    const { partialSetWorkflowActionConfig } = useActions(workflowLogic)
    const config = action.config as AnyConfig
    const inputs = (config.inputs ?? {}) as AnyConfig
    const setInput = (key: string, value: unknown): void =>
        partialSetWorkflowActionConfig(action.id, { inputs: { ...inputs, [key]: { ...inputs[key], value } } } as any)

    if (action.type === 'function_email') {
        const email = inputs.email?.value ?? {}
        const setEmail = (patch: AnyConfig): void => setInput('email', { ...email, ...patch })
        return (
            <>
                <Field label="Subject">
                    <LemonInput value={email.subject ?? ''} onChange={(subject) => setEmail({ subject })} />
                </Field>
                <Field label="Preview text">
                    <LemonInput value={email.preheader ?? ''} onChange={(preheader) => setEmail({ preheader })} />
                </Field>
                <LemonButton type="secondary" size="small" className="self-start">
                    Edit the email design
                </LemonButton>
            </>
        )
    }

    return (
        <>
            {Object.entries(inputs)
                .filter(([key]) => !HIDDEN_INPUTS.has(key))
                .map(([key, input]) => {
                    const value = input?.value
                    if (Array.isArray(value)) {
                        return (
                            <Field key={key} label={humanize(key)}>
                                <LemonInput
                                    value={value.join(', ')}
                                    onChange={(text) =>
                                        setInput(
                                            key,
                                            text.split(',').map((part) => part.trim())
                                        )
                                    }
                                />
                            </Field>
                        )
                    }
                    if (value && typeof value === 'object') {
                        return (
                            <Field key={key} label={humanize(key)}>
                                <LemonTextArea
                                    className="font-mono text-xs"
                                    value={JSON.stringify(value, null, 2)}
                                    onChange={(text) => {
                                        try {
                                            setInput(key, JSON.parse(text))
                                        } catch {
                                            // Keep the last valid value while the person types.
                                        }
                                    }}
                                />
                            </Field>
                        )
                    }
                    if (typeof value === 'boolean') {
                        return (
                            <Field key={key} label={humanize(key)}>
                                <span className="text-[13px]">{value ? 'Yes' : 'No'}</span>
                            </Field>
                        )
                    }
                    const text = String(value ?? '')
                    return (
                        <Field key={key} label={humanize(key)}>
                            {text.length > 50 || text.includes('\n') ? (
                                <LemonTextArea value={text} onChange={(next) => setInput(key, next)} />
                            ) : (
                                <LemonInput value={text} onChange={(next) => setInput(key, next)} />
                            )}
                        </Field>
                    )
                })}
        </>
    )
}

function Settings({ action }: { action: HogFlowAction }): JSX.Element | null {
    const { selectedNode } = useValues(hogFlowEditorLogic)
    const Step = useHogFlowStep(action)
    if (OWN_FORM_TYPES.has(action.type)) {
        return <InputsForm action={action} />
    }
    if (!selectedNode || selectedNode.id !== action.id) {
        return null
    }
    return (
        <ErrorBoundary exceptionProps={{ feature: 'workflow-step-config' }}>
            <div className="flex flex-col gap-2">{Step?.renderConfiguration(selectedNode)}</div>
        </ErrorBoundary>
    )
}

export function StepPanel({
    action,
    workflow,
    metrics,
    onClose,
    onTest,
}: {
    action: HogFlowAction
    workflow: HogFlow
    metrics: SampleMetrics | null
    onClose: () => void
    onTest: () => void
}): JSX.Element {
    const kind = useTileKind(action, workflow)
    const { nodesById, selectedNodeCanBeDeleted, selectedNodeCanBeCopiedOrMoved } = useValues(hogFlowEditorLogic)
    const { startCopyingNode, startMovingNode, onNodesDelete, duplicateNodeBelow, setSelectedNodeId } =
        useActions(hogFlowEditorLogic)
    const { setWorkflowAction } = useActions(hogFlowEditorLogic)
    const node = nodesById[action.id]
    const editable = !!node?.deletable
    const state = { metrics, selected: true }

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            <div className="px-4 pb-3 pt-3" style={{ borderTop: `3px solid ${kind.color}` }}>
                <StepCardHead
                    action={action}
                    kind={kind}
                    state={{ metrics }}
                    width={PANEL_CARD_WIDTH}
                    trailing={<LemonButton size="small" icon={<IconX />} tooltip="Close (Esc)" onClick={onClose} />}
                />
                <div className="mt-3">
                    <StepCardBody action={action} workflow={workflow} kind={kind} state={state} />
                </div>
            </div>

            <Section title="What you can do">
                <div className="flex flex-wrap gap-1.5">
                    <LemonButton size="small" type="secondary" icon={<IconPlay />} onClick={onTest}>
                        Test from the start
                    </LemonButton>
                    {editable && (
                        <>
                            <LemonButton
                                size="small"
                                type="secondary"
                                icon={<IconPlusSmall />}
                                onClick={() => duplicateNodeBelow(action.id)}
                            >
                                Duplicate
                            </LemonButton>
                            <LemonButton
                                size="small"
                                type="secondary"
                                icon={<IconDrag />}
                                disabledReason={selectedNodeCanBeCopiedOrMoved ? undefined : 'This step cannot move'}
                                onClick={() => startMovingNode(node)}
                            >
                                Move
                            </LemonButton>
                            <LemonButton
                                size="small"
                                type="secondary"
                                icon={<IconCopy />}
                                disabledReason={
                                    selectedNodeCanBeCopiedOrMoved ? undefined : 'This step cannot be copied'
                                }
                                onClick={() => startCopyingNode(node)}
                            >
                                Copy
                            </LemonButton>
                            <LemonButton
                                size="small"
                                type="secondary"
                                status="danger"
                                icon={<IconTrash />}
                                disabledReason={
                                    selectedNodeCanBeDeleted ? undefined : 'Remove the paths under it first'
                                }
                                onClick={() => {
                                    onNodesDelete([node])
                                    setSelectedNodeId(null)
                                    onClose()
                                }}
                            >
                                Delete
                            </LemonButton>
                        </>
                    )}
                </div>
            </Section>

            <Section title="Settings">
                <Settings action={action} />
            </Section>

            <Section title="Name and note">
                <div className="text-xs text-secondary">The canvas shows the step's settings, not its name.</div>
                <Field label="Name">
                    <LemonInput
                        value={action.name}
                        onChange={(name) => setWorkflowAction(action.id, { ...action, name })}
                    />
                </Field>
                <Field label="Note for your team">
                    <LemonTextArea
                        value={action.description}
                        placeholder="Why this step is here"
                        onChange={(description) => setWorkflowAction(action.id, { ...action, description })}
                    />
                </Field>
            </Section>
        </div>
    )
}
