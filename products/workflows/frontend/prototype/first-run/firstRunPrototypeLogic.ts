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
    WELCOME_WORKFLOW_ID,
    welcomeWorkflowUrl,
} from './firstRunScenario'
import { HomeVariant } from './homeVariants'

export type BrandStatus = 'detecting' | 'found'
export type WorkflowStatus = 'draft' | 'active'

let initialHomeVariant: HomeVariant = 'A'

export function setInitialHomeVariant(variant: HomeVariant): void {
    initialHomeVariant = variant
}

function completeSetupTask(taskId: string): void {
    globalSetupLogic.findMounted()?.actions.markTaskAsCompleted(taskId as SetupTaskId)
}

interface Values {
    projectData: ProjectData
    homeVariant: HomeVariant
    ownDomain: OwnDomain
    brandStatus: BrandStatus
    exampleSent: boolean
    inboxOpen: boolean
    workflowCreated: boolean
    workflowStatus: WorkflowStatus
    senderIntegrationId: number
    facts: ProjectFacts
    signupEvent: string
}

interface Actions {
    setProjectData: (projectData: ProjectData) => { projectData: ProjectData }
    setHomeVariant: (homeVariant: HomeVariant) => { homeVariant: HomeVariant }
    setOwnDomain: (ownDomain: OwnDomain) => { ownDomain: OwnDomain }
    brandFound: () => { value: true }
    sendExample: () => { value: true }
    openInbox: () => { value: true }
    closeInbox: () => { value: true }
    openWelcomeWorkflow: () => { value: true }
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
        sendExample: true,
        openInbox: true,
        closeInbox: true,
        openWelcomeWorkflow: true,
        setWorkflowStatus: (status: WorkflowStatus) => ({ status }),
        switchToOwnSender: true,
    }),
    reducers(() => ({
        projectData: ['signups-and-emails' as ProjectData, { setProjectData: (_, { projectData }) => projectData }],
        ownDomain: [
            'none' as OwnDomain,
            {
                setOwnDomain: (_, { ownDomain }) => ownDomain,
                switchToOwnSender: () => 'verified',
            },
        ],
        homeVariant: [initialHomeVariant as HomeVariant, { setHomeVariant: (_, { homeVariant }) => homeVariant }],
        brandStatus: ['detecting' as BrandStatus, { brandFound: () => 'found' }],
        exampleSent: [false, { sendExample: () => true, setHomeVariant: () => false }],
        inboxOpen: [
            false,
            {
                openInbox: () => true,
                closeInbox: () => false,
                openWelcomeWorkflow: () => false,
                setHomeVariant: () => false,
            },
        ],
        workflowCreated: [false, { openWelcomeWorkflow: () => true }],
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
        signupEvent: [(s) => [s.facts], (facts: ProjectFacts): string => facts.signupEvent ?? 'signed_up'],
    }),
    listeners(({ values, cache }) => ({
        sendExample: () => completeSetupTask(SETUP_TASK.sendExample),
        openWelcomeWorkflow: () => router.actions.push(welcomeWorkflowUrl()),
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
                }, 800)
                return () => window.clearTimeout(timer)
            }, 'openQuickStart')
        },
        setOwnDomain: () => integrationsLogic.findMounted()?.actions.loadIntegrations(),
        switchToOwnSender: () => {
            completeSetupTask(SETUP_TASK.ownDomain)
            workflowLogic.findMounted({ id: WELCOME_WORKFLOW_ID })?.actions.loadWorkflow()
        },
        setProjectData: () => {
            if (values.workflowCreated) {
                workflowLogic.findMounted({ id: WELCOME_WORKFLOW_ID })?.actions.loadWorkflow()
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
