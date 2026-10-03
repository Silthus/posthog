// PROTOTYPE ONLY (silthus/posthog#212). Simulated state behind the first-run prototype. The MSW handlers
// in firstRunMocks.ts read it, so the real scenes see a backend that reacts to the click-through.
import { MakeLogicType, actions, afterMount, kea, listeners, path, reducers, selectors } from 'kea'
import { router } from 'kea-router'

import { globalSetupLogic } from 'lib/components/ProductSetup'
import type { SetupTaskId } from 'lib/components/ProductSetup'
import { integrationsLogic } from 'lib/integrations/integrationsLogic'

import { ProductKey } from '~/queries/schema/schema-general'

import { workflowLogic } from '../../Workflows/workflowLogic'
import {
    OWN_SENDER,
    OwnDomain,
    PROJECT_FACTS,
    ProjectData,
    ProjectFacts,
    SETUP_TASK,
    SHARED_SENDER,
    WORKFLOW_ID,
    firstWorkflowUrl,
} from './firstRunScenario'
import { HOME_VARIANTS, HomeVariant } from './homeVariants'
import {
    AI_EDITS,
    AiEdit,
    EmailDraft,
    Starter,
    StarterId,
    StarterPick,
    applyAiEdit,
    pickStarters,
    starterById,
} from './starterEmails'

export type BrandStatus = 'detecting' | 'found'
export type WorkflowStatus = 'draft' | 'active'
export type FlowStep = 'customize' | 'test' | 'turn-on'

export interface ChatMessage {
    from: 'user' | 'ai'
    text: string
}

let initialHomeVariant: HomeVariant = HOME_VARIANTS[0].key

export function setInitialHomeVariant(variant: HomeVariant): void {
    initialHomeVariant = variant
}

function completeSetupTask(taskId: string): void {
    globalSetupLogic.findMounted()?.actions.markTaskAsCompleted(taskId as SetupTaskId)
}

function reloadWorkflow(): void {
    workflowLogic.findMounted({ id: WORKFLOW_ID })?.actions.loadWorkflow()
}

interface Values {
    projectData: ProjectData
    homeVariant: HomeVariant
    ownDomain: OwnDomain
    brandStatus: BrandStatus
    brandApplied: boolean
    starterId: StarterId | null
    draft: EmailDraft | null
    flowStep: FlowStep
    chat: ChatMessage[]
    testSent: boolean
    inboxOpen: boolean
    workflowCreated: boolean
    workflowStatus: WorkflowStatus
    senderIntegrationId: number
    facts: ProjectFacts
    picks: StarterPick[]
    starter: Starter | null
}

interface Actions {
    setProjectData: (projectData: ProjectData) => { projectData: ProjectData }
    setHomeVariant: (homeVariant: HomeVariant) => { homeVariant: HomeVariant }
    setOwnDomain: (ownDomain: OwnDomain) => { ownDomain: OwnDomain }
    brandFound: () => { value: true }
    setBrandApplied: (brandApplied: boolean) => { brandApplied: boolean }
    selectStarter: (starterId: StarterId) => { starterId: StarterId }
    closeStarter: () => { value: true }
    updateDraft: (changes: Partial<EmailDraft>) => { changes: Partial<EmailDraft> }
    askAi: (prompt: string, edit: AiEdit) => { prompt: string; edit: AiEdit }
    setFlowStep: (flowStep: FlowStep) => { flowStep: FlowStep }
    sendTest: () => { value: true }
    openInbox: () => { value: true }
    closeInbox: () => { value: true }
    turnOn: () => { value: true }
    openInEditor: () => { value: true }
    setWorkflowStatus: (status: WorkflowStatus) => { status: WorkflowStatus }
    switchToOwnSender: () => { value: true }
}

export type firstRunPrototypeLogicType = MakeLogicType<Values, Actions>

export const firstRunPrototypeLogic = kea<firstRunPrototypeLogicType>([
    path(['products', 'workflows', 'prototype', 'firstRunPrototypeLogic']),
    actions({
        setProjectData: (projectData: ProjectData) => ({ projectData }),
        setHomeVariant: (homeVariant: HomeVariant) => ({ homeVariant }),
        setOwnDomain: (ownDomain: OwnDomain) => ({ ownDomain }),
        brandFound: true,
        setBrandApplied: (brandApplied: boolean) => ({ brandApplied }),
        selectStarter: (starterId: StarterId) => ({ starterId }),
        closeStarter: true,
        updateDraft: (changes: Partial<EmailDraft>) => ({ changes }),
        askAi: (prompt: string, edit: AiEdit) => ({ prompt, edit }),
        setFlowStep: (flowStep: FlowStep) => ({ flowStep }),
        sendTest: true,
        openInbox: true,
        closeInbox: true,
        turnOn: true,
        openInEditor: true,
        setWorkflowStatus: (status: WorkflowStatus) => ({ status }),
        switchToOwnSender: true,
    }),
    reducers(() => ({
        projectData: ['signups-and-emails' as ProjectData, { setProjectData: (_, { projectData }) => projectData }],
        homeVariant: [initialHomeVariant as HomeVariant, { setHomeVariant: (_, { homeVariant }) => homeVariant }],
        ownDomain: [
            'none' as OwnDomain,
            { setOwnDomain: (_, { ownDomain }) => ownDomain, switchToOwnSender: () => 'verified' },
        ],
        brandStatus: ['detecting' as BrandStatus, { brandFound: () => 'found' }],
        brandApplied: [true, { setBrandApplied: (_, { brandApplied }) => brandApplied }],
        starterId: [
            null as StarterId | null,
            {
                selectStarter: (_, { starterId }) => starterId,
                closeStarter: () => null,
                setHomeVariant: () => null,
                setProjectData: () => null,
            },
        ],
        draft: [
            null as EmailDraft | null,
            {
                selectStarter: (_, { starterId }) => starterById(starterId).draft,
                updateDraft: (draft, { changes }) => (draft ? { ...draft, ...changes } : draft),
                askAi: (draft, { edit }) => (draft ? applyAiEdit(draft, edit) : draft),
            },
        ],
        flowStep: [
            'customize' as FlowStep,
            {
                setFlowStep: (_, { flowStep }) => flowStep,
                selectStarter: () => 'customize',
                sendTest: () => 'test',
            },
        ],
        chat: [
            [] as ChatMessage[],
            {
                selectStarter: () => [],
                askAi: (chat, { prompt, edit }) => [
                    ...chat,
                    { from: 'user' as const, text: prompt },
                    { from: 'ai' as const, text: AI_EDITS.find((option) => option.key === edit)?.reply ?? 'Done.' },
                ],
            },
        ],
        testSent: [false, { sendTest: () => true, selectStarter: () => false, setHomeVariant: () => false }],
        inboxOpen: [false, { openInbox: () => true, closeInbox: () => false, turnOn: () => false }],
        workflowCreated: [false, { turnOn: () => true, openInEditor: () => true }],
        workflowStatus: ['draft' as WorkflowStatus, { setWorkflowStatus: (_, { status }) => status }],
        senderIntegrationId: [
            SHARED_SENDER.integrationId,
            {
                switchToOwnSender: () => OWN_SENDER.integrationId,
                setOwnDomain: (current, { ownDomain }) =>
                    ownDomain === 'verified' ? current : SHARED_SENDER.integrationId,
            },
        ],
    })),
    selectors({
        facts: [(s) => [s.projectData], (projectData: ProjectData): ProjectFacts => PROJECT_FACTS[projectData]],
        picks: [(s) => [s.facts], (facts: ProjectFacts): StarterPick[] => pickStarters(facts)],
        starter: [
            (s) => [s.starterId],
            (starterId: StarterId | null): Starter | null => (starterId ? starterById(starterId) : null),
        ],
    }),
    listeners(({ actions, values, cache }) => ({
        sendTest: () => completeSetupTask(SETUP_TASK.sendExample),
        turnOn: () => {
            actions.setWorkflowStatus('active')
            router.actions.push(firstWorkflowUrl())
        },
        openInEditor: () => router.actions.push(firstWorkflowUrl()),
        setWorkflowStatus: ({ status }) => {
            if (status !== 'active') {
                return
            }
            completeSetupTask(SETUP_TASK.turnOnWelcome)
            cache.disposables.add(() => {
                const timer = window.setTimeout(() => {
                    const setup = globalSetupLogic.findMounted()
                    setup?.actions.setSelectedProduct(ProductKey.WORKFLOWS)
                    setup?.actions.openGlobalSetup()
                }, 1500)
                return () => window.clearTimeout(timer)
            }, 'openQuickStart')
        },
        setOwnDomain: () => integrationsLogic.findMounted()?.actions.loadIntegrations(),
        switchToOwnSender: () => {
            completeSetupTask(SETUP_TASK.ownDomain)
            reloadWorkflow()
        },
        setProjectData: () => {
            if (values.workflowCreated) {
                reloadWorkflow()
            }
        },
    })),
    afterMount(({ actions, cache }) => {
        cache.disposables.add(() => {
            const timer = window.setTimeout(() => actions.brandFound(), 2500)
            return () => window.clearTimeout(timer)
        }, 'brandDetection')
    }),
])
