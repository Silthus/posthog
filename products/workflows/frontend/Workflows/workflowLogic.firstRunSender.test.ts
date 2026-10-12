import { expectLogic } from 'kea-test-utils'

import { FEATURE_FLAGS } from 'lib/constants'
import { integrationsLogic } from 'lib/integrations/integrationsLogic'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'
import { IntegrationType } from '~/types'

import { hogFlowEditorLogic } from './hogflows/hogFlowEditorLogic'
import { ACTION_NODES_TO_SHOW } from './hogflows/panel/HogFlowEditorPanelBuild'
import { HogFlowAction } from './hogflows/types'
import { NEW_WORKFLOW, workflowLogic } from './workflowLogic'

const SANDBOX: Partial<IntegrationType> = {
    id: 7,
    kind: 'email',
    display_name: 'Example via PostHog <sandbox@example.com>',
    config: { provider: 'sandbox', verified: true, email: 'sandbox@example.com' },
}
const emailAction = (integrationId?: number): HogFlowAction => ({
    id: 'email',
    type: 'function_email',
    name: 'Send email',
    description: '',
    config: {
        template_id: 'template-email',
        inputs: {
            email: {
                value: {
                    from: integrationId ? { integrationId } : {},
                    to: { email: 'member@example.com' },
                    subject: 'Welcome',
                    html: '<p>Your account is ready.</p>',
                },
                templating: 'liquid',
            },
        },
    },
})

describe('workflow first-run sender', () => {
    let ensureCalls: number
    let integrations: Partial<IntegrationType>[]
    let action: HogFlowAction
    beforeEach(() => {
        integrations = []
        ensureCalls = 0
        action = emailAction()
        useMocks({
            get: {
                '/api/projects/:team_id/integrations/': () => [200, { results: integrations }],
                '/api/projects/:team_id/hog_flow_templates/:id/': () => [
                    200,
                    {
                        ...NEW_WORKFLOW,
                        actions: [NEW_WORKFLOW.actions[0], action, NEW_WORKFLOW.actions[1]],
                    },
                ],
                '/api/projects/:team_id/hog_function_templates/': { results: [], count: 0 },
            },
            post: {
                '/api/projects/:team_id/integrations/email_sandbox_sender/': () => {
                    ensureCalls++
                    integrations = [...integrations, SANDBOX]
                    return [200, SANDBOX]
                },
            },
        })
        initKeaTests()
        featureFlagLogic.actions.setFeatureFlags([FEATURE_FLAGS.WORKFLOWS_SANDBOX_SENDER], {
            [FEATURE_FLAGS.WORKFLOWS_SANDBOX_SENDER]: true,
        })
    })

    it('assigns the sandbox sender before a new template loads into the editor', async () => {
        const logic = workflowLogic({ id: 'new', templateId: 'first-run-example' })
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadWorkflowSuccess'])
        expect(logic.values.workflow.actions.find((step) => step.id === 'email')).toMatchObject({
            config: {
                inputs: {
                    email: {
                        value: {
                            from: { integrationId: SANDBOX.id },
                            subject: 'Welcome',
                            html: '<p>Your account is ready.</p>',
                        },
                        templating: 'liquid',
                    },
                },
            },
        })
        expect(ensureCalls).toBe(1)
        logic.unmount()
    })

    it('assigns the sandbox sender before an inserted email enters the editor', async () => {
        const workflow = workflowLogic({ id: 'new' })
        workflow.mount()
        await expectLogic(workflow).toDispatchActions(['loadWorkflowSuccess'])
        const editor = hogFlowEditorLogic({ id: 'new' })
        editor.mount()
        editor.actions.setNodeToBeAdded(emailAction())

        await expectLogic(editor, () => {
            editor.actions.onDrop(undefined, NEW_WORKFLOW.edges[0])
            editor.actions.setNodeToBeAdded(null)
        }).toDispatchActions(['setWorkflowInfo'])

        expect(workflow.values.workflow.actions.find((step) => step.type === 'function_email')).toMatchObject({
            config: { inputs: { email: { value: { from: { integrationId: SANDBOX.id }, subject: 'Welcome' } } } },
        })
        expect(ensureCalls).toBe(1)
        editor.unmount()
        workflow.unmount()
    })

    it('assigns the sender to the palette email before template defaults are available', async () => {
        const workflow = workflowLogic({ id: 'new' })
        workflow.mount()
        await expectLogic(workflow).toDispatchActions(['loadWorkflowSuccess'])
        const editor = hogFlowEditorLogic({ id: 'new' })
        editor.mount()
        editor.actions.setNodeToBeAdded(ACTION_NODES_TO_SHOW[0])
        await expectLogic(editor, () => editor.actions.onDrop(undefined, NEW_WORKFLOW.edges[0])).toDispatchActions([
            'setWorkflowInfo',
        ])
        expect(workflow.values.workflow.actions.find((step) => step.type === 'function_email')).toMatchObject({
            config: { inputs: { email: { value: { from: { integrationId: SANDBOX.id } } } } },
        })
        editor.unmount()
        workflow.unmount()
    })

    it('shows pending insertion and accepts only one drop while the sender resolves', async () => {
        const workflow = workflowLogic({ id: 'new' })
        workflow.mount()
        await expectLogic(workflow).toDispatchActions(['loadWorkflowSuccess'])
        const editor = hogFlowEditorLogic({ id: 'new' })
        editor.mount()
        editor.actions.setNodeToBeAdded(emailAction())
        const preventDefault = jest.fn()
        await expectLogic(editor, () => {
            editor.actions.onDrop(undefined, NEW_WORKFLOW.edges[0])
            expect(editor.values.emailInsertionPending).toBe(true)
            editor.actions.onDrop({ preventDefault } as unknown as React.DragEvent, NEW_WORKFLOW.edges[0])
        }).toDispatchActions(['setWorkflowInfo'])
        expect(preventDefault).toHaveBeenCalledTimes(1)
        expect(editor.values.emailInsertionPending).toBe(false)
        expect(workflow.values.workflow.actions.filter((step) => step.type === 'function_email')).toHaveLength(1)
        editor.unmount()
        workflow.unmount()
    })

    it('cancels the insertion if its target edge changes while resolving the sender', async () => {
        const workflow = workflowLogic({ id: 'new' })
        workflow.mount()
        await expectLogic(workflow).toDispatchActions(['loadWorkflowSuccess'])
        const editor = hogFlowEditorLogic({ id: 'new' })
        editor.mount()
        editor.actions.setNodeToBeAdded(emailAction())
        const insertion = editor.asyncActions.onDrop(undefined, NEW_WORKFLOW.edges[0])
        workflow.actions.setWorkflowValues({ edges: [] })
        await insertion
        expect(workflow.values.workflow.actions.filter((step) => step.type === 'function_email')).toHaveLength(0)
        expect(editor.values.emailInsertionPending).toBe(false)
        editor.unmount()
        workflow.unmount()
    })

    it('does not apply a pending drop to a reopened blank workflow', async () => {
        let finishProvisioning!: () => void
        let provisioningStarted!: () => void
        const pendingProvisioning = new Promise<void>((resolve) => (finishProvisioning = resolve))
        const started = new Promise<void>((resolve) => (provisioningStarted = resolve))
        useMocks({
            post: {
                '/api/projects/:team_id/integrations/email_sandbox_sender/': async () => {
                    provisioningStarted()
                    await pendingProvisioning
                    integrations = [SANDBOX]
                    return [200, SANDBOX]
                },
            },
        })
        const workflow = workflowLogic({ id: 'new' })
        workflow.mount()
        await expectLogic(workflow).toDispatchActions(['loadWorkflowSuccess'])
        const editor = hogFlowEditorLogic({ id: 'new' })
        editor.mount()
        editor.actions.setNodeToBeAdded(emailAction())
        const insertion = editor.asyncActions.onDrop(undefined, NEW_WORKFLOW.edges[0])
        await started
        editor.unmount()
        workflow.unmount()
        workflow.mount()
        await expectLogic(workflow).toDispatchActions(['loadWorkflowSuccess'])
        editor.mount()
        finishProvisioning()
        await insertion
        expect(workflow.values.workflow.actions.filter((step) => step.type === 'function_email')).toHaveLength(0)
        editor.unmount()
        workflow.unmount()
    })

    it('waits for pending template defaults before inserting the palette email', async () => {
        let finishTemplates!: () => void
        const templatesReady = new Promise<void>((resolve) => (finishTemplates = resolve))
        useMocks({
            get: {
                '/api/projects/:team_id/hog_function_templates/': async () => {
                    await templatesReady
                    return [
                        200,
                        {
                            count: 1,
                            results: [
                                {
                                    id: 'template-email',
                                    name: 'Email',
                                    code: '',
                                    inputs_schema: [
                                        {
                                            key: 'email',
                                            type: 'email',
                                            default: { subject: 'Default subject', from: {} },
                                        },
                                    ],
                                },
                            ],
                        },
                    ]
                },
            },
        })
        const workflow = workflowLogic({ id: 'new' })
        workflow.mount()
        await expectLogic(workflow).toDispatchActions(['loadWorkflowSuccess'])
        const editor = hogFlowEditorLogic({ id: 'new' })
        editor.mount()
        editor.actions.setNodeToBeAdded(ACTION_NODES_TO_SHOW[0])
        const insertion = editor.asyncActions.onDrop(undefined, NEW_WORKFLOW.edges[0])
        finishTemplates()
        await insertion
        expect(workflow.values.workflow.actions.find((step) => step.type === 'function_email')).toMatchObject({
            config: {
                inputs: { email: { value: { from: { integrationId: SANDBOX.id }, subject: 'Default subject' } } },
            },
        })
        editor.unmount()
        workflow.unmount()
    })

    it('keeps email insertion into a broadcast own-sender only', async () => {
        const workflow = workflowLogic({ id: 'new' })
        workflow.mount()
        await expectLogic(workflow).toDispatchActions(['loadWorkflowSuccess'])
        workflow.actions.setWorkflowInfo({ origin_product: 'broadcasts' })
        const editor = hogFlowEditorLogic({ id: 'new' })
        editor.mount()
        editor.actions.setNodeToBeAdded(emailAction())
        await expectLogic(editor, () => editor.actions.onDrop(undefined, NEW_WORKFLOW.edges[0])).toFinishAllListeners()
        expect(workflow.values.workflow.actions.find((step) => step.type === 'function_email')).toMatchObject({
            config: { inputs: { email: { value: { from: {} } } } },
        })
        expect(ensureCalls).toBe(0)
        editor.unmount()
        workflow.unmount()
    })

    it('preserves configured Reply-To without assigning an incompatible sandbox sender', async () => {
        action = emailAction()
        if (action.type === 'function_email') {
            action.config.inputs!.email.value.replyTo = 'reply@example.com'
        }
        const logic = workflowLogic({ id: 'new', templateId: 'first-run-example' })
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadWorkflowSuccess'])
        const email = logic.values.workflow.actions.find((step) => step.id === 'email')
        expect(email?.type === 'function_email' && email.config.inputs?.email?.value).toEqual({
            from: {},
            replyTo: 'reply@example.com',
            to: { email: 'member@example.com' },
            subject: 'Welcome',
            html: '<p>Your account is ready.</p>',
        })
        expect(ensureCalls).toBe(0)
        logic.unmount()
    })

    it('leaves the sender empty when the existing integration list cannot be loaded', async () => {
        useMocks({ get: { '/api/projects/:team_id/integrations/': () => [500, { detail: 'Unavailable' }] } })
        const logic = workflowLogic({ id: 'new', templateId: 'first-run-example' })
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadWorkflowSuccess'])
        expect(ensureCalls).toBe(0)
        const email = logic.values.workflow.actions.find((step) => step.id === 'email')
        expect(email?.type === 'function_email' && email.config.inputs?.email?.value?.from).toEqual({})
        logic.unmount()
    })

    it('retries a transient provisioning failure on the next explicit template load', async () => {
        useMocks({
            post: {
                '/api/projects/:team_id/integrations/email_sandbox_sender/': () => {
                    ensureCalls++
                    if (ensureCalls === 1) {
                        return [500, { detail: 'Unavailable' }]
                    }
                    integrations = [SANDBOX]
                    return [200, SANDBOX]
                },
            },
        })
        const unmountIntegrations = integrationsLogic.mount()
        const logic = workflowLogic({ id: 'new', templateId: 'first-run-example' })
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadWorkflowSuccess'])
        expect(ensureCalls).toBe(1)
        await expectLogic(logic, () => logic.actions.loadWorkflow()).toDispatchActions(['loadWorkflowSuccess'])
        expect(ensureCalls).toBe(2)
        const email = logic.values.workflow.actions.find((step) => step.id === 'email')
        expect(email?.type === 'function_email' && email.config.inputs?.email?.value?.from).toEqual({
            integrationId: SANDBOX.id,
        })
        logic.unmount()
        unmountIntegrations()
    })

    it.each<{
        name: string
        senders: Partial<IntegrationType>[]
        configured?: number
        flag: boolean
        expected?: number
    }>([
        {
            name: 'a verified own sender',
            senders: [{ id: 9, kind: 'email', config: { verified: true } }],
            configured: undefined,
            flag: true,
            expected: 9,
        },
        {
            name: 'multiple verified senders',
            senders: [
                { id: 9, kind: 'email', config: { verified: true } },
                { id: 10, kind: 'email', config: { verified: true } },
                SANDBOX,
            ],
            configured: undefined,
            flag: true,
            expected: undefined,
        },
        { name: 'a configured sender', senders: [], configured: 12, flag: true, expected: 12 },
        { name: 'the sandbox flag off', senders: [], configured: undefined, flag: false, expected: undefined },
    ])('preserves sender policy with $name', async ({ senders, configured, flag, expected }) => {
        integrations = senders
        action = emailAction(configured)
        featureFlagLogic.actions.setFeatureFlags([], { [FEATURE_FLAGS.WORKFLOWS_SANDBOX_SENDER]: flag })
        const logic = workflowLogic({ id: 'new', templateId: 'first-run-example' })
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadWorkflowSuccess'])
        const email = logic.values.workflow.actions.find((step) => step.id === 'email')
        expect(email?.type === 'function_email' && email.config.inputs?.email?.value?.from?.integrationId).toBe(
            expected
        )
        expect(ensureCalls).toBe(0)
        logic.unmount()
    })
})
