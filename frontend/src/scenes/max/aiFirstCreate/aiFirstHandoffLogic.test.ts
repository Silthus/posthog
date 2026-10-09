import { router } from 'kea-router'
import { expectLogic } from 'kea-test-utils'

import { lemonToast } from 'lib/lemon-ui/LemonToast'
import { removeProjectIdIfPresent } from 'lib/utils/kea-router'
import { MAX_SIDE_PANEL_ID } from 'scenes/max/components/PhaiSidePanelChat'
import { maxMocks } from 'scenes/max/testUtils'

import { sidePanelStateLogic } from '~/layout/navigation-3000/sidepanel/sidePanelStateLogic'
import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'
import { SidePanelTab } from '~/types'

import { composerSeedLogic, runnerPanelLogic, toolStreamEventsLogic } from 'products/posthog_ai/frontend/api/logics'
import type { ToolStreamEvent } from 'products/posthog_ai/frontend/api/types'

import { AiFirstHandoffLogicProps, aiFirstHandoffLogic } from './aiFirstHandoffLogic'

const CREATED_ID = '2f1e9c3a-5b7d-4e8f-9a0b-1c2d3e4f5a6b'
const NAME = 'Win back inactive users'

function createEvent(overrides: Partial<ToolStreamEvent>): ToolStreamEvent {
    return {
        streamKey: 'draft-1',
        toolCallId: 'call-1',
        toolName: 'things-create',
        rawToolName: 'exec',
        phase: 'completed',
        source: 'live',
        invocation: {
            toolCallId: 'call-1',
            rawServerName: 'posthog',
            rawToolName: 'exec',
            input: { command: `call things-create ${JSON.stringify({ name: NAME })}` },
            // Large creates come back as a "saved to file" notice, so the id never rides the output.
            output: { content: 'Error: result exceeds maximum allowed tokens.', isError: false },
            status: 'completed',
            contentBlocks: [],
        },
        ...overrides,
    }
}

describe('aiFirstHandoffLogic', () => {
    let logic: ReturnType<typeof aiFirstHandoffLogic.build>
    let findCreatedId: jest.Mock<Promise<string | null>, [Record<string, unknown> | undefined]>

    const handoff = (): AiFirstHandoffLogicProps => ({
        toolName: 'things-create',
        findCreatedId,
        urlFor: (id) => `/things/${id}`,
        notOpenedMessage: 'Your thing was created, but it could not be opened.',
        eventPrefix: 'thing ai composer',
        createdEvent: 'thing ai composer created thing',
        createdIdProperty: 'thing_id',
    })

    beforeEach(() => {
        useMocks(maxMocks)
        initKeaTests()
        findCreatedId = jest.fn(async (innerInput) => (innerInput?.name === NAME ? CREATED_ID : null))
        sidePanelStateLogic.mount()
        sidePanelStateLogic.actions.setSidePanelAvailable(true)
        router.actions.push('/things/new', {}, {})
        logic = aiFirstHandoffLogic(handoff())
        logic.mount()
        runnerPanelLogic({ panelId: MAX_SIDE_PANEL_ID }).actions.setActiveCreation({ streamKey: 'draft-1' })
    })

    afterEach(() => {
        logic?.unmount()
    })

    // Otherwise the composer and the side panel show the same empty chat side by side.
    it('closes an open PostHog AI panel when the composer is shown', async () => {
        sidePanelStateLogic.actions.openSidePanel(SidePanelTab.Max)

        await expectLogic(logic, () => {
            logic.actions.composerShown()
        }).toFinishAllListeners()

        expect(sidePanelStateLogic.values.sidePanelOpen).toBe(false)
    })

    // The composer is the panel's own instance, so an unsent panel prompt would show here. An empty seed clears it.
    it('empties the shared composer when the composer is shown', async () => {
        const seeds = composerSeedLogic({ panelId: MAX_SIDE_PANEL_ID })
        seeds.mount()

        await expectLogic(logic, () => {
            logic.actions.composerShown()
        }).toFinishAllListeners()

        expect(seeds.values.seed).toEqual({ prompt: '', autoSubmit: false })

        seeds.unmount()
    })

    // The exec path keeps the created record on the result's metadata. Names are not unique, so a record's id
    // wins over the name lookup, which only covers a truncated output.
    it.each([
        {
            name: 'the id on the output record',
            output: {
                content: [{ type: 'text', text: 'Created' }],
                _meta: { 'com.posthog.mcp/app_data': { id: CREATED_ID, name: NAME } },
            },
            lookups: 0,
        },
        {
            name: 'a name lookup when the output carries no record',
            output: { content: 'Error: result exceeds maximum allowed tokens.', isError: false },
            lookups: 1,
        },
    ])('opens the side panel and routes to the entity by $name', async ({ output, lookups }) => {
        await expectLogic(logic, () => {
            toolStreamEventsLogic.actions.emitToolEvent(
                createEvent({ invocation: { ...createEvent({}).invocation, output } })
            )
        }).toFinishAllListeners()

        expect(findCreatedId).toHaveBeenCalledTimes(lookups)
        expect(sidePanelStateLogic.values.selectedTab).toBe(SidePanelTab.Max)
        expect(sidePanelStateLogic.values.sidePanelOpen).toBe(true)
        expect(removeProjectIdIfPresent(router.values.location.pathname)).toBe(`/things/${CREATED_ID}`)
    })

    // The entity is already saved, so a lookup that fails or matches nothing must say where it went.
    it.each([
        { name: 'the lookup fails', finder: () => Promise.reject(new Error('boom')) },
        { name: 'nothing matches', finder: () => Promise.resolve(null) },
        {
            name: 'the create call sent no name',
            overrides: { invocation: { input: { command: 'call things-create {}' } } },
        },
    ])('says the entity could not be opened when $name', async ({ finder, overrides }) => {
        if (finder) {
            findCreatedId.mockImplementation(finder)
        }
        const toast = jest.spyOn(lemonToast, 'error')

        await expectLogic(logic, () => {
            toolStreamEventsLogic.actions.emitToolEvent(
                createEvent(overrides ? { invocation: { ...createEvent({}).invocation, ...overrides.invocation } } : {})
            )
        }).toFinishAllListeners()

        expect(toast).toHaveBeenCalledWith('Your thing was created, but it could not be opened.')
        expect(sidePanelStateLogic.values.sidePanelOpen).toBe(false)
        expect(removeProjectIdIfPresent(router.values.location.pathname)).toBe('/things/new')

        toast.mockRestore()
    })

    // The panel logic outlives this page, so the lookup's continuation must not route from a page left behind.
    it('does not route once the page is left during the lookup', async () => {
        const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
        const panel = runnerPanelLogic({ panelId: MAX_SIDE_PANEL_ID })
        panel.mount()
        let resolveFinder: (id: string | null) => void = () => {}
        findCreatedId.mockImplementation(() => new Promise((resolve) => (resolveFinder = resolve)))

        toolStreamEventsLogic.actions.emitToolEvent(createEvent({}))
        await flush()
        logic.unmount()
        resolveFinder(CREATED_ID)
        await flush()

        expect(sidePanelStateLogic.values.sidePanelOpen).toBe(false)
        expect(removeProjectIdIfPresent(router.values.location.pathname)).toBe('/things/new')

        panel.unmount()
    })

    it.each([false, true])(
        'opens the current creation while a previous preparation is pending (fails %s)',
        async (fails) => {
            logic.unmount()
            let completeFirst: () => void = () => {}
            let markStarted: () => void = () => {}
            const started = new Promise<void>((resolve) => {
                markStarted = resolve
            })
            const prepared: string[] = []
            const toast = jest.spyOn(lemonToast, 'error')
            logic = aiFirstHandoffLogic({
                ...handoff(),
                prepareCreated: async (id) => {
                    prepared.push(id)
                    if (id === CREATED_ID) {
                        await new Promise<void>((resolve, reject) => {
                            completeFirst = () => (fails ? reject(new Error('Old creation failed')) : resolve())
                            markStarted()
                        })
                    }
                },
            })
            logic.mount()
            const panel = runnerPanelLogic({ panelId: MAX_SIDE_PANEL_ID })
            const eventFor = (streamKey: string, id: string): ToolStreamEvent =>
                createEvent({
                    streamKey,
                    invocation: {
                        ...createEvent({}).invocation,
                        output: {
                            content: [],
                            _meta: { 'com.posthog.mcp/app_data': { id } },
                        },
                    },
                })
            panel.actions.setActiveCreation({ streamKey: 'draft-1' })
            toolStreamEventsLogic.actions.emitToolEvent(eventFor('draft-1', CREATED_ID))
            await started
            panel.actions.setActiveCreation({ streamKey: 'draft-2' })
            toolStreamEventsLogic.actions.emitToolEvent(eventFor('draft-2', 'second-created'))
            completeFirst()
            await expectLogic(logic).toFinishAllListeners()
            expect(prepared).toEqual([CREATED_ID, 'second-created'])
            expect(removeProjectIdIfPresent(router.values.location.pathname)).toBe('/things/second-created')
            expect(toast).not.toHaveBeenCalled()
            toast.mockRestore()
        }
    )

    // The bus is global: a replay, another run's create, or a still-streaming call must not move the user.
    it.each([
        { name: 'a replayed event', overrides: { source: 'replay' as const } },
        { name: 'another stream', overrides: { streamKey: 'other-run' } },
        { name: 'an unfinished call', overrides: { phase: 'started' as const } },
        { name: 'a different tool', overrides: { toolName: 'things-get' } },
    ])('ignores $name', async ({ overrides }) => {
        await expectLogic(logic, () => {
            toolStreamEventsLogic.actions.emitToolEvent(createEvent(overrides))
        }).toFinishAllListeners()

        expect(findCreatedId).not.toHaveBeenCalled()
        expect(sidePanelStateLogic.values.sidePanelOpen).toBe(false)
        expect(removeProjectIdIfPresent(router.values.location.pathname)).toBe('/things/new')
    })
})
