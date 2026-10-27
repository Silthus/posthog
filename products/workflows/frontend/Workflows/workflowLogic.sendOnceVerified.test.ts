import { expectLogic } from 'kea-test-utils'

import { FEATURE_FLAGS } from 'lib/constants'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { HogFlow } from './hogflows/types'
import { workflowLogic } from './workflowLogic'

const WORKFLOW_ID = 'wf-send-once-verified-1'
const UNVERIFIED_SENDER = { id: 7, domain: 'example.com' }
const WEBHOOK_TEMPLATE = { id: 'template-webhook', inputs_schema: [{ key: 'url', type: 'string', templating: true }] }

const makeWorkflow = (overrides: Partial<HogFlow> = {}): HogFlow => ({
    id: WORKFLOW_ID,
    name: 'Welcome',
    actions: [
        {
            id: 'trigger_node',
            type: 'trigger',
            name: 'Trigger',
            description: '',
            created_at: 0,
            updated_at: 0,
            config: {
                type: 'event',
                filters: { events: [{ id: '$pageview', name: '$pageview', type: 'events', order: 0 }] },
            },
        },
        {
            id: 'exit_node',
            type: 'exit',
            name: 'Exit',
            description: '',
            created_at: 0,
            updated_at: 0,
            config: { reason: 'Default exit' },
        },
    ],
    edges: [{ from: 'trigger_node', to: 'exit_node', type: 'continue' }],
    conversion: { filters: [] },
    exit_condition: 'exit_only_at_end',
    version: 1,
    status: 'draft',
    team_id: 1,
    trigger: { type: 'event', filters: {} } as HogFlow['trigger'],
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    unverified_email_senders: [],
    ...overrides,
})

async function waitForHeldReads(heldReads: unknown[], count: number): Promise<void> {
    while (heldReads.length < count) {
        await new Promise((resolve) => setImmediate(resolve))
    }
}

describe('workflowLogic send once verified', () => {
    let logic: ReturnType<typeof workflowLogic.build>
    let patchBodies: Record<string, any>[]
    let storedWorkflow: HogFlow
    let retrieveCount: number

    const mountWith = async (workflow: HogFlow, { flagOn = true }: { flagOn?: boolean } = {}): Promise<void> => {
        storedWorkflow = workflow
        initKeaTests()
        featureFlagLogic.mount()
        featureFlagLogic.actions.setFeatureFlags([], { [FEATURE_FLAGS.WORKFLOWS_EMAIL_DOMAIN_WIZARD]: flagOn })
        logic = workflowLogic({ id: WORKFLOW_ID })
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadWorkflowSuccess'])
    }

    beforeEach(() => {
        patchBodies = []
        retrieveCount = 0
        localStorage.clear()
        useMocks({
            get: {
                '/api/environments/:team_id/hog_flows/:id/': () => {
                    retrieveCount += 1
                    return [200, storedWorkflow]
                },
                '/api/projects/:team_id/hog_function_templates/': { results: [WEBHOOK_TEMPLATE], count: 1 },
            },
            patch: {
                '/api/environments/:team_id/hog_flows/:id/': async ({ request }) => {
                    patchBodies.push((await request.json()) as Record<string, any>)
                    return [200, { ...storedWorkflow, status: 'waiting_for_domain', enable_requested_at: '2026-05-02' }]
                },
            },
        })
    })

    afterEach(() => {
        logic?.unmount()
        jest.useRealTimers()
    })

    it('asks before enabling a workflow with an unverified sender, naming the domain', async () => {
        await mountWith(makeWorkflow({ unverified_email_senders: [UNVERIFIED_SENDER] }))

        await expectLogic(logic, () => {
            logic.actions.enableWorkflow()
        })
            .toDispatchActions(['openEnablePrompt'])
            .toNotHaveDispatchedActions(['saveWorkflow'])
            .toMatchValues({ enablePromptDomains: ['example.com'] })
        expect(patchBodies).toEqual([])
    })

    it('saves the usual active status once the person confirms, and shows the waiting status', async () => {
        await mountWith(makeWorkflow({ unverified_email_senders: [UNVERIFIED_SENDER] }))
        await expectLogic(logic, () => {
            logic.actions.enableWorkflow()
        }).toDispatchActions(['openEnablePrompt'])

        await expectLogic(logic, () => {
            logic.actions.confirmEnablePrompt()
        })
            .toDispatchActions(['saveWorkflowSuccess'])
            .toMatchValues({ enablePromptDomains: null })
        expect(patchBodies.map((body) => body.status)).toEqual(['active'])
        expect(logic.values.originalWorkflow?.status).toEqual('waiting_for_domain')
    })

    it.each([
        ['succeeds', 200, 'saveWorkflowSuccess'],
        ['fails', 500, 'saveWorkflowFailure'],
    ])('keeps the prompt open and loading until the enable save %s', async (_name, responseCode, settledAction) => {
        await mountWith(makeWorkflow({ unverified_email_senders: [UNVERIFIED_SENDER] }))
        let releaseSave!: () => void
        const saveReleased = new Promise<void>((resolve) => {
            releaseSave = resolve
        })
        useMocks({
            patch: {
                '/api/environments/:team_id/hog_flows/:id/': async ({ request }) => {
                    patchBodies.push((await request.json()) as Record<string, any>)
                    await saveReleased
                    return [responseCode, { ...storedWorkflow, status: 'waiting_for_domain' }]
                },
            },
        })
        await expectLogic(logic, () => {
            logic.actions.enableWorkflow()
        }).toDispatchActions(['openEnablePrompt'])

        await expectLogic(logic, () => {
            logic.actions.confirmEnablePrompt()
        })
            .toDispatchActions(['saveWorkflow'])
            .toMatchValues({ enablePromptDomains: ['example.com'], workflowLoading: true })

        releaseSave()
        await expectLogic(logic)
            .toDispatchActions([settledAction])
            .toMatchValues({ enablePromptDomains: null, workflowLoading: false })
        expect(patchBodies.map((body) => body.status)).toEqual(['active'])
    })

    it('leaves the workflow off when the person cancels', async () => {
        await mountWith(makeWorkflow({ unverified_email_senders: [UNVERIFIED_SENDER] }))
        await expectLogic(logic, () => {
            logic.actions.enableWorkflow()
        }).toDispatchActions(['openEnablePrompt'])

        await expectLogic(logic, () => {
            logic.actions.cancelEnablePrompt()
        })
            .toDispatchActions(['cancelEnablePrompt'])
            .toNotHaveDispatchedActions(['saveWorkflow'])
            .toMatchValues({ enablePromptDomains: null })
        expect(patchBodies).toEqual([])
        expect(logic.values.originalWorkflow?.status).toEqual('draft')
    })

    it.each([
        ['the flag is off', [UNVERIFIED_SENDER], false],
        ['every sender is verified', [], true],
    ])('enables without asking when %s', async (_name, senders, flagOn) => {
        await mountWith(makeWorkflow({ unverified_email_senders: senders }), { flagOn })

        await expectLogic(logic, () => {
            logic.actions.enableWorkflow()
        })
            .toDispatchActions(['saveWorkflowSuccess'])
            .toMatchValues({ enablePromptDomains: null })
        expect(patchBodies.map((body) => body.status)).toEqual(['active'])
    })

    it('enables without asking when the domain verified after the page loaded', async () => {
        await mountWith(makeWorkflow({ unverified_email_senders: [UNVERIFIED_SENDER] }))
        storedWorkflow = makeWorkflow({ unverified_email_senders: [] })

        await expectLogic(logic, () => {
            logic.actions.enableWorkflow()
        })
            .toDispatchActions(['saveWorkflowSuccess'])
            .toNotHaveDispatchedActions(['openEnablePrompt'])
        expect(patchBodies.map((body) => body.status)).toEqual(['active'])
    })

    it('acts only on the last Enable click when the domain read of an earlier one lands late', async () => {
        await mountWith(makeWorkflow({ unverified_email_senders: [UNVERIFIED_SENDER] }))
        const heldReads: (() => void)[] = []
        useMocks({
            get: {
                '/api/environments/:team_id/hog_flows/:id/': async () => {
                    await new Promise<void>((resolve) => heldReads.push(resolve))
                    return [200, storedWorkflow]
                },
            },
        })
        logic.actions.enableWorkflow()
        logic.actions.enableWorkflow()
        await waitForHeldReads(heldReads, 2)

        heldReads[0]()
        await new Promise((resolve) => setImmediate(resolve))
        expect(logic.values.enablePromptOpen).toBe(false)

        heldReads[1]()
        await expectLogic(logic).toDispatchActions(['openEnablePrompt'])
        expect(logic.values.enablePromptDomains).toEqual(['example.com'])
        expect(patchBodies).toEqual([])
    })

    it('shows the started sending notice once after a waited go-live, until it is dismissed', async () => {
        const wentLive = makeWorkflow({
            status: 'active',
            enable_requested_at: '2026-05-02T10:00:00Z',
            went_live_at: '2026-05-03T08:30:00Z',
        })
        await mountWith(wentLive)
        expect(logic.values.showStartedSendingNotice).toBe(true)

        logic.actions.dismissStartedSendingNotice()
        expect(logic.values.showStartedSendingNotice).toBe(false)

        logic.unmount()
        await mountWith(wentLive)
        expect(logic.values.showStartedSendingNotice).toBe(false)

        logic.unmount()
        await mountWith({ ...wentLive, went_live_at: '2026-05-09T08:30:00Z' })
        expect(logic.values.showStartedSendingNotice).toBe(true)
    })

    it.each([
        [
            'a direct enable',
            { status: 'active', enable_requested_at: '2026-05-02T10:00:00Z', went_live_at: '2026-05-02T10:00:00Z' },
        ],
        ['a workflow still waiting', { status: 'waiting_for_domain', enable_requested_at: '2026-05-02T10:00:00Z' }],
        [
            'a workflow whose email sending is paused',
            {
                status: 'active',
                enable_requested_at: '2026-05-02T10:00:00Z',
                went_live_at: '2026-05-03T08:30:00Z',
                email_sending_paused_at: '2026-05-01T09:00:00Z',
            },
        ],
        [
            'a workflow turned off after it went live',
            { status: 'draft', enable_requested_at: '2026-05-02T10:00:00Z', went_live_at: '2026-05-03T08:30:00Z' },
        ],
    ] as [string, Partial<HogFlow>][])('shows no started sending notice for %s', async (_name, overrides) => {
        await mountWith(makeWorkflow(overrides))

        expect(logic.values.showStartedSendingNotice).toBe(false)
    })

    it('shows no started sending notice with the flag off', async () => {
        await mountWith(
            makeWorkflow({
                status: 'active',
                enable_requested_at: '2026-05-02T10:00:00Z',
                went_live_at: '2026-05-03T08:30:00Z',
            }),
            { flagOn: false }
        )

        expect(logic.values.showStartedSendingNotice).toBe(false)
    })

    describe('while the workflow waits for its domain', () => {
        const waiting = makeWorkflow({
            status: 'waiting_for_domain',
            enable_requested_at: '2026-05-02T10:00:00Z',
            unverified_email_senders: [UNVERIFIED_SENDER],
        })
        const wentLiveLifecycle: Partial<HogFlow> = {
            status: 'active',
            went_live_at: '2026-05-03T08:30:00Z',
            updated_at: '2026-05-03T08:30:00Z',
            unverified_email_senders: [],
        }
        const wentLive: HogFlow = { ...waiting, ...wentLiveLifecycle }
        const [trigger, exit] = waiting.actions
        const waitingWithWebhook = makeWorkflow({
            ...waiting,
            actions: [
                trigger,
                {
                    id: 'webhook_node',
                    type: 'function',
                    name: 'Webhook',
                    description: '',
                    created_at: 0,
                    updated_at: 0,
                    config: {
                        template_id: WEBHOOK_TEMPLATE.id,
                        inputs: { url: { value: 'https://example.com/hook', bytecode: ['_H', 1], order: 0 } },
                    },
                },
                exit,
            ] as HogFlow['actions'],
        })

        const mountWaiting = async (): Promise<void> => {
            jest.useFakeTimers({ advanceTimers: true })
            await mountWith(waiting)
            retrieveCount = 0
        }

        it('shows the workflow going live without a reload, keeps unsaved edits, and stops checking', async () => {
            await mountWaiting()
            logic.actions.setAutoSaveEnabled(false)
            logic.actions.setWorkflowValue('name', 'Renamed while waiting')
            storedWorkflow = wentLive

            await jest.advanceTimersByTimeAsync(10_000)
            await expectLogic(logic).toFinishAllListeners()

            expect(logic.values.originalWorkflow?.status).toEqual('active')
            expect(logic.values.showStartedSendingNotice).toBe(true)
            expect(logic.values.workflow.name).toEqual('Renamed while waiting')
            expect(logic.values.hasUnsavedChanges).toBe(true)

            await jest.advanceTimersByTimeAsync(60_000)
            expect(retrieveCount).toEqual(1)
        })

        it('stages later edits as a draft of the live copy, without a conflict', async () => {
            useMocks({
                patch: {
                    '/api/environments/:team_id/hog_flows/:id/': async ({ request }) => {
                        patchBodies.push((await request.json()) as Record<string, any>)
                        return [200, storedWorkflow]
                    },
                },
            })
            await mountWaiting()
            logic.actions.setAutoSaveEnabled(false)
            storedWorkflow = wentLive
            await jest.advanceTimersByTimeAsync(10_000)
            await expectLogic(logic).toFinishAllListeners()

            logic.actions.setWorkflowValue('exit_condition', 'exit_on_conversion')
            await expectLogic(logic, () => {
                logic.actions.submitWorkflow()
            }).toDispatchActions(['saveWorkflowSuccess'])

            expect(patchBodies).toEqual([
                expect.objectContaining({
                    exit_condition: 'exit_on_conversion',
                    stage_draft: true,
                    base_updated_at: wentLive.updated_at,
                }),
            ])
        })

        it.each<{ name: string; workflow: HogFlow }>([
            { name: 'a workflow without function steps', workflow: waiting },
            { name: 'a workflow with a function step', workflow: waitingWithWebhook },
        ])('keeps an edit whose auto-save lands after the workflow went live, for $name', async ({ workflow }) => {
            useMocks({
                patch: {
                    '/api/environments/:team_id/hog_flows/:id/': async ({ request }) => {
                        const body = (await request.json()) as Record<string, any>
                        patchBodies.push(body)
                        if (body.base_updated_at !== storedWorkflow.updated_at) {
                            return [409, { detail: 'stale_update', code: 'stale_update' }]
                        }
                        storedWorkflow = { ...storedWorkflow, name: body.name, updated_at: '2026-05-03T09:00:00Z' }
                        return [200, storedWorkflow]
                    },
                },
            })
            jest.useFakeTimers({ advanceTimers: true })
            await mountWith(workflow)
            await expectLogic(logic).toFinishAllListeners()
            expect(logic.values.hogFunctionTemplatesById).toHaveProperty(WEBHOOK_TEMPLATE.id)
            storedWorkflow = { ...workflow, ...wentLiveLifecycle }

            logic.actions.setWorkflowValue('name', 'Renamed while waiting')
            await jest.advanceTimersByTimeAsync(3_000)
            await expectLogic(logic).toFinishAllListeners()

            expect(logic.values.originalWorkflow?.status).toEqual('active')
            expect(logic.values.workflow.name).toEqual('Renamed while waiting')
            expect(storedWorkflow).toMatchObject({ status: 'active', name: 'Renamed while waiting' })
            expect(patchBodies.at(-1)).not.toHaveProperty('status')
        })

        it('does not save over an edit made elsewhere when the auto-save meets the go-live', async () => {
            useMocks({
                patch: {
                    '/api/environments/:team_id/hog_flows/:id/': async ({ request }) => {
                        patchBodies.push((await request.json()) as Record<string, any>)
                        return [409, { detail: 'stale_update', code: 'stale_update' }]
                    },
                },
            })
            await mountWaiting()
            storedWorkflow = { ...wentLive, name: 'Renamed elsewhere', updated_at: '2026-05-03T08:45:00Z' }

            logic.actions.setWorkflowValue('name', 'Renamed while waiting')
            await jest.advanceTimersByTimeAsync(3_000)
            await expectLogic(logic).toFinishAllListeners()

            expect(patchBodies).toHaveLength(1)
            expect(logic.values.workflow.name).toEqual('Renamed elsewhere')
        })

        it('stages a content edit queued while the auto-save takes the go-live', async () => {
            await mountWaiting()
            let releaseFetch!: () => void
            const fetchHeld = new Promise<void>((resolve) => {
                releaseFetch = resolve
            })
            useMocks({
                get: {
                    '/api/environments/:team_id/hog_flows/:id/': async () => {
                        await fetchHeld
                        return [200, storedWorkflow]
                    },
                },
                patch: {
                    '/api/environments/:team_id/hog_flows/:id/': async ({ request }) => {
                        const body = (await request.json()) as Record<string, any>
                        patchBodies.push(body)
                        if (body.base_updated_at !== storedWorkflow.updated_at) {
                            return [409, { detail: 'stale_update', code: 'stale_update' }]
                        }
                        storedWorkflow = { ...storedWorkflow, name: body.name, updated_at: '2026-05-03T09:00:00Z' }
                        return [200, storedWorkflow]
                    },
                },
            })
            storedWorkflow = wentLive

            logic.actions.setWorkflowValue('name', 'Renamed while waiting')
            await jest.advanceTimersByTimeAsync(3_000)
            logic.actions.setWorkflowValue('exit_condition', 'exit_on_conversion')
            await jest.advanceTimersByTimeAsync(3_000)
            await expectLogic(logic, releaseFetch).toDispatchActions(['saveWorkflowSuccess', 'saveWorkflowSuccess'])

            expect(patchBodies.at(-1)).toMatchObject({ exit_condition: 'exit_on_conversion', stage_draft: true })
        })

        it('drops a status answer that lands after the editor closed', async () => {
            await mountWaiting()
            let releaseCheck!: () => void
            const checkReleased = new Promise<void>((resolve) => {
                releaseCheck = resolve
            })
            useMocks({
                get: {
                    '/api/environments/:team_id/hog_flows/:id/': async () => {
                        retrieveCount += 1
                        await checkReleased
                        return [200, wentLive]
                    },
                },
            })
            await jest.advanceTimersByTimeAsync(10_000)
            expect(retrieveCount).toEqual(1)

            logic.unmount()
            releaseCheck()
            await jest.advanceTimersByTimeAsync(0)
            await new Promise((resolve) => setImmediate(resolve))
        })

        it('checks only while the tab is visible, and checks at once when it shows again', async () => {
            let hidden = true
            const hiddenSpy = jest.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
            try {
                await mountWaiting()
                document.dispatchEvent(new Event('visibilitychange'))

                await jest.advanceTimersByTimeAsync(60_000)
                expect(retrieveCount).toEqual(0)

                storedWorkflow = wentLive
                hidden = false
                document.dispatchEvent(new Event('visibilitychange'))
                await jest.advanceTimersByTimeAsync(0)
                await expectLogic(logic).toFinishAllListeners()

                expect(retrieveCount).toEqual(1)
                expect(logic.values.originalWorkflow?.status).toEqual('active')
                expect(logic.values.hasUnsavedChanges).toBe(false)
            } finally {
                hiddenSpy.mockRestore()
            }
        })
    })
})
