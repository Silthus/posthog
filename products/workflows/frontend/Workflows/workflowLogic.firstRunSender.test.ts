import { expectLogic } from 'kea-test-utils'
import posthog from 'posthog-js'

import { lemonToast } from '@posthog/lemon-ui'

import { FEATURE_FLAGS } from 'lib/constants'
import { integrationsLogic } from 'lib/integrations/integrationsLogic'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'
import { IntegrationType } from '~/types'

import { draftMessage } from '../MessageAudience/messageDrafts'
import { hogFlowEditorLogic } from './hogflows/hogFlowEditorLogic'
import { HogFlowAction } from './hogflows/types'
import { workflowStepSections } from './hogflows/workflowStepCatalog'
import { NEW_WORKFLOW, workflowLogic } from './workflowLogic'

const PALETTE_EMAIL_STEP = workflowStepSections({ featureFlags: {}, currentTeam: null, isRowScopedTrigger: false })
    .flatMap((section) => section.steps)
    .find((step) => step.type === 'function_email')!

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

    it.each([
        ['function_email', false],
        ['function', false],
        ['function', true],
    ] as const)('loads a %s template with an eligible first-run sender (own sender=%s)', async (type, ownSender) => {
        action = { ...emailAction(), type } as HogFlowAction
        if (ownSender) {
            integrations = [
                { id: 5, kind: 'email', config: { verified: true, provider: 'ses', email: 'own@example.com' } },
            ]
        }
        const logic = workflowLogic({ id: 'new', templateId: 'first-run-example' })
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadWorkflowSuccess'])
        const email = logic.values.workflow.actions.find((step) => step.id === 'email')
        expect(email).toMatchObject({
            type,
            config: {
                inputs: {
                    email: {
                        value: {
                            from: ownSender
                                ? { integrationId: 5 }
                                : type === 'function_email'
                                  ? { integrationId: SANDBOX.id }
                                  : {},
                            subject: 'Welcome',
                            html: '<p>Your account is ready.</p>',
                        },
                        templating: 'liquid',
                    },
                },
            },
        })
        const from =
            email?.type === 'function_email' || email?.type === 'function'
                ? email.config.inputs?.email?.value?.from
                : undefined
        expect(from?.integrationId).toBe(ownSender ? 5 : type === 'function_email' ? SANDBOX.id : undefined)
        expect(ensureCalls).toBe(!ownSender && type === 'function_email' ? 1 : 0)
        logic.unmount()
    })

    it.each([
        ['a template', { templateId: 'first-run-example' }],
        [
            'a trigger prefill',
            {
                triggerPrefill: JSON.stringify({
                    type: 'event',
                    filters: { events: [{ id: '$pageview', name: '$pageview', type: 'events' }] },
                }),
                emailPrefill: JSON.stringify(draftMessage({ kind: 'issue_hit' })),
            },
        ],
    ])('preselects the first-run sender once for a workflow from %s', async (_source, prefillProps) => {
        const capture = jest.spyOn(posthog, 'capture').mockImplementation()
        const logic = workflowLogic({ id: 'new', ...prefillProps })
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadWorkflowSuccess'])
        const email = logic.values.workflow.actions.find((step) => step.type === 'function_email')
        expect(email?.type === 'function_email' && email.config.inputs?.email?.value?.from).toEqual({
            integrationId: SANDBOX.id,
        })
        expect(capture.mock.calls.filter(([event]) => event === 'email sender preselected')).toEqual([
            ['email sender preselected', { surface: 'workflow', reason: 'sandbox_sender' }],
        ])
        capture.mockRestore()
        logic.unmount()
    })

    it('keeps the sandbox sender off a duplicated generic function email step', async () => {
        action = { ...emailAction(), type: 'function' } as HogFlowAction
        const workflow = workflowLogic({ id: 'new', templateId: 'first-run-example' })
        workflow.mount()
        await expectLogic(workflow).toDispatchActions(['loadWorkflowSuccess'])
        workflow.actions.setWorkflowInfo({
            edges: [
                { from: 'trigger_node', to: 'email', type: 'continue' },
                { from: 'email', to: 'exit_node', type: 'continue' },
            ],
        })
        const editor = hogFlowEditorLogic({ id: 'new', templateId: 'first-run-example' })
        editor.mount()

        await expectLogic(editor, () => editor.actions.duplicateNodeBelow('email')).toFinishAllListeners()

        const emails = workflow.values.workflow.actions.filter((step) => step.type === 'function')
        expect(emails).toHaveLength(2)
        expect(emails.map((step) => step.type === 'function' && step.config.inputs?.email?.value?.from)).toEqual([
            {},
            {},
        ])
        expect(ensureCalls).toBe(0)
        editor.unmount()
        workflow.unmount()
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
        editor.actions.setNodeToBeAdded(PALETTE_EMAIL_STEP)
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

    it('holds the save of a new workflow until its email step has a sender', async () => {
        let finishProvisioning!: () => void
        let provisioningStarted!: () => void
        const pendingProvisioning = new Promise<void>((resolve) => (finishProvisioning = resolve))
        const started = new Promise<void>((resolve) => (provisioningStarted = resolve))
        let saves = 0
        useMocks({
            post: {
                '/api/projects/:team_id/integrations/email_sandbox_sender/': async () => {
                    provisioningStarted()
                    await pendingProvisioning
                    integrations = [SANDBOX]
                    return [200, SANDBOX]
                },
                '/api/projects/:team_id/hog_flows/': () => {
                    saves++
                    return [201, { ...NEW_WORKFLOW, id: 'saved-workflow' }]
                },
            },
        })
        const toast = jest.spyOn(lemonToast, 'info').mockImplementation()
        const workflow = workflowLogic({ id: 'new' })
        workflow.mount()
        await expectLogic(workflow).toDispatchActions(['loadWorkflowSuccess'])
        workflow.actions.setWorkflowValues({ name: 'Welcome' })
        const editor = hogFlowEditorLogic({ id: 'new' })
        editor.mount()
        editor.actions.setNodeToBeAdded(emailAction())
        const insertion = editor.asyncActions.onDrop(undefined, NEW_WORKFLOW.edges[0])
        await started

        expect(workflow.values.saveBlockedReason).toEqual('An email step is still being added. Try again in a moment.')
        await expectLogic(workflow, () => workflow.actions.submitWorkflow()).toDispatchActions([
            'submitWorkflowSuccess',
        ])
        expect(saves).toEqual(0)
        expect(toast).toHaveBeenCalledWith('An email step is still being added. Try again in a moment.')

        finishProvisioning()
        await insertion
        expect(workflow.values.saveBlockedReason).toBeNull()
        expect(workflow.values.workflow.actions.filter((step) => step.type === 'function_email')).toHaveLength(1)
        toast.mockRestore()
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
        editor.actions.setNodeToBeAdded(PALETTE_EMAIL_STEP)
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
