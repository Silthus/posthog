// PROTOTYPE (#245): three shapes of an AI decision step in the real graph editor, switchable with
// the floating bar or the arrow keys. Throwaway: lives on prototype/workflow-decision-step only.
import type { Meta, StoryFn } from '@storybook/react'
import { BindLogic, useActions, useValues } from 'kea'
import { useEffect, useState } from 'react'

import { IconChevronLeft, IconChevronRight } from '@posthog/icons'
import { SpinnerOverlay } from '@posthog/lemon-ui'

import { mswDecorator } from '~/mocks/browser'

import { NEW_WORKFLOW, workflowLogic } from '../../../workflowLogic'
import { HogFlowEditor } from '../../HogFlowEditor'
import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import type { HogFlow, HogFlowAction } from '../../types'

type VariantKey = 'A' | 'B' | 'C'

const VARIANTS: { key: VariantKey; name: string; workflowId: string; decisionId: string }[] = [
    { key: 'A', name: 'Branching step', workflowId: 'prototype-decision-branch', decisionId: 'decide-track' },
    {
        key: 'B',
        name: 'Variable writer + conditional branch',
        workflowId: 'prototype-decision-variable',
        decisionId: 'decide-track',
    },
    { key: 'C', name: 'Content picker', workflowId: 'prototype-decision-content', decisionId: 'pick-email' },
]

const TRACK_OPTIONS = [
    {
        name: 'Self-serve',
        description: 'Small teams or solo builders who want to set things up on their own.',
    },
    {
        name: 'Sales-assisted',
        description: 'Larger companies that mention procurement, SSO, contracts, or several teams.',
    },
    {
        name: 'Developer',
        description: 'Engineers who mention an SDK, an API, a backend language, or SQL.',
    },
]

const CONTEXT = [
    { key: 'job_title', value: '{person.properties.job_title}' },
    { key: 'company_size', value: '{person.properties.company_size}' },
    { key: 'signup_answer', value: '{person.properties.signup_answer}' },
]

const QUESTION = 'Which onboarding track fits this person best?'

const TRIGGER: HogFlowAction = {
    id: 'trigger',
    type: 'trigger',
    name: 'User signed up',
    description: 'Starts when someone creates an account.',
    config: {
        type: 'event',
        filters: { events: [{ id: 'user signed up', name: 'user signed up', type: 'events' }], properties: [], actions: [] },
    },
} as HogFlowAction

function email(id: string, name: string, subject: string): HogFlowAction {
    return {
        id,
        type: 'function',
        name,
        description: '',
        config: {
            template_id: 'template-email',
            inputs: { email: { value: { to: { email: '{person.properties.email}' }, subject } } },
        },
    } as HogFlowAction
}

const EXIT: HogFlowAction = {
    id: 'exit',
    type: 'exit',
    name: 'End workflow',
    description: '',
    config: { reason: 'Onboarding email sent' },
} as HogFlowAction

const NOTIFY_SALES: HogFlowAction = {
    id: 'notify-sales',
    type: 'function',
    name: 'Notify the sales team',
    description: '',
    config: {
        template_id: 'template-slack',
        inputs: {
            slack_workspace: { value: 1 },
            channel: { value: '#new-leads' },
            text: { value: 'New sales-assisted signup: {person.properties.email}', templating: 'hog' },
        },
    },
} as HogFlowAction

const BASE = {
    ...NEW_WORKFLOW,
    team_id: 1,
    version: 1,
    status: 'draft' as const,
    trigger: (TRIGGER.config as any) ?? undefined,
    exit_condition: 'exit_only_at_end' as const,
    created_at: '2026-10-04T09:00:00.000Z',
    updated_at: '2026-10-04T09:00:00.000Z',
}

const BRANCH_WORKFLOW: HogFlow = {
    ...BASE,
    id: 'prototype-decision-branch',
    name: 'Onboarding by track (A: branching step)',
    actions: [
        TRIGGER,
        {
            id: 'decide-track',
            type: 'decision',
            name: 'Choose onboarding track',
            description: 'AI decision',
            config: {
                shape: 'branch',
                question: QUESTION,
                answer_type: 'pick_one',
                options: TRACK_OPTIONS,
                context: CONTEXT,
                yes_threshold: 50,
                unsure_enabled: true,
                unsure_threshold: 60,
            },
        } as HogFlowAction,
        email('email-self-serve', 'Send self-serve welcome', 'Build it yourself'),
        NOTIFY_SALES,
        email('email-api', 'Send API quickstart', 'Your API quickstart'),
        email('email-general', 'Send general welcome', 'Welcome'),
        EXIT,
    ],
    edges: [
        { from: 'trigger', to: 'decide-track', type: 'continue' },
        { from: 'decide-track', to: 'email-self-serve', type: 'branch', index: 0 },
        { from: 'decide-track', to: 'notify-sales', type: 'branch', index: 1 },
        { from: 'decide-track', to: 'email-api', type: 'branch', index: 2 },
        { from: 'decide-track', to: 'email-general', type: 'branch', index: 3 },
        { from: 'decide-track', to: 'email-general', type: 'continue' },
        { from: 'email-self-serve', to: 'exit', type: 'continue' },
        { from: 'notify-sales', to: 'exit', type: 'continue' },
        { from: 'email-api', to: 'exit', type: 'continue' },
        { from: 'email-general', to: 'exit', type: 'continue' },
    ],
}

const variableCondition = (name: string): { name: string; filters: any } => ({
    name,
    filters: { properties: [{ key: 'onboarding_track', type: 'workflow_variable', value: name, operator: 'exact' }] },
})

const VARIABLE_WORKFLOW: HogFlow = {
    ...BASE,
    id: 'prototype-decision-variable',
    name: 'Onboarding by track (B: variable writer)',
    variables: [
        { key: 'onboarding_track', type: 'string', label: 'Onboarding track', default: '' },
        { key: 'onboarding_track_confidence', type: 'number', label: 'Onboarding track confidence', default: 0 },
    ],
    actions: [
        TRIGGER,
        {
            id: 'decide-track',
            type: 'decision',
            name: 'Decide onboarding track',
            description: 'AI decision',
            config: {
                shape: 'variable',
                question: QUESTION,
                answer_type: 'pick_one',
                options: TRACK_OPTIONS,
                context: CONTEXT,
                yes_threshold: 50,
                answer_variable: 'onboarding_track',
            },
        } as HogFlowAction,
        {
            id: 'route-track',
            type: 'conditional_branch',
            name: 'Route by onboarding track',
            description: 'Reads the onboarding_track variable.',
            config: {
                conditions: [
                    variableCondition('Self-serve'),
                    variableCondition('Sales-assisted'),
                    variableCondition('Developer'),
                ],
            },
        } as HogFlowAction,
        email('email-self-serve', 'Send self-serve welcome', 'Build it yourself'),
        NOTIFY_SALES,
        email('email-api', 'Send API quickstart', 'Your API quickstart'),
        email('email-general', 'Send general welcome', 'Welcome'),
        EXIT,
    ],
    edges: [
        { from: 'trigger', to: 'decide-track', type: 'continue' },
        { from: 'decide-track', to: 'route-track', type: 'continue' },
        { from: 'route-track', to: 'email-self-serve', type: 'branch', index: 0 },
        { from: 'route-track', to: 'notify-sales', type: 'branch', index: 1 },
        { from: 'route-track', to: 'email-api', type: 'branch', index: 2 },
        { from: 'route-track', to: 'email-general', type: 'continue' },
        { from: 'email-self-serve', to: 'exit', type: 'continue' },
        { from: 'notify-sales', to: 'exit', type: 'continue' },
        { from: 'email-api', to: 'exit', type: 'continue' },
        { from: 'email-general', to: 'exit', type: 'continue' },
    ],
}

const CONTENT_WORKFLOW: HogFlow = {
    ...BASE,
    id: 'prototype-decision-content',
    name: 'Onboarding email (C: content picker)',
    actions: [
        TRIGGER,
        {
            id: 'pick-email',
            type: 'decision',
            name: 'Send best-fit welcome email',
            description: 'AI decision',
            config: {
                shape: 'content',
                question: 'Which welcome email fits this person best?',
                answer_type: 'pick_one',
                options: [
                    { ...TRACK_OPTIONS[0], email_template: 'welcome-self-serve' },
                    { ...TRACK_OPTIONS[1], email_template: 'welcome-sales' },
                    { ...TRACK_OPTIONS[2], email_template: 'welcome-api' },
                ],
                context: CONTEXT,
                unsure_enabled: true,
                unsure_threshold: 60,
                fallback_email_template: 'welcome-general',
            },
        } as HogFlowAction,
        {
            id: 'wait-3-days',
            type: 'delay',
            name: 'Wait 3 days',
            description: '',
            config: { delay_duration: '3d' },
        } as HogFlowAction,
        email('email-check-in', 'Send check-in', 'How is it going?'),
        EXIT,
    ],
    edges: [
        { from: 'trigger', to: 'pick-email', type: 'continue' },
        { from: 'pick-email', to: 'wait-3-days', type: 'continue' },
        { from: 'wait-3-days', to: 'email-check-in', type: 'continue' },
        { from: 'email-check-in', to: 'exit', type: 'continue' },
    ],
}

const PROTOTYPE_WORKFLOWS: Record<string, HogFlow> = {
    [BRANCH_WORKFLOW.id]: BRANCH_WORKFLOW,
    [VARIABLE_WORKFLOW.id]: VARIABLE_WORKFLOW,
    [CONTENT_WORKFLOW.id]: CONTENT_WORKFLOW,
}

const meta: Meta = {
    title: 'Products/Workflows/Prototype/Decision step',
    parameters: {
        layout: 'fullscreen',
        mockDate: '2026-10-04 09:00:00',
        testOptions: { waitForSelector: '.react-flow__node', viewport: { width: 1600, height: 1000 } },
    },
    decorators: [
        mswDecorator({
            get: {
                '/api/projects/:team_id/hog_flow_templates/': { count: 0, results: [] },
                '/api/environments/:team_id/hog_flows/:id/': ({ params }) => [
                    200,
                    PROTOTYPE_WORKFLOWS[String(params.id)] ?? BRANCH_WORKFLOW,
                ],
                '/api/environments/:team_id/messaging_categories': { count: 0, results: [] },
            },
            patch: {
                '/api/environments/:team_id/hog_flows/:id/': async ({ request, params }) => [
                    200,
                    {
                        ...(PROTOTYPE_WORKFLOWS[String(params.id)] ?? BRANCH_WORKFLOW),
                        ...((await request.json()) as Partial<HogFlow>),
                    },
                ],
            },
        }),
    ],
}
export default meta

function readVariantFromUrl(): VariantKey | null {
    for (const win of [window, window.parent]) {
        try {
            const value = new URLSearchParams(win.location.search).get('variant')?.toUpperCase()
            if (value === 'A' || value === 'B' || value === 'C') {
                return value
            }
        } catch {
            // cross-origin parent
        }
    }
    return null
}

function writeVariantToUrl(variant: VariantKey): void {
    for (const win of [window, window.parent]) {
        try {
            const url = new URL(win.location.href)
            url.searchParams.set('variant', variant)
            win.history.replaceState(win.history.state, '', url.toString())
        } catch {
            // cross-origin parent
        }
    }
}

function SelectDecisionOnLoad({ workflowId, decisionId }: { workflowId: string; decisionId: string }): null {
    const { nodes } = useValues(hogFlowEditorLogic({ id: workflowId }))
    const { setSelectedNodeId } = useActions(hogFlowEditorLogic({ id: workflowId }))
    const hasDecisionNode = nodes.some((node) => node.id === decisionId)
    useEffect(() => {
        if (hasDecisionNode) {
            setSelectedNodeId(decisionId)
        }
    }, [hasDecisionNode, decisionId, setSelectedNodeId])
    return null
}

function PrototypeWorkflow({ workflowId, decisionId }: { workflowId: string; decisionId: string }): JSX.Element {
    const { originalWorkflow } = useValues(workflowLogic)
    return (
        <div className="flex h-full flex-col">
            {originalWorkflow ? (
                <>
                    <HogFlowEditor key={originalWorkflow.id} isTreeView={false} />
                    <SelectDecisionOnLoad workflowId={workflowId} decisionId={decisionId} />
                </>
            ) : (
                <SpinnerOverlay />
            )}
        </div>
    )
}

function PrototypeSwitcher({
    current,
    onChange,
}: {
    current: VariantKey
    onChange: (variant: VariantKey) => void
}): JSX.Element {
    const index = VARIANTS.findIndex((variant) => variant.key === current)
    const step = (delta: number): void => onChange(VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length].key)

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            const target = event.target as HTMLElement | null
            if (target?.closest('input, textarea, [contenteditable="true"]')) {
                return
            }
            if (event.key === 'ArrowLeft') {
                step(-1)
            } else if (event.key === 'ArrowRight') {
                step(1)
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    })

    return (
        <div className="fixed bottom-4 left-1/2 z-[9999] -translate-x-1/2 flex items-center gap-1 rounded-full bg-black px-2 py-1 text-white shadow-lg">
            <button type="button" className="rounded-full p-1 hover:bg-white/20" onClick={() => step(-1)}>
                <IconChevronLeft className="text-lg" />
            </button>
            <span className="px-2 text-sm font-semibold whitespace-nowrap">
                {`Prototype ${current}: ${VARIANTS[index].name}`}
            </span>
            <button type="button" className="rounded-full p-1 hover:bg-white/20" onClick={() => step(1)}>
                <IconChevronRight className="text-lg" />
            </button>
        </div>
    )
}

function DecisionStepPrototype({ initialVariant }: { initialVariant: VariantKey }): JSX.Element {
    const [variantKey, setVariantKey] = useState<VariantKey>(() => readVariantFromUrl() ?? initialVariant)
    const variant = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0]

    const changeVariant = (next: VariantKey): void => {
        setVariantKey(next)
        writeVariantToUrl(next)
    }

    return (
        <>
            <BindLogic key={variant.workflowId} logic={workflowLogic} props={{ id: variant.workflowId }}>
                <div className="h-screen [&>div]:!h-full [&>div]:!max-h-none">
                    <PrototypeWorkflow workflowId={variant.workflowId} decisionId={variant.decisionId} />
                </div>
            </BindLogic>
            <PrototypeSwitcher current={variantKey} onChange={changeVariant} />
        </>
    )
}

export const AllShapes: StoryFn = () => <DecisionStepPrototype initialVariant="A" />
export const BranchingStep: StoryFn = () => <DecisionStepPrototype initialVariant="A" />
export const VariableWriter: StoryFn = () => <DecisionStepPrototype initialVariant="B" />
export const ContentPicker: StoryFn = () => <DecisionStepPrototype initialVariant="C" />
