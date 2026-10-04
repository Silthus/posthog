// PROTOTYPE ONLY (silthus/posthog#212). Simulated state behind the first-run prototype. The MSW handlers
// in firstRunMocks.ts read it, so the real scenes see a backend that reacts to the click-through.
import { MakeLogicType, actions, afterMount, kea, listeners, path, reducers, selectors } from 'kea'
import { router } from 'kea-router'

import { globalSetupLogic } from 'lib/components/ProductSetup'
import type { SetupTaskId } from 'lib/components/ProductSetup'
import { integrationsLogic } from 'lib/integrations/integrationsLogic'
import { emailTemplaterLogic } from 'scenes/hog-functions/email-templater/emailTemplaterLogic'

import { sidePanelStateLogic } from '~/layout/navigation-3000/sidepanel/sidePanelStateLogic'
import { SidePanelTab } from '~/types'

import type { HogFlowTemplate } from '../../Workflows/hogflows/types'
import { workflowLogic } from '../../Workflows/workflowLogic'
import { BrandField, DETECTED_BRAND, EmailBrand, FILES_READ, applyBrand, rebrand } from './emailBrand'
import {
    OWN_SENDER,
    OwnDomain,
    PROJECT_FACTS,
    ProjectData,
    ProjectFacts,
    SETUP_TASK,
    SHARED_SENDER,
    SIGNED_IN_USER,
    WORKFLOW_ID,
    firstWorkflowUrl,
} from './firstRunScenario'
import { TemplateFit, emailActions, firstEmailValue, templateById, templateFits } from './realTemplates'

export type BrandStatus = 'detecting' | 'found'
export type WorkflowStatus = 'draft' | 'active'
export type EmailValue = Record<string, any>

function completeSetupTask(taskId: string): void {
    globalSetupLogic.findMounted()?.actions.markTaskAsCompleted(taskId as SetupTaskId)
}

function reloadWorkflow(): void {
    workflowLogic.findMounted({ id: WORKFLOW_ID })?.actions.loadWorkflow()
}

function exportFromEditor(): Promise<{ html: string; design: Record<string, any> } | null> {
    const editor = emailTemplaterLogic.findMounted()?.values.emailEditorRef?.editor
    if (!editor) {
        return Promise.resolve(null)
    }
    return new Promise((resolve) => {
        const timeout = window.setTimeout(() => resolve(null), 3000)
        editor.exportHtml((data: any) => {
            window.clearTimeout(timeout)
            resolve(data)
        })
    })
}

function renderForRecipient(html: string): string {
    return html
        .replace(/\{\{\s*person\.properties\.first_name\s*\}\}/g, SIGNED_IN_USER.name)
        .replace(/\{\{\s*person\.properties\.name\s*\}\}/g, SIGNED_IN_USER.name)
        .replace(/\{\{\s*person\.properties\.email\s*\}\}/g, SIGNED_IN_USER.email)
        .replace(/\{\{[^}]*\}\}/g, '')
}

function brandedEmail(template: HogFlowTemplate, brand: EmailBrand): EmailValue {
    const value = firstEmailValue(template)
    return {
        ...value,
        from: { integrationId: SHARED_SENDER.integrationId },
        design: value.design ? applyBrand(value.design, brand) : value.design,
    }
}

interface Values {
    projectData: ProjectData
    ownDomain: OwnDomain
    brandStatus: BrandStatus
    filesRead: number
    brand: EmailBrand
    editedFields: BrandField[]
    templateId: string | null
    email: EmailValue | null
    testHtml: string | null
    inboxOpen: boolean
    workflowCreated: boolean
    workflowStatus: WorkflowStatus
    senderIntegrationId: number
    facts: ProjectFacts
    fits: TemplateFit[]
    template: HogFlowTemplate | null
}

interface Actions {
    setProjectData: (projectData: ProjectData) => { projectData: ProjectData }
    setOwnDomain: (ownDomain: OwnDomain) => { ownDomain: OwnDomain }
    detectBrand: () => { value: true }
    fileRead: () => { value: true }
    brandFound: () => { value: true }
    setBrandValue: <F extends BrandField>(field: F, value: EmailBrand[F]) => { field: F; value: EmailBrand[F] }
    revertToDetected: (field: BrandField) => { field: BrandField }
    selectTemplate: (templateId: string) => { templateId: string }
    closeTemplate: () => { value: true }
    setEmail: (email: EmailValue) => { email: EmailValue }
    askPostHogAi: () => { value: true }
    sendTest: () => { value: true }
    setTestHtml: (html: string) => { html: string }
    openInbox: () => { value: true }
    closeInbox: () => { value: true }
    openWorkflow: () => { value: true }
    workflowReady: () => { value: true }
    setWorkflowStatus: (status: WorkflowStatus) => { status: WorkflowStatus }
    switchToOwnSender: () => { value: true }
}

export type firstRunPrototypeLogicType = MakeLogicType<Values, Actions>

export const firstRunPrototypeLogic = kea<firstRunPrototypeLogicType>([
    path(['products', 'workflows', 'prototype', 'firstRunPrototypeLogic']),
    actions({
        setProjectData: (projectData: ProjectData) => ({ projectData }),
        setOwnDomain: (ownDomain: OwnDomain) => ({ ownDomain }),
        detectBrand: true,
        fileRead: true,
        brandFound: true,
        setBrandValue: (field: BrandField, value: unknown) => ({ field, value }) as any,
        revertToDetected: (field: BrandField) => ({ field }),
        selectTemplate: (templateId: string) => ({ templateId }),
        closeTemplate: true,
        setEmail: (email: EmailValue) => ({ email }),
        askPostHogAi: true,
        sendTest: true,
        setTestHtml: (html: string) => ({ html }),
        openInbox: true,
        closeInbox: true,
        openWorkflow: true,
        workflowReady: true,
        setWorkflowStatus: (status: WorkflowStatus) => ({ status }),
        switchToOwnSender: true,
    }),
    reducers(() => ({
        projectData: ['signups-and-emails' as ProjectData, { setProjectData: (_, { projectData }) => projectData }],
        ownDomain: [
            'none' as OwnDomain,
            { setOwnDomain: (_, { ownDomain }) => ownDomain, switchToOwnSender: () => 'verified' },
        ],
        brandStatus: ['detecting' as BrandStatus, { detectBrand: () => 'detecting', brandFound: () => 'found' }],
        filesRead: [0, { detectBrand: () => 0, fileRead: (count) => count + 1 }],
        brand: [
            DETECTED_BRAND,
            {
                setBrandValue: (brand, { field, value }) => ({ ...brand, [field]: value }),
                revertToDetected: (brand, { field }) => ({ ...brand, [field]: DETECTED_BRAND[field] }),
            },
        ],
        editedFields: [
            [] as BrandField[],
            {
                setBrandValue: (fields, { field }) => (fields.includes(field) ? fields : [...fields, field]),
                revertToDetected: (fields, { field }) => fields.filter((edited) => edited !== field),
            },
        ],
        templateId: [
            null as string | null,
            {
                selectTemplate: (_, { templateId }) => templateId,
                closeTemplate: () => null,
                setProjectData: () => null,
            },
        ],
        email: [null as EmailValue | null, { setEmail: (_, { email }) => email }],
        testHtml: [null as string | null, { setTestHtml: (_, { html }) => html, selectTemplate: () => null }],
        inboxOpen: [false, { openInbox: () => true, closeInbox: () => false, workflowReady: () => false }],
        workflowCreated: [false, { workflowReady: () => true }],
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
        fits: [(s) => [s.facts], (facts: ProjectFacts): TemplateFit[] => templateFits(facts)],
        template: [
            (s) => [s.templateId],
            (templateId: string | null): HogFlowTemplate | null => (templateId ? templateById(templateId) : null),
        ],
    }),
    listeners(({ actions, values, cache, selectors }) => ({
        detectBrand: () => {
            cache.disposables.add(() => {
                const timer = window.setInterval(() => {
                    if (values.filesRead >= FILES_READ.length) {
                        window.clearInterval(timer)
                        actions.brandFound()
                    } else {
                        actions.fileRead()
                    }
                }, 450)
                return () => window.clearInterval(timer)
            }, 'brandDetection')
        },
        selectTemplate: ({ templateId }) => actions.setEmail(brandedEmail(templateById(templateId), values.brand)),
        setBrandValue: (_, __, ___, previousState) => {
            const previous = selectors.brand(previousState)
            if (values.email?.design) {
                actions.setEmail({ ...values.email, design: rebrand(values.email.design, previous, values.brand) })
            }
        },
        revertToDetected: (_, __, ___, previousState) => {
            const previous = selectors.brand(previousState)
            if (values.email?.design) {
                actions.setEmail({ ...values.email, design: rebrand(values.email.design, previous, values.brand) })
            }
        },
        askPostHogAi: () => {
            sidePanelStateLogic
                .findMounted()
                ?.actions.openSidePanel(
                    SidePanelTab.Max,
                    `Change the "${values.template?.name ?? 'email'}" email I'm editing: `
                )
        },
        sendTest: async () => {
            const exported = await exportFromEditor()
            if (exported && values.email) {
                actions.setEmail({ ...values.email, html: exported.html, design: exported.design })
            }
            actions.setTestHtml(renderForRecipient(exported?.html ?? values.email?.html ?? ''))
            completeSetupTask(SETUP_TASK.sendExample)
        },
        openWorkflow: async () => {
            const exported = await exportFromEditor()
            if (exported && values.email) {
                actions.setEmail({ ...values.email, html: exported.html, design: exported.design })
            }
            actions.workflowReady()
            router.actions.push(firstWorkflowUrl(values.template ? emailActions(values.template)[0].id : undefined))
        },
        setWorkflowStatus: ({ status }) => {
            if (status !== 'active') {
                return
            }
            completeSetupTask(SETUP_TASK.turnOnWelcome)
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
    afterMount(({ actions }) => actions.detectBrand()),
])
