import { expectLogic } from 'kea-test-utils'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { HogFlow } from './hogflows/types'
import { workflowLogic } from './workflowLogic'

const WORKFLOW_ID = 'wf-send-once-verified-1'
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
    ...overrides,
})

describe('workflowLogic send once verified', () => {
    let logic: ReturnType<typeof workflowLogic.build>
    let patchBodies: Record<string, any>[]
    let storedWorkflow: HogFlow
    let retrieveCount: number

    const mountWith = async (workflow: HogFlow): Promise<void> => {
        storedWorkflow = workflow
        initKeaTests()
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

    describe('while the workflow waits for its domain', () => {
        const waiting = makeWorkflow({
            status: 'waiting_for_domain',
            enable_requested_at: '2026-05-02T10:00:00Z',
        })
        const wentLiveLifecycle: Partial<HogFlow> = {
            status: 'active',
            went_live_at: '2026-05-03T08:30:00Z',
            updated_at: '2026-05-03T08:30:00Z',
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
            await expectLogic(logic).toDispatchActions(['loadHogFunctionTemplatesByIdSuccess'])
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
