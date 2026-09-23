export interface OsWindowFrameState {
    path: string
    title: string
}

/**
 * The app titles pages "Page • Section • PostHog", and a window shows only the page part. A loading app
 * has the bare "PostHog" title, which gives an empty string, so the window keeps the title it had.
 */
export function windowTitleFromDocumentTitle(documentTitle: string): string {
    const parts = documentTitle.split(' • ')
    return parts.length > 1 ? parts[0].trim() : ''
}

function readFrame(frame: HTMLIFrameElement): OsWindowFrameState | null {
    try {
        const frameWindow = frame.contentWindow
        const frameDocument = frame.contentDocument
        if (!frameWindow || !frameDocument) {
            return null
        }
        const { pathname, search, hash } = frameWindow.location
        return { path: `${pathname}${search}${hash}`, title: windowTitleFromDocumentTitle(frameDocument.title) }
    } catch {
        // A frame on another origin (an OAuth or billing page) cannot be read, so the window keeps its last path.
        return null
    }
}

/**
 * Reports the path and title of a same-origin window frame after each load, in-app navigation and title
 * change. Call it from the frame's `load` event, because each load replaces the frame's document.
 * Returns a cleanup function.
 *
 * This reads the frame directly as a stopgap. The OS bridge replaces it with messages from the framed app.
 */
export function watchOsWindowFrame(
    frame: HTMLIFrameElement,
    onChange: (state: OsWindowFrameState) => void
): () => void {
    let last: string | null = null
    const report = (): void => {
        const state = readFrame(frame)
        const key = state ? `${state.path}\n${state.title}` : null
        if (state && key !== last) {
            last = key
            onChange(state)
        }
    }
    report()

    const cleanups: (() => void)[] = []
    try {
        // `pushState` fires no event, but the Navigation API reports it. Browsers without it only report loads.
        const navigation = (frame.contentWindow as (Window & { navigation?: EventTarget }) | null)?.navigation
        if (navigation) {
            navigation.addEventListener('currententrychange', report)
            cleanups.push(() => navigation.removeEventListener('currententrychange', report))
        }
        const head = frame.contentDocument?.head
        if (head) {
            // Only the head's direct children and the title are watched, because the app adds styles to the head all the time.
            const observer = new MutationObserver(report)
            observer.observe(head, { childList: true })
            const title = head.querySelector('title')
            if (title) {
                observer.observe(title, { childList: true, characterData: true, subtree: true })
            }
            cleanups.push(() => observer.disconnect())
        }
    } catch {
        // A frame on another origin has nothing this page can watch.
    }
    return () => cleanups.forEach((cleanup) => cleanup())
}
