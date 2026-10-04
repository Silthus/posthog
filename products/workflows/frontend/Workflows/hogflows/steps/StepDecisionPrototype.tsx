// PROTOTYPE (#245): throwaway config panel for the three decision step shapes. Never ships.
import { Node } from '@xyflow/react'
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconCode, IconInfo, IconPlus, IconSparkles, IconX } from '@posthog/icons'

import { LemonBanner } from 'lib/lemon-ui/LemonBanner'
import { LemonButton } from 'lib/lemon-ui/LemonButton'
import { LemonDivider } from 'lib/lemon-ui/LemonDivider'
import { LemonInput } from 'lib/lemon-ui/LemonInput'
import { LemonLabel } from 'lib/lemon-ui/LemonLabel'
import { LemonSegmentedButton } from 'lib/lemon-ui/LemonSegmentedButton'
import { LemonSelect } from 'lib/lemon-ui/LemonSelect'
import { LemonSlider } from 'lib/lemon-ui/LemonSlider'
import { LemonSwitch } from 'lib/lemon-ui/LemonSwitch'
import { LemonTag } from 'lib/lemon-ui/LemonTag'
import { LemonTextArea } from 'lib/lemon-ui/LemonTextArea'

import { getHogFlowBranchColor } from '../HogFlowBranchSelection'
import { hogFlowEditorLogic } from '../hogFlowEditorLogic'
import { HogFlow, HogFlowAction } from '../types'
import { DecisionConfig, getDecisionAnswerNames, getDecisionBranchNames } from './decisionPrototypeBranches'
import { HogFlowBranchCard } from './HogFlowBranchCard'

type DecisionAction = Extract<HogFlowAction, { type: 'decision' }>

const MAX_OPTIONS = 16
const CONTEXT_LIMIT_BYTES = 8 * 1024

export const PROTOTYPE_EMAIL_TEMPLATES = [
    { value: 'welcome-self-serve', label: 'Welcome: build it yourself' },
    { value: 'welcome-sales', label: 'Welcome: meet your account team' },
    { value: 'welcome-api', label: 'Welcome: API quickstart' },
    { value: 'welcome-general', label: 'Welcome: general' },
]

type TestPerson = {
    id: string
    name: string
    properties: Record<string, string>
    event: Record<string, string>
    pickOne: Record<string, number>
    yes: number
}

const TEST_PEOPLE: TestPerson[] = [
    {
        id: 'priya',
        name: 'Priya Raman',
        properties: {
            email: 'priya@example.com',
            job_title: 'Staff engineer',
            company_size: '40',
            signup_answer: 'Sending events from our Go backend and querying them with SQL.',
        },
        event: { event: 'user signed up', plan: 'free' },
        pickOne: { 'self-serve': 0.15, 'sales-assisted': 0.07, developer: 0.78 },
        yes: 0.22,
    },
    {
        id: 'marcus',
        name: 'Marcus Feld',
        properties: {
            email: 'marcus@example.org',
            job_title: 'VP of marketing',
            company_size: '1200',
            signup_answer: 'Replacing our analytics tool across four teams. We need SSO and a contract.',
        },
        event: { event: 'user signed up', plan: 'free' },
        pickOne: { 'self-serve': 0.22, 'sales-assisted': 0.71, developer: 0.07 },
        yes: 0.88,
    },
    {
        id: 'lena',
        name: 'Lena Ortiz',
        properties: {
            email: 'lena@example.net',
            job_title: 'Founder',
            company_size: '3',
            signup_answer: 'Just looking around',
        },
        event: { event: 'user signed up', plan: 'free' },
        pickOne: { 'self-serve': 0.46, 'sales-assisted': 0.23, developer: 0.31 },
        yes: 0.41,
    },
]

function fakeProbabilities(person: TestPerson, config: DecisionConfig): number[] {
    if (config.answer_type === 'yes_no') {
        return [person.yes, 1 - person.yes]
    }
    const raw = config.options.map((option, index) => {
        const known = person.pickOne[option.name.trim().toLowerCase()]
        return known ?? ((person.id.length * 7 + index * 13) % 10) / 10 + 0.05
    })
    const total = raw.reduce((sum, value) => sum + value, 0) || 1
    return raw.map((value) => value / total)
}

function renderTemplate(value: string, person: TestPerson): string {
    return value.replace(/\{(person\.properties|event)\.([a-z_]+)\}/g, (_, source: string, key: string) =>
        source === 'event' ? (person.event[key] ?? '') : (person.properties[key] ?? '')
    )
}

function buildRequestPreview(config: DecisionConfig, person: TestPerson): string {
    const data = Object.fromEntries(config.context.map((field) => [field.key, renderTemplate(field.value, person)]))
    const options =
        config.answer_type === 'yes_no'
            ? undefined
            : Object.fromEntries(config.options.map((option) => [option.name, option.description ?? '']))
    return JSON.stringify({ question: config.question, data, ...(options ? { options } : {}) }, null, 2)
}

type TestOutcome = { answerIndex: number | null; probabilities: number[]; unsure: boolean }

function pickOutcome(config: DecisionConfig, probabilities: number[]): TestOutcome {
    if (config.answer_type === 'yes_no') {
        const yes = probabilities[0] * 100 >= (config.yes_threshold ?? 50)
        return { answerIndex: yes ? 0 : 1, probabilities, unsure: false }
    }
    const top = probabilities.reduce((best, value, index) => (value > probabilities[best] ? index : best), 0)
    const unsure = !!config.unsure_enabled && probabilities[top] * 100 < (config.unsure_threshold ?? 60)
    return { answerIndex: unsure ? null : top, probabilities, unsure }
}

export function StepDecisionPrototypeConfiguration({ node }: { node: Node<DecisionAction> }): JSX.Element {
    const action = node.data
    const config = action.config
    const { edgesByActionId } = useValues(hogFlowEditorLogic)
    const { setWorkflowAction, setWorkflowActionEdges } = useActions(hogFlowEditorLogic)

    const syncBranchEdges = (nextConfig: DecisionConfig): void => {
        if (nextConfig.shape !== 'branch') {
            return
        }
        const nodeEdges = edgesByActionId[action.id] ?? []
        const continueEdge = nodeEdges.find((edge) => edge.type === 'continue' && edge.from === action.id)
        const branchEdges = nodeEdges
            .filter((edge) => edge.type === 'branch' && edge.from === action.id)
            .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        const otherEdges = nodeEdges.filter((edge) => !(edge.type === 'branch' && edge.from === action.id))
        const wanted = getDecisionBranchNames(nextConfig).length
        const nextBranchEdges: HogFlow['edges'] = Array.from({ length: wanted }, (_, index) => ({
            from: action.id,
            to: branchEdges[index]?.to ?? continueEdge?.to ?? '',
            type: 'branch' as const,
            index,
        }))
        setWorkflowActionEdges(action.id, [...nextBranchEdges, ...otherEdges])
    }

    const updateConfig = (patch: Partial<DecisionConfig>): void => {
        const nextConfig = { ...config, ...patch }
        setWorkflowAction(action.id, { ...action, config: nextConfig })
        const branchCountChanged =
            getDecisionBranchNames(nextConfig).length !== getDecisionBranchNames(config).length
        if (branchCountChanged) {
            syncBranchEdges(nextConfig)
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <ShapeBanner shape={config.shape} />
            <QuestionField config={config} onChange={updateConfig} />
            {config.shape !== 'content' && <AnswerTypeField config={config} onChange={updateConfig} />}
            <OptionsField actionId={action.id} config={config} onChange={updateConfig} />
            <ConfidenceField config={config} onChange={updateConfig} />
            {config.shape === 'variable' && <AnswerVariableField config={config} onChange={updateConfig} />}
            <ContextField config={config} onChange={updateConfig} />
            <FallbackField config={config} onChange={updateConfig} />
            <LemonDivider />
            <TestWithPerson config={config} />
            <CostHint />
        </div>
    )
}

function ShapeBanner({ shape }: { shape: DecisionConfig['shape'] }): JSX.Element {
    const text = {
        branch: 'Each answer is its own path out of this step. Add the steps for each answer on the canvas.',
        variable:
            'This step saves the answer to a workflow variable and has one path out. Add a conditional branch after it to route on the answer.',
        content:
            'Each option sends a different email template. Everyone continues on the same path after the email is sent.',
    }[shape]
    return <LemonBanner type="info">{text}</LemonBanner>
}

function Section({
    title,
    help,
    children,
    addon,
}: {
    title: string
    help?: string
    children: React.ReactNode
    addon?: React.ReactNode
}): JSX.Element {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <LemonLabel>{title}</LemonLabel>
                {addon}
            </div>
            {help && <p className="text-secondary text-xs m-0">{help}</p>}
            {children}
        </div>
    )
}

type FieldProps = { config: DecisionConfig; onChange: (patch: Partial<DecisionConfig>) => void }

function QuestionField({ config, onChange }: FieldProps): JSX.Element {
    return (
        <Section
            title="Question"
            help="The model reads this as written. It can't contain person or event data, so every person gets the same question. Add the data under What the model sees."
        >
            <LemonTextArea
                value={config.question}
                onChange={(question) => onChange({ question })}
                placeholder="Which onboarding track fits this person best?"
                minRows={2}
            />
        </Section>
    )
}

function AnswerTypeField({ config, onChange }: FieldProps): JSX.Element {
    return (
        <Section title="Answer">
            <LemonSegmentedButton
                fullWidth
                size="small"
                value={config.answer_type}
                onChange={(answer_type) => onChange({ answer_type })}
                options={[
                    { value: 'yes_no', label: 'Yes or no' },
                    { value: 'pick_one', label: 'Pick one option' },
                ]}
            />
        </Section>
    )
}

function OptionsField({ actionId, config, onChange }: FieldProps & { actionId: string }): JSX.Element | null {
    if (config.answer_type === 'yes_no') {
        return null
    }
    const options = config.options
    const setOption = (index: number, patch: Partial<DecisionConfig['options'][number]>): void =>
        onChange({ options: options.map((option, i) => (i === index ? { ...option, ...patch } : option)) })
    const removeOption = (index: number): void => onChange({ options: options.filter((_, i) => i !== index) })
    const addOption = (): void => onChange({ options: [...options, { name: '', description: '' }] })
    const removeDisabledReason = options.length <= 2 ? 'A question needs at least 2 options' : undefined

    const help = {
        branch: 'Each option becomes a path out of this step. The model reads the descriptions, so say what sets each option apart.',
        variable: 'The model reads the descriptions, so say what sets each option apart. The option name is saved as the answer.',
        content: 'Pick the email template each option sends. The model reads the descriptions, not the emails.',
    }[config.shape]

    return (
        <Section
            title="Options"
            help={help}
            addon={<span className="text-secondary text-xs">{`${options.length} of ${MAX_OPTIONS}`}</span>}
        >
            {options.map((option, index) =>
                config.shape === 'branch' ? (
                    <HogFlowBranchCard
                        key={index}
                        actionId={actionId}
                        index={index}
                        name={option.name}
                        onNameChange={(name) => setOption(index, { name })}
                        placeholder={`Option ${index + 1}`}
                        ariaLabel={`Option ${index + 1} name`}
                        onRemove={() => removeOption(index)}
                        removeDisabledReason={removeDisabledReason}
                    >
                        <LemonTextArea
                            value={option.description ?? ''}
                            onChange={(description) => setOption(index, { description })}
                            placeholder="Describe who belongs here"
                            minRows={1}
                        />
                    </HogFlowBranchCard>
                ) : (
                    <div key={index} className="flex flex-col gap-2 rounded border p-3 bg-surface-primary">
                        <div className="flex items-center gap-2">
                            <LemonInput
                                className="flex-1"
                                size="small"
                                value={option.name}
                                onChange={(name) => setOption(index, { name })}
                                placeholder={`Option ${index + 1}`}
                            />
                            <LemonButton
                                size="xsmall"
                                icon={<IconX />}
                                onClick={() => removeOption(index)}
                                disabledReason={removeDisabledReason}
                            />
                        </div>
                        <LemonTextArea
                            value={option.description ?? ''}
                            onChange={(description) => setOption(index, { description })}
                            placeholder="Describe who belongs here"
                            minRows={1}
                        />
                        {config.shape === 'content' && (
                            <LemonSelect
                                size="small"
                                fullWidth
                                placeholder="Choose an email template"
                                value={option.email_template}
                                onChange={(email_template) => setOption(index, { email_template: email_template ?? undefined })}
                                options={PROTOTYPE_EMAIL_TEMPLATES}
                            />
                        )}
                    </div>
                )
            )}
            <LemonButton
                type="secondary"
                icon={<IconPlus />}
                onClick={addOption}
                disabledReason={options.length >= MAX_OPTIONS ? `You can add up to ${MAX_OPTIONS} options` : undefined}
            >
                Add option
            </LemonButton>
        </Section>
    )
}

function ConfidenceField({ config, onChange }: FieldProps): JSX.Element {
    if (config.answer_type === 'yes_no') {
        const threshold = config.yes_threshold ?? 50
        return (
            <Section
                title="When to answer yes"
                help={`The model answers with a probability. A person goes down the Yes path when it is ${threshold}% or higher.`}
            >
                <div className="flex items-center gap-3">
                    <LemonSlider
                        className="flex-1"
                        min={1}
                        max={99}
                        value={threshold}
                        onChange={(yes_threshold) => onChange({ yes_threshold })}
                    />
                    <LemonTag type="highlight">{`${threshold}%`}</LemonTag>
                </div>
            </Section>
        )
    }

    if (config.shape === 'variable') {
        return (
            <Section
                title="Confidence"
                help="The step also saves how sure the model was, from 0 to 100. Use it in the conditional branch that follows, for example to treat answers under 60 as unclear."
            >
                <span />
            </Section>
        )
    }

    const threshold = config.unsure_threshold ?? 60
    const unsureLabel = config.shape === 'content' ? 'Send the fallback email when the model is unsure' : 'Add an Unsure path'
    return (
        <Section title="When the model is unsure">
            <LemonSwitch
                bordered
                fullWidth
                label={unsureLabel}
                checked={!!config.unsure_enabled}
                onChange={(unsure_enabled) => onChange({ unsure_enabled })}
            />
            {config.unsure_enabled && (
                <>
                    <p className="text-secondary text-xs m-0">
                        {config.shape === 'content'
                            ? `Used when no option reaches ${threshold}%.`
                            : `A person goes down the Unsure path when no option reaches ${threshold}%.`}
                    </p>
                    <div className="flex items-center gap-3">
                        <LemonSlider
                            className="flex-1"
                            min={1}
                            max={99}
                            value={threshold}
                            onChange={(unsure_threshold) => onChange({ unsure_threshold })}
                        />
                        <LemonTag type="highlight">{`${threshold}%`}</LemonTag>
                    </div>
                </>
            )}
        </Section>
    )
}

function AnswerVariableField({ config, onChange }: FieldProps): JSX.Element {
    const key = config.answer_variable || 'decision'
    return (
        <Section
            title="Save the answer to"
            help={`Saves the option name to ${key} and the confidence to ${key}_confidence.`}
        >
            <LemonInput
                size="small"
                value={config.answer_variable}
                onChange={(answer_variable) => onChange({ answer_variable })}
                prefix={<span className="text-secondary">variables.</span>}
            />
            <LemonBanner type="warning">
                The conditional branch after this step has to repeat each option name exactly. Renaming an option here
                does not update it.
            </LemonBanner>
        </Section>
    )
}

function ContextField({ config, onChange }: FieldProps): JSX.Element {
    const [showRequest, setShowRequest] = useState(false)
    const fields = config.context
    const setField = (index: number, patch: Partial<DecisionConfig['context'][number]>): void =>
        onChange({ context: fields.map((field, i) => (i === index ? { ...field, ...patch } : field)) })
    const preview = buildRequestPreview(config, TEST_PEOPLE[0])
    const bytes = new TextEncoder().encode(preview).length
    const sizeLabel = `About ${(bytes / 1024).toFixed(1)} KB of ${CONTEXT_LIMIT_BYTES / 1024} KB`

    return (
        <Section
            title="What the model sees"
            help="Only these fields are sent with the question. Use {person.properties.name} or {event.properties.name} to fill them in for each person."
            addon={<span className="text-secondary text-xs">{sizeLabel}</span>}
        >
            {fields.map((field, index) => (
                <div key={index} className="flex items-center gap-2">
                    <LemonInput
                        className="w-36"
                        size="small"
                        value={field.key}
                        onChange={(key) => setField(index, { key })}
                        placeholder="Name"
                    />
                    <LemonInput
                        className="flex-1 font-mono"
                        size="small"
                        value={field.value}
                        onChange={(value) => setField(index, { value })}
                        placeholder="{person.properties.job_title}"
                    />
                    <LemonButton
                        size="xsmall"
                        icon={<IconX />}
                        onClick={() => onChange({ context: fields.filter((_, i) => i !== index) })}
                    />
                </div>
            ))}
            <div className="flex gap-2">
                <LemonButton
                    type="secondary"
                    size="small"
                    icon={<IconPlus />}
                    onClick={() => onChange({ context: [...fields, { key: '', value: '' }] })}
                >
                    Add field
                </LemonButton>
                <LemonButton
                    type="tertiary"
                    size="small"
                    icon={<IconCode />}
                    onClick={() => setShowRequest(!showRequest)}
                >
                    {showRequest ? 'Hide what is sent' : 'Show what is sent'}
                </LemonButton>
            </div>
            {showRequest && (
                <pre className="text-xs bg-surface-secondary rounded border p-2 m-0 whitespace-pre-wrap">{preview}</pre>
            )}
        </Section>
    )
}

function FallbackField({ config, onChange }: FieldProps): JSX.Element {
    if (config.shape === 'content') {
        return (
            <Section
                title="Fallback email"
                help="Sent when the model can't answer, for example when your organization is out of AI credits or the request times out."
            >
                <LemonSelect
                    size="small"
                    fullWidth
                    value={config.fallback_email_template}
                    onChange={(fallback_email_template) =>
                        onChange({ fallback_email_template: fallback_email_template ?? undefined })
                    }
                    options={PROTOTYPE_EMAIL_TEMPLATES}
                />
            </Section>
        )
    }
    const text =
        config.shape === 'branch'
            ? 'When the model can\'t answer, for example when your organization is out of AI credits or the request times out, the person goes down the "If the decision fails" path.'
            : 'When the model can\'t answer, for example when your organization is out of AI credits, the variables stay empty and the conditional branch sends the person down its "No match" path.'
    return (
        <div className="flex gap-2 text-xs text-secondary">
            <IconInfo className="text-base shrink-0" />
            <span>{text}</span>
        </div>
    )
}

function TestWithPerson({ config }: { config: DecisionConfig }): JSX.Element {
    const [personId, setPersonId] = useState(TEST_PEOPLE[0].id)
    const [outcome, setOutcome] = useState<TestOutcome | null>(null)
    const person = TEST_PEOPLE.find((p) => p.id === personId) ?? TEST_PEOPLE[0]
    const answers = getDecisionAnswerNames(config)
    const firstName = person.name.split(' ')[0]

    const runTest = (): void => setOutcome(pickOutcome(config, fakeProbabilities(person, config)))

    return (
        <Section
            title="Test with a person"
            help="Runs the question for one person and shows the answer. A test uses one AI decision."
        >
            <div className="flex gap-2">
                <LemonSelect
                    className="flex-1"
                    size="small"
                    value={personId}
                    onChange={(value) => {
                        setPersonId(value)
                        setOutcome(null)
                    }}
                    options={TEST_PEOPLE.map((p) => ({
                        value: p.id,
                        label: `${p.name} · ${p.properties.job_title}`,
                    }))}
                />
                <LemonButton type="primary" size="small" icon={<IconSparkles />} onClick={runTest}>
                    Run test
                </LemonButton>
            </div>
            {outcome && (
                <div className="flex flex-col gap-2 rounded border p-3 bg-surface-primary">
                    {answers.map((answer, index) => {
                        const percent = Math.round(outcome.probabilities[index] * 100)
                        const picked = outcome.answerIndex === index
                        return (
                            <div key={index} className="flex items-center gap-2 text-xs">
                                <span className={`w-28 truncate ${picked ? 'font-semibold' : ''}`}>{answer}</span>
                                <div className="flex-1 h-2 rounded bg-surface-secondary overflow-hidden">
                                    <div
                                        className="h-full rounded"
                                        // eslint-disable-next-line react/forbid-dom-props
                                        style={{
                                            width: `${percent}%`,
                                            background: picked ? getHogFlowBranchColor(index) : 'var(--color-border)',
                                        }}
                                    />
                                </div>
                                <span className="w-10 text-right tabular-nums">{`${percent}%`}</span>
                            </div>
                        )
                    })}
                    <div className="text-sm">{describeOutcome(config, outcome, answers, firstName)}</div>
                </div>
            )}
        </Section>
    )
}

function describeOutcome(config: DecisionConfig, outcome: TestOutcome, answers: string[], firstName: string): string {
    const answer = outcome.answerIndex === null ? null : answers[outcome.answerIndex]
    const confidence = Math.round(Math.max(...outcome.probabilities) * 100)
    if (config.shape === 'variable') {
        const key = config.answer_variable || 'decision'
        return `Saves ${key} = "${answer}" and ${key}_confidence = ${confidence}.`
    }
    if (config.shape === 'content') {
        const templateValue =
            answer === null
                ? config.fallback_email_template
                : config.options[outcome.answerIndex ?? 0]?.email_template
        const template = PROTOTYPE_EMAIL_TEMPLATES.find((t) => t.value === templateValue)?.label ?? 'no template'
        return answer === null
            ? `No option reached ${config.unsure_threshold ?? 60}%. ${firstName} gets the fallback email, ${template}.`
            : `${firstName} gets ${template}.`
    }
    if (outcome.unsure) {
        return `No option reached ${config.unsure_threshold ?? 60}%. ${firstName} goes down the Unsure path.`
    }
    return `${firstName} goes down the ${answer} path.`
}

function CostHint(): JSX.Element {
    return (
        <div className="flex gap-2 rounded border border-dashed p-2 text-xs text-secondary">
            <IconSparkles className="text-base shrink-0" />
            <span>
                Each person who reaches this step uses one AI decision from your AI credits. About 1,800 people
                triggered this workflow in the last 30 days.
            </span>
        </div>
    )
}
