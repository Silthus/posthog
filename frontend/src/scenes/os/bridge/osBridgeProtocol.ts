import { OS_WINDOW_SHORTCUT_KEYS, OsWindowCommand } from '../windows/osWindowShortcuts'
import { OS_FRAME_NAME_PREFIX } from './osFrame'

// pinned: a framed app and the OS page can run different builds during a deploy, so both sides must agree
// on these two values. Bump the version for any change a reader of the old version would get wrong.
export const OS_BRIDGE_CHANNEL = 'posthog-os-bridge'
export const OS_BRIDGE_VERSION = 1

/** Messages a framed app sends to the OS page that holds its window. */
export type OsBridgeMessage =
    /** The frame's path or title changed. `traversed` is true for a browser back or forward. */
    | { type: 'location'; path: string; title: string; traversed: boolean }
    /** Open a path in another window, for example after a Cmd+click. */
    | { type: 'open-window'; path: string }
    /** The person clicked into the frame, so its window comes to the front. */
    | { type: 'focus' }
    /** A window shortcut pressed while the frame had keyboard focus. */
    | { type: 'window-command'; command: OsWindowCommand }
    /** A page that refuses to load in a frame, such as a sign-in or checkout page. */
    | { type: 'open-top'; url: string }
    /** The app asked for its side panel, which a window does not have. */
    | { type: 'side-panel'; tab: string; options?: string }
    /** Cmd+K in the frame opens the OS spotlight. */
    | { type: 'spotlight' }

export type OsBridgeEnvelope = OsBridgeMessage & { channel: typeof OS_BRIDGE_CHANNEL; version: number }

const MAX_TEXT_LENGTH = 2000

function text(value: unknown): string | null {
    return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH ? value : null
}

function isOsWindowCommand(value: unknown): value is OsWindowCommand {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(OS_WINDOW_SHORTCUT_KEYS, value)
}

function isHttpUrl(value: string): boolean {
    try {
        const { protocol } = new URL(value)
        return protocol === 'http:' || protocol === 'https:'
    } catch {
        return false
    }
}

/**
 * Reads a message event's data as a bridge message, or returns null. Any page on this origin can post to
 * the OS page, so every field is checked here and nothing else trusts the raw data.
 */
export function parseOsBridgeMessage(data: unknown): OsBridgeMessage | null {
    if (!data || typeof data !== 'object') {
        return null
    }
    const raw = data as Record<string, unknown>
    if (raw.channel !== OS_BRIDGE_CHANNEL || raw.version !== OS_BRIDGE_VERSION) {
        return null
    }
    switch (raw.type) {
        case 'location': {
            const path = text(raw.path)
            const title = text(raw.title)
            return path && title !== null && typeof raw.traversed === 'boolean'
                ? { type: 'location', path, title, traversed: raw.traversed }
                : null
        }
        case 'open-window': {
            const path = text(raw.path)
            return path ? { type: 'open-window', path } : null
        }
        case 'focus':
            return { type: 'focus' }
        case 'window-command':
            return isOsWindowCommand(raw.command) ? { type: 'window-command', command: raw.command } : null
        case 'open-top': {
            const url = text(raw.url)
            return url && isHttpUrl(url) ? { type: 'open-top', url } : null
        }
        case 'side-panel': {
            const tab = text(raw.tab)
            const options = raw.options === undefined ? undefined : text(raw.options)
            if (!tab || options === null) {
                return null
            }
            return options === undefined ? { type: 'side-panel', tab } : { type: 'side-panel', tab, options }
        }
        case 'spotlight':
            return { type: 'spotlight' }
        default:
            return null
    }
}

export interface OsBridgeFrame {
    name: string
    contentWindow: Window | null
}

/**
 * Returns the id of the OS window whose frame sent a message, or null. Only the frame's own window object
 * identifies the sender: the frame name or anything in the data could come from another page.
 */
export function osBridgeSenderWindowId(
    event: { origin: string; source: MessageEventSource | Window | null },
    frames: Iterable<OsBridgeFrame>,
    origin: string
): string | null {
    if (event.origin !== origin || !event.source) {
        return null
    }
    for (const frame of frames) {
        if (frame.contentWindow === event.source && frame.name.startsWith(OS_FRAME_NAME_PREFIX)) {
            return frame.name.slice(OS_FRAME_NAME_PREFIX.length)
        }
    }
    return null
}

/** Sends a message from a framed app to the OS page. Only the OS page on the same origin receives it. */
export function postToOs(win: Window, message: OsBridgeMessage): void {
    const envelope: OsBridgeEnvelope = { ...message, channel: OS_BRIDGE_CHANNEL, version: OS_BRIDGE_VERSION }
    win.parent.postMessage(envelope, win.location.origin)
}
