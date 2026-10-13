// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// The side panel for one selected step. It opens with the same card the hover shows, then says what
// you can do with the step as labeled buttons, then the settings. Nothing else lives in this panel.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import {
    IconChevronDown,
    IconCopy,
    IconDrag,
    IconLetter,
    IconPlay,
    IconPlus,
    IconPlusSmall,
    IconTrash,
    IconX,
} from '@posthog/icons'
import { LemonButton, LemonInput, LemonSelect, LemonSwitch, LemonTag, LemonTextArea } from '@posthog/lemon-ui'

import { ErrorBoundary } from '~/layout/ErrorBoundary'

import { CategorySelect } from 'products/workflows/frontend/OptOuts/CategorySelect'

import { workflowLogic } from '../../../workflowLogic'
import { HogFlowPropertyFilters } from '../../filters/HogFlowFilters'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import { UtmTagFields } from '../../steps/components/UtmTagFields'
import { useHogFlowStep } from '../../steps/HogFlowSteps'
import type { HogFlow, HogFlowAction } from '../../types'
import { stepLogRows } from './CanvasDrawer'
import { SampleMetrics } from './graphFirstModel'
import { useTileKind } from './tileKinds'
import { MetricsLine, StepCardBody, StepCardHead } from './TileNode'

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

/** A closed row that still says its current value, so the panel shows everything without being long. */
function Disclosure({
    title,
    summary,
    children,
}: {
    title: string
    summary: React.ReactNode
    children: React.ReactNode
}): JSX.Element {
    const [open, setOpen] = useState(false)
    return (
        <div className="rounded-md border">
            <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left"
                onClick={() => setOpen(!open)}
            >
                <IconChevronDown className={open ? '' : '-rotate-90'} />
                <span className="flex-1 text-[13px] font-semibold">{title}</span>
                <span className="text-xs text-secondary">{summary}</span>
            </button>
            {open && <div className="flex flex-col gap-2 border-t px-2.5 py-2.5">{children}</div>}
        </div>
    )
}

const BRANCHING = new Set(['conditional_branch', 'wait_until_condition', 'random_cohort_branch'])

function EmailDelivery({ action, workflow }: { action: HogFlowAction; workflow: HogFlow }): JSX.Element {
    const { setWorkflowAction } = useActions(hogFlowEditorLogic)
    const config = action.config as AnyConfig
    const update = (patch: AnyConfig): void =>
        setWorkflowAction(action.id, { ...action, config: { ...config, ...patch } } as HogFlowAction)
    return (
        <Disclosure
            title="Delivery"
            summary={[
                config.message_category_type === 'transactional' ? 'Transactional' : 'Marketing',
                config.tracking_enabled === false ? 'not tracked' : 'tracked',
                config.utm_tags_enabled ? 'UTM tags' : null,
            ]
                .filter(Boolean)
                .join(', ')}
        >
            <Field label="Message category">
                <CategorySelect
                    value={config.message_category_id}
                    onChange={(message_category_id) => update({ message_category_id })}
                />
            </Field>
            <LemonSwitch
                label="Track opens and link clicks"
                checked={config.tracking_enabled !== false}
                onChange={(tracking_enabled) => update({ tracking_enabled })}
                bordered
                fullWidth
            />
            <LemonSwitch
                label="Add UTM tags to links"
                checked={config.utm_tags_enabled === true}
                onChange={(utm_tags_enabled) => update({ utm_tags_enabled })}
                bordered
                fullWidth
            />
            {config.utm_tags_enabled && (
                <UtmTagFields
                    value={config.utm_params ?? {}}
                    onChange={(utm_params) => update({ utm_params })}
                    campaignDefault={workflow.name}
                    contentDefault={action.name}
                />
            )}
        </Disclosure>
    )
}

function OutputVariables({ action }: { action: HogFlowAction }): JSX.Element {
    const inputs = ((action.config as AnyConfig).inputs ?? {}) as AnyConfig
    const outputs: string[] = [...(inputs.outputs?.value ?? []), ...(inputs.output?.value ? [inputs.output.value] : [])]
    return (
        <Disclosure title="Save results as variables" summary={outputs.length ? `${outputs.length} saved` : 'None'}>
            <div className="text-xs text-secondary">Later steps and splits can use these.</div>
            {outputs.map((output) => (
                <div key={output} className="flex items-center gap-2 text-[13px]">
                    <code className="rounded bg-surface-secondary px-1">result.{output}</code>
                    <span className="text-secondary">→</span>
                    <code className="rounded bg-surface-secondary px-1">{output}</code>
                </div>
            ))}
            <LemonButton size="xsmall" type="secondary" icon={<IconPlus />} className="self-start">
                Add variable
            </LemonButton>
        </Disclosure>
    )
}

function RunConditions({ action }: { action: HogFlowAction }): JSX.Element {
    const { setWorkflowAction } = useActions(hogFlowEditorLogic)
    const filters = (action.filters ?? {}) as AnyConfig
    const count = (filters.events?.length ?? 0) + (filters.properties?.length ?? 0) + (filters.actions?.length ?? 0)
    return (
        <Disclosure title="Only run this step if" summary={count ? `${count} conditions` : 'Always runs'}>
            <div className="text-xs text-secondary">People who don't match skip this step and go to the next one.</div>
            <HogFlowPropertyFilters
                filtersKey={`graph-first-skip-${action.id}`}
                filters={filters}
                setFilters={(next) => setWorkflowAction(action.id, { ...action, filters: next } as HogFlowAction)}
                buttonCopy="Add condition"
            />
        </Disclosure>
    )
}

function OnError({ action }: { action: HogFlowAction }): JSX.Element {
    const { setWorkflowAction } = useActions(hogFlowEditorLogic)
    const value = (action as AnyConfig).on_error || 'continue'
    return (
        <Disclosure
            title="If this step fails"
            summary={
                <LemonTag size="small" type={value === 'continue' ? 'success' : 'danger'}>
                    {value === 'continue' ? 'Continue' : 'Exit the workflow'}
                </LemonTag>
            }
        >
            <LemonSelect
                options={[
                    { value: 'continue', label: 'Continue to the next step' },
                    { value: 'abort', label: 'Exit the workflow' },
                ]}
                value={value}
                onChange={(on_error) => setWorkflowAction(action.id, { ...action, on_error } as HogFlowAction)}
            />
        </Disclosure>
    )
}

function Activity({
    action,
    workflow,
    metrics,
}: {
    action: HogFlowAction
    workflow: HogFlow
    metrics: SampleMetrics | null
}): JSX.Element {
    const rows = stepLogRows(workflow, action.id).slice(0, 4)
    return (
        <>
            {metrics ? (
                <MetricsLine action={action} state={{ metrics }} />
            ) : (
                <div className="text-xs text-secondary">Turn on sample metrics in View to see numbers here.</div>
            )}
            <div className="flex flex-col font-mono text-[12px]">
                {rows.map((row, index) => (
                    <div key={index} className="flex gap-2 border-b py-1 last:border-b-0">
                        <span className="text-secondary">{row.time}</span>
                        <span className="w-24 shrink-0 truncate font-sans">{row.person}</span>
                        <span className="min-w-0 flex-1 truncate font-sans">{row.message}</span>
                    </div>
                ))}
            </div>
        </>
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
                    {action.type === 'function_email' && (
                        <LemonButton size="small" type="secondary" icon={<IconLetter />}>
                            Send me a test email
                        </LemonButton>
                    )}
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

            {!['trigger', 'exit'].includes(action.type) && (
                <Section title="Options">
                    {action.type === 'function_email' && <EmailDelivery action={action} workflow={workflow} />}
                    {action.type === 'function' && <OutputVariables action={action} />}
                    {!BRANCHING.has(action.type) && <RunConditions action={action} />}
                    <OnError action={action} />
                </Section>
            )}

            <Section title="Activity">
                <Activity action={action} workflow={workflow} metrics={metrics} />
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
