import { postToOs } from './osBridgeProtocol'
import { osLinkTarget } from './osFrameRouting'

// Kept free of logic and scene imports, because app-wide helpers such as `newInternalTab` import it.
let connectedWindow: Window | null = null

/** Called by `osFrameBridgeLogic` while it runs inside an OS window. */
export function setOsFrameConnection(win: Window | null): void {
    connectedWindow = win
}

/**
 * Opens an app path in a new OS window when this page runs inside one. Returns false when the caller must
 * open it the regular way: outside the OS, or for a page that cannot load in a window.
 */
export function openInOsWindow(href: string): boolean {
    if (!connectedWindow) {
        return false
    }
    const target = osLinkTarget(
        {
            href,
            target: '_blank',
            download: false,
            button: 0,
            metaKey: false,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
        },
        connectedWindow.location.href
    )
    if (target?.kind !== 'new-window') {
        return false
    }
    postToOs(connectedWindow, { type: 'open-window', path: target.path })
    return true
}
