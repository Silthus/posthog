import { MOCK_TEAM_ID } from 'lib/api.mock'

import { router } from 'kea-router'

import { commandLogic } from 'lib/components/Command/commandLogic'

import { initKeaTests } from '~/test/init'

import { osWindowsLogic } from '../windows/osWindowsLogic'
import { osBridgeLogic } from './osBridgeLogic'
import { OS_BRIDGE_CHANNEL, OS_BRIDGE_VERSION, OsBridgeMessage } from './osBridgeProtocol'
import { osFrameName } from './osFrame'

const INSIGHTS = `/project/${MOCK_TEAM_ID}/insights`
const REPLAY = `/project/${MOCK_TEAM_ID}/replay/home`

describe('osBridgeLogic', () => {
    let windows: ReturnType<typeof osWindowsLogic.build>
    let bridge: ReturnType<typeof osBridgeLogic.build>
    let frame: HTMLIFrameElement

    function send(
        message: OsBridgeMessage,
        { origin = window.location.origin, source = frame.contentWindow } = {}
    ): void {
        window.dispatchEvent(
            new MessageEvent('message', {
                data: { channel: OS_BRIDGE_CHANNEL, version: OS_BRIDGE_VERSION, ...message },
                origin,
                source,
            })
        )
    }

    function pathsOf(): string[] {
        return windows.values.windows.map((w) => w.path)
    }

    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        initKeaTests(true)
        router.actions.push(INSIGHTS)
        windows = osWindowsLogic()
        windows.mount()
        bridge = osBridgeLogic()
        bridge.mount()
        frame = document.createElement('iframe')
        frame.name = osFrameName(windows.values.windows[0].id)
        document.body.appendChild(frame)
    })

    afterEach(() => {
        frame.remove()
        bridge.unmount()
        windows.unmount()
    })

    it('moves the window and its title when the framed app reports a new page', () => {
        send({ type: 'location', path: REPLAY, title: 'Replay', traversed: false })

        expect(windows.values.windows).toEqual([expect.objectContaining({ path: REPLAY, title: 'Replay' })])
    })

    test.each([
        ['another origin', { origin: 'https://evil.example.com' }],
        ['a window that is not an OS window frame', { source: window }],
    ])('ignores a message from %s', (_description, sender) => {
        send({ type: 'location', path: REPLAY, title: 'Replay', traversed: false }, sender as any)

        expect(pathsOf()).toEqual([INSIGHTS])
    })

    it('opens a Cmd+clicked link in a new window, even when a window already shows it', () => {
        send({ type: 'open-window', path: INSIGHTS })

        expect(pathsOf()).toEqual([INSIGHTS, INSIGHTS])
    })

    it('opens PostHog AI in a window when the framed app asks for its side panel', () => {
        send({ type: 'side-panel', tab: 'max', options: '!why did signups drop' })

        expect(windows.values.focusedWindow?.path).toBe(`/project/${MOCK_TEAM_ID}/ai?ask=why%20did%20signups%20drop`)
    })

    it('runs a window shortcut on the window whose frame had keyboard focus', () => {
        const senderId = windows.values.windows[0].id
        windows.actions.openWindow(REPLAY)

        send({ type: 'window-command', command: 'minimize' })

        expect(windows.values.windows.find((w) => w.id === senderId)?.minimized).toBe(true)
        expect(windows.values.focusedWindow?.path).toBe(REPLAY)
    })

    it('opens the spotlight when the framed app asks for search', () => {
        commandLogic.mount()

        send({ type: 'spotlight' })

        expect(commandLogic.values.isCommandOpen).toBe(true)
    })
})
