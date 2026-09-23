import { removeProjectIdIfPresent } from 'lib/utils/kea-router'

import type { OsWindowState } from '../windows/osWindowsLogic'

function appPathname(href: string): string {
    const pathname = removeProjectIdIfPresent(href.split(/[?#]/)[0]).replace(/\/+$/, '')
    return pathname || '/'
}

export function appShowsPath(href: string, windowPath: string): boolean {
    const app = appPathname(href)
    const page = appPathname(windowPath)
    // Home is the project root, which every other page sits under.
    return app === '/' ? page === '/' : page === app || page.startsWith(`${app}/`)
}

export function windowsOfApp(href: string, windows: OsWindowState[]): OsWindowState[] {
    return windows.filter((w) => appShowsPath(href, w.path)).sort((a, b) => b.zIndex - a.zIndex)
}
