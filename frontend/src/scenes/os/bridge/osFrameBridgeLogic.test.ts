import { MOCK_TEAM_ID } from 'lib/api.mock'

import { router } from 'kea-router'

import { commandLogic } from 'lib/components/Command/commandLogic'
import { newInternalTab } from 'lib/utils/newInternalTab'

import { sidePanelStateLogic } from '~/layout/navigation-3000/sidepanel/sidePanelStateLogic'
import { initKeaTests } from '~/test/init'
import { SidePanelTab } from '~/types'

import { OsBridgeMessage } from './osBridgeProtocol'
import { osFrameBridgeLogic } from './osFrameBridgeLogic'

const INSIGHTS = `/project/${MOCK_TEAM_ID}/insights`
const REPLAY = `/project/${MOCK_TEAM_ID}/replay/home`

describe('osFrameBridgeLogic', () => {
    let logic: ReturnType<typeof osFrameBridgeLogic.build>
    let sent: OsBridgeMessage[]
    let anchor: HTMLAnchorElement

    function sentOfType<T extends OsBridgeMessage['type']>(type: T): Extract<OsBridgeMessage, { type: T }>[] {
        return sent.filter((m): m is Extract<OsBridgeMessage, { type: T }> => m.type === type)
    }

    function clickAnchor(init: MouseEventInit, type: 'click' | 'auxclick' = 'click'): MouseEvent {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
        anchor.dispatchEvent(event)
        return event
    }

    beforeEach(() => {
        initKeaTests(true)
        router.actions.push(INSIGHTS)
        sent = []
        jest.spyOn(window.parent, 'postMessage').mockImplementation((data: any) => {
            const { channel: _channel, version: _version, ...message } = data
            sent.push(message)
        })
        anchor = document.createElement('a')
        anchor.href = REPLAY
        anchor.textContent = 'Replay'
        // Without this the jsdom click would try to navigate the test page.
        anchor.addEventListener('click', (event) => event.preventDefault())
        document.body.appendChild(anchor)
        document.title = 'Insights • Product analytics • PostHog'
        logic = osFrameBridgeLogic()
        logic.mount()
    })

    afterEach(() => {
        logic.unmount()
        anchor.remove()
        jest.restoreAllMocks()
    })

    it('reports the page and its title on mount, on navigation and on back or forward', () => {
        router.actions.push(REPLAY)
        router.actions.replace(INSIGHTS)
        // The test router's location does not follow its history, so the back is dispatched directly.
        router.actions.locationChanged({
            method: 'POP',
            pathname: INSIGHTS,
            search: '',
            searchParams: {},
            hash: '',
            hashParams: {},
            initial: false,
            url: INSIGHTS,
        })

        expect(sentOfType('location')).toEqual([
            { type: 'location', path: INSIGHTS, title: 'Insights', traversed: false },
            { type: 'location', path: REPLAY, title: 'Insights', traversed: false },
            { type: 'location', path: INSIGHTS, title: 'Insights', traversed: false },
            { type: 'location', path: INSIGHTS, title: 'Insights', traversed: true },
        ])
    })

    test.each([
        ['a Cmd+click', 'click', { metaKey: true }],
        ['a Ctrl+click', 'click', { ctrlKey: true }],
        ['a middle click', 'auxclick', { button: 1 }],
    ] as const)('opens %s on an in-app link in a new window', (_description, type, init) => {
        const event = clickAnchor(init, type)

        expect(sentOfType('open-window')).toEqual([{ type: 'open-window', path: REPLAY }])
        expect(event.defaultPrevented).toBe(true)
    })

    it('leaves a plain click on an in-app link to the app', () => {
        clickAnchor({})

        expect(sentOfType('open-window')).toEqual([])
    })

    it('opens an "open in new tab" action in a new window', () => {
        newInternalTab('/replay/home')

        expect(sentOfType('open-window')).toEqual([{ type: 'open-window', path: REPLAY }])
    })

    it('forwards a window shortcut to the OS', () => {
        const event = new KeyboardEvent('keydown', {
            code: 'ArrowLeft',
            altKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        })
        document.body.dispatchEvent(event)

        expect(sentOfType('window-command')).toEqual([{ type: 'window-command', command: 'snap-left' }])
        expect(event.defaultPrevented).toBe(true)
    })

    it('asks the OS for a side panel, but opens support in the window', () => {
        sidePanelStateLogic.actions.openSidePanel(SidePanelTab.Max, '!why did signups drop')
        sidePanelStateLogic.actions.openSidePanel(SidePanelTab.Support, 'bug:analytics')

        expect(sentOfType('side-panel')).toEqual([
            { type: 'side-panel', tab: SidePanelTab.Max, options: '!why did signups drop' },
        ])
    })

    it('opens the OS spotlight in place of the command menu', () => {
        commandLogic.actions.toggleCommand('keyboard-shortcut')

        expect(sentOfType('spotlight')).toEqual([{ type: 'spotlight' }])
        expect(commandLogic.values.isCommandOpen).toBe(false)
    })
})
