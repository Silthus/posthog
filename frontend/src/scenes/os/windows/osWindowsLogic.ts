import { MakeLogicType, actions, afterMount, connect, kea, listeners, path, reducers, selectors } from 'kea'
import { router } from 'kea-router'

import { removeProjectIdIfPresent } from 'lib/utils/kea-router'
import { teamLogic } from 'scenes/teamLogic'
import { urls } from 'scenes/urls'

import { osFrameSrc } from '../bridge/osFrame'
import {
    OsBounds,
    OsPoint,
    OsSize,
    OsSnapSide,
    clampBounds,
    maximizedBounds,
    placeNewWindow,
    snappedBounds,
    tidyLayout,
} from './osWindowGeometry'
import { OsWindowCommand } from './osWindowShortcuts'

export interface OsWindowState {
    id: string
    /** The window's regular app path with search and hash, always same-origin (see `osFrameSrc`). */
    path: string
    title: string
    bounds: OsBounds
    zIndex: number
    minimized: boolean
    maximized: boolean
    /** The bounds to go back to after a maximize or a snap. */
    restoreBounds: OsBounds | null
}

export interface OsOpenWindowOptions {
    newWindow?: boolean
    title?: string
    /** The desktop point the window zooms open from, for example the icon that opened it. */
    origin?: OsPoint
}

export interface OsDesktopState {
    windows: OsWindowState[]
    desktop: OsSize
}

export const OS_WINDOW_DEFAULT_TITLE = 'PostHog'

// pinned: localStorage key prefix, renaming it drops every saved desktop layout
const STORAGE_KEY_PREFIX = 'posthog-os-windows:'
const STORAGE_VERSION = 1

interface StoredLayout {
    url: string | null
    windows: OsWindowState[]
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function parseBounds(value: unknown): OsBounds | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const { x, y, width, height } = value as Record<string, unknown>
    return isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(width) && isFiniteNumber(height)
        ? { x, y, width, height }
        : null
}

function parseWindow(value: unknown): OsWindowState | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const raw = value as Record<string, unknown>
    const path = typeof raw.path === 'string' ? sanitizePath(raw.path) : null
    const bounds = parseBounds(raw.bounds)
    // The id becomes part of a frame name, so only short plain ids are allowed back in.
    if (typeof raw.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(raw.id) || !path || !bounds) {
        return null
    }
    return {
        id: raw.id,
        path,
        title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.slice(0, 200) : OS_WINDOW_DEFAULT_TITLE,
        bounds,
        zIndex: isFiniteNumber(raw.zIndex) ? raw.zIndex : 0,
        minimized: raw.minimized === true,
        maximized: raw.maximized === true,
        restoreBounds: parseBounds(raw.restoreBounds),
    }
}

function readLayout(key: string | null): StoredLayout {
    const empty: StoredLayout = { url: null, windows: [] }
    if (!key) {
        return empty
    }
    try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? 'null')
        if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.windows)) {
            return empty
        }
        const seen = new Set<string>()
        const windows = (parsed.windows as unknown[])
            .map(parseWindow)
            .filter((w): w is OsWindowState => !!w && !seen.has(w.id) && !!seen.add(w.id))
        const stack = [...windows].sort((a, b) => a.zIndex - b.zIndex).map((w) => w.id)
        return {
            url: typeof parsed.url === 'string' ? parsed.url : null,
            windows: windows.map((w) => ({ ...w, zIndex: stack.indexOf(w.id) + 1 })),
        }
    } catch {
        return empty
    }
}

function writeLayout(key: string | null, layout: StoredLayout): void {
    if (!key) {
        return
    }
    try {
        localStorage.setItem(key, JSON.stringify({ version: STORAGE_VERSION, ...layout }))
    } catch {
        // A full or blocked localStorage only costs the saved layout, so the desktop keeps working.
    }
}

/** `/os` is the desktop without a window, so it never opens as one. */
function isDesktopUrl(url: string): boolean {
    return removeProjectIdIfPresent(url.split(/[?#]/)[0]) === urls.os()
}

function currentUrl(): string {
    const { pathname, search, hash } = router.values.location
    return `${pathname}${search}${hash}`
}

function sanitizePath(path: string): string | null {
    try {
        // The whole input goes through `osFrameSrc` unparsed, so `//host/x` resolves to another origin and is refused.
        return osFrameSrc({ pathname: path, search: '', hash: '' }, window.location.origin)
    } catch {
        return null
    }
}

function newWindowId(): string {
    return Math.random().toString(36).slice(2, 10)
}

function topWindow(windows: OsWindowState[]): OsWindowState | null {
    return windows.reduce<OsWindowState | null>(
        (top, w) => (!w.minimized && (!top || w.zIndex > top.zIndex) ? w : top),
        null
    )
}

function raise(windows: OsWindowState[], id: string): OsWindowState[] {
    const order = [...windows].sort((a, b) => a.zIndex - b.zIndex).map((w) => w.id)
    const stack = [...order.filter((other) => other !== id), id]
    return windows.map((w) => ({ ...w, zIndex: stack.indexOf(w.id) + 1 }))
}

function updateIn(
    state: OsDesktopState,
    id: string,
    update: (w: OsWindowState) => Partial<OsWindowState>
): OsDesktopState {
    return { ...state, windows: state.windows.map((w) => (w.id === id ? { ...w, ...update(w) } : w)) }
}

function focusIn(state: OsDesktopState, id: string): OsDesktopState {
    // Every click inside a window asks for focus, so an already focused window keeps the same state.
    if (!state.windows.some((w) => w.id === id) || topWindow(state.windows)?.id === id) {
        return state
    }
    return { ...state, windows: raise(updateIn(state, id, () => ({ minimized: false })).windows, id) }
}

function initialDesktop(): OsSize {
    return { width: window.innerWidth, height: window.innerHeight }
}

// Generated by kea-typegen. Update if you're an agent, ignore if you're human.
export interface osWindowsLogicValues {
    currentTeamId: number | null // teamLogic
    desktop: OsSize
    focusedWindow: OsWindowState | null
    state: OsDesktopState
    windows: OsWindowState[]
    zoomOrigins: Record<string, OsPoint>
}

// Generated by kea-typegen. Update if you're an agent, ignore if you're human.
export interface osWindowsLogicActions {
    closeWindow: (id: string) => {
        id: string
    }
    focusWindow: (id: string) => {
        id: string
    }
    maximizeWindow: (id: string) => {
        id: string
    }
    minimizeWindow: (id: string) => {
        id: string
    }
    openWindow: (
        path: string,
        options?: OsOpenWindowOptions
    ) => {
        id: string
        options: OsOpenWindowOptions
        path: string
    }
    restoreLayout: (windows: OsWindowState[]) => {
        windows: OsWindowState[]
    }
    restoreWindow: (id: string) => {
        id: string
    }
    runWindowCommand: (command: OsWindowCommand) => {
        command: OsWindowCommand
    }
    setDesktopSize: (desktop: OsSize) => {
        desktop: OsSize
    }
    setWindowBounds: (
        id: string,
        bounds: OsBounds
    ) => {
        bounds: OsBounds
        id: string
    }
    snapWindow: (
        id: string,
        side: OsSnapSide
    ) => {
        id: string
        side: OsSnapSide
    }
    tidyUpWindows: () => {
        value: true
    }
    unmaximizeWindow: (id: string) => {
        id: string
    }
    windowNavigated: (
        id: string,
        path: string,
        title?: string
    ) => {
        id: string
        path: string
        title: string | undefined
    }
}

// Generated by kea-typegen. Update if you're an agent, ignore if you're human.
export interface osWindowsLogicMeta {
    __keaTypeGenInternalSelectorTypes: {
        windows: (state: OsDesktopState) => OsWindowState[]
        desktop: (state: OsDesktopState) => OsSize
        focusedWindow: (windows: OsWindowState[]) => OsWindowState | null
    }
}

export type osWindowsLogicType = MakeLogicType<
    osWindowsLogicValues,
    osWindowsLogicActions,
    Record<string, any>,
    osWindowsLogicMeta
>

export const osWindowsLogic = kea<osWindowsLogicType>([
    path(['scenes', 'os', 'windows', 'osWindowsLogic']),
    connect(() => ({ values: [teamLogic, ['currentTeamId']] })),
    actions({
        openWindow: (path: string, options: OsOpenWindowOptions = {}) => ({ path, options, id: newWindowId() }),
        focusWindow: (id: string) => ({ id }),
        closeWindow: (id: string) => ({ id }),
        minimizeWindow: (id: string) => ({ id }),
        restoreWindow: (id: string) => ({ id }),
        windowNavigated: (id: string, path: string, title?: string) => ({ id, path, title }),
        setWindowBounds: (id: string, bounds: OsBounds) => ({ id, bounds }),
        maximizeWindow: (id: string) => ({ id }),
        unmaximizeWindow: (id: string) => ({ id }),
        snapWindow: (id: string, side: OsSnapSide) => ({ id, side }),
        tidyUpWindows: true,
        setDesktopSize: (desktop: OsSize) => ({ desktop }),
        restoreLayout: (windows: OsWindowState[]) => ({ windows }),
        runWindowCommand: (command: OsWindowCommand) => ({ command }),
    }),
    reducers({
        state: [
            { windows: [], desktop: initialDesktop() } as OsDesktopState,
            {
                openWindow: (state, { path, options, id }) => {
                    const safePath = sanitizePath(path)
                    if (!safePath) {
                        return state
                    }
                    const existing = options.newWindow ? null : state.windows.find((w) => w.path === safePath)
                    if (existing) {
                        return focusIn(state, existing.id)
                    }
                    const focused = topWindow(state.windows)
                    const created: OsWindowState = {
                        id,
                        path: safePath,
                        title: options.title ?? OS_WINDOW_DEFAULT_TITLE,
                        bounds: placeNewWindow(focused?.bounds ?? null, state.desktop),
                        zIndex: state.windows.length + 1,
                        minimized: false,
                        maximized: false,
                        restoreBounds: null,
                    }
                    return { ...state, windows: raise([...state.windows, created], id) }
                },
                focusWindow: (state, { id }) => focusIn(state, id),
                restoreWindow: (state, { id }) => focusIn(state, id),
                closeWindow: (state, { id }) => ({ ...state, windows: state.windows.filter((w) => w.id !== id) }),
                minimizeWindow: (state, { id }) => updateIn(state, id, () => ({ minimized: true })),
                windowNavigated: (state, { id, path, title }) => {
                    const safePath = sanitizePath(path)
                    if (!safePath) {
                        return state
                    }
                    return updateIn(state, id, (w) => ({ path: safePath, title: title?.trim() || w.title }))
                },
                setWindowBounds: (state, { id, bounds }) =>
                    updateIn(state, id, () => ({
                        bounds: clampBounds(bounds, state.desktop),
                        maximized: false,
                        restoreBounds: null,
                    })),
                maximizeWindow: (state, { id }) =>
                    updateIn(state, id, (w) => ({
                        bounds: maximizedBounds(state.desktop),
                        maximized: true,
                        // A snapped window un-maximizes back into its half.
                        restoreBounds: w.maximized ? w.restoreBounds : w.bounds,
                    })),
                snapWindow: (state, { id, side }) =>
                    updateIn(state, id, (w) => ({
                        bounds: snappedBounds(side, state.desktop),
                        maximized: false,
                        restoreBounds: w.restoreBounds ?? w.bounds,
                    })),
                unmaximizeWindow: (state, { id }) =>
                    updateIn(state, id, (w) => ({
                        bounds: w.restoreBounds ? clampBounds(w.restoreBounds, state.desktop) : w.bounds,
                        maximized: false,
                        restoreBounds: null,
                    })),
                tidyUpWindows: (state) => {
                    const visible = state.windows
                        .filter((w) => !w.minimized)
                        .sort((a, b) => {
                            const boundsA = a.restoreBounds ?? a.bounds
                            const boundsB = b.restoreBounds ?? b.bounds
                            return boundsA.x - boundsB.x || boundsA.y - boundsB.y
                        })
                    const cells = tidyLayout(visible.length, state.desktop)
                    const cellFor = new Map(visible.map((w, index) => [w.id, cells[index]]))
                    return {
                        ...state,
                        windows: state.windows.map((w) => {
                            const cell = cellFor.get(w.id)
                            return cell ? { ...w, bounds: cell, maximized: false, restoreBounds: null } : w
                        }),
                    }
                },
                restoreLayout: (state, { windows }) => ({ ...state, windows }),
                setDesktopSize: (state, { desktop }) => ({
                    desktop,
                    windows: state.windows.map((w) => ({
                        ...w,
                        bounds: w.maximized ? maximizedBounds(desktop) : clampBounds(w.bounds, desktop),
                    })),
                }),
            },
        ],
        // Not saved: a restored window has no icon to zoom from.
        zoomOrigins: [
            {} as Record<string, OsPoint>,
            {
                openWindow: (origins, { id, options }) =>
                    options.origin ? { ...origins, [id]: options.origin } : origins,
                closeWindow: (origins, { id }) => {
                    const { [id]: _closed, ...rest } = origins
                    return rest
                },
            },
        ],
    }),
    selectors({
        windows: [(s) => [s.state], (state: OsDesktopState): OsWindowState[] => state.windows],
        desktop: [(s) => [s.state], (state: OsDesktopState): OsSize => state.desktop],
        focusedWindow: [(s) => [s.windows], (windows: OsWindowState[]): OsWindowState | null => topWindow(windows)],
    }),
    listeners(({ actions, values, cache }) => {
        const persist = (): void => {
            writeLayout(cache.storageKey, { url: currentUrl(), windows: values.windows })
        }
        const syncUrl = (): void => {
            const focused = values.focusedWindow
            if (focused && focused.path !== currentUrl()) {
                router.actions.replace(focused.path)
            }
            persist()
        }
        return {
            openWindow: syncUrl,
            focusWindow: syncUrl,
            restoreWindow: syncUrl,
            closeWindow: syncUrl,
            minimizeWindow: syncUrl,
            windowNavigated: syncUrl,
            setWindowBounds: persist,
            maximizeWindow: persist,
            unmaximizeWindow: persist,
            snapWindow: persist,
            tidyUpWindows: persist,
            setDesktopSize: persist,
            runWindowCommand: ({ command }) => {
                if (command === 'tidy-up') {
                    actions.tidyUpWindows()
                    return
                }
                const focused = values.focusedWindow
                if (!focused) {
                    return
                }
                if (command === 'snap-left' || command === 'snap-right') {
                    actions.snapWindow(focused.id, command === 'snap-left' ? 'left' : 'right')
                } else if (command === 'toggle-maximize') {
                    if (focused.maximized) {
                        actions.unmaximizeWindow(focused.id)
                    } else {
                        actions.maximizeWindow(focused.id)
                    }
                } else if (command === 'minimize') {
                    actions.minimizeWindow(focused.id)
                } else if (command === 'close') {
                    actions.closeWindow(focused.id)
                }
            },
            [router.actionTypes.locationChanged]: ({ method }) => {
                // Only a push or a back/forward is a request to show a path. A replace comes from this
                // logic or from a redirect, and the window that shows the page runs that redirect itself.
                if (method === 'REPLACE') {
                    return
                }
                const url = currentUrl()
                if (url !== values.focusedWindow?.path && !isDesktopUrl(url)) {
                    actions.openWindow(url)
                }
            },
        }
    }),
    afterMount(({ actions, values, cache }) => {
        cache.storageKey = values.currentTeamId ? `${STORAGE_KEY_PREFIX}${values.currentTeamId}` : null
        // Saved bounds are clamped when the window layer reports the desktop size.
        const stored = readLayout(cache.storageKey)
        actions.restoreLayout(stored.windows)
        const url = currentUrl()
        // The saved URL belongs to the saved layout. When the page loads on it again, the layout already
        // shows it, or the user closed its window, so only a different URL opens a window.
        if (url !== stored.url && !isDesktopUrl(url)) {
            actions.openWindow(url)
        }
    }),
])
