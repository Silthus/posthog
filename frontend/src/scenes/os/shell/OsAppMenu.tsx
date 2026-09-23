import { useActions, useValues } from 'kea'

import { LemonMenu, LemonMenuItems } from 'lib/lemon-ui/LemonMenu'

import { osAppSlug } from '../store/osAppCatalog'
import { osWindowsLogic } from '../windows/osWindowsLogic'
import { osMenuBarLogic } from './osMenuBarLogic'
import { osShellLogic } from './osShellLogic'

/**
 * The menu of the app in the focused window, like the application menu on macOS: the app's name, and a
 * menu of its pages. Nothing renders while no window has focus.
 */
export function OsAppMenu(): JSX.Element | null {
    const { appMenu, focusedWindow } = useValues(osMenuBarLogic)
    const { openAppPage } = useActions(osMenuBarLogic)
    const { openApp } = useActions(osShellLogic)
    const { minimizeWindow, closeWindow } = useActions(osWindowsLogic)

    if (!appMenu || !focusedWindow) {
        return null
    }
    const { app, pages, activePage, newItems, relatedApps } = appMenu

    const items: LemonMenuItems = [
        {
            items: pages.map((page) => ({
                label: page.label,
                active: page === activePage,
                onClick: () => openAppPage(page.href),
                'data-attr': `os-app-menu-page-${osAppSlug(page.label)}`,
            })),
        },
        newItems.length > 0 && {
            items: [
                {
                    label: 'New',
                    placement: 'right-start',
                    'data-attr': 'os-app-menu-new',
                    items: newItems.map((item) => ({
                        label: item.label,
                        onClick: () => openAppPage(item.href),
                        'data-attr': `os-app-menu-new-${osAppSlug(item.label)}`,
                    })),
                },
            ],
        },
        relatedApps.length > 0 && {
            title: 'Related apps',
            items: relatedApps.map((related) => ({
                label: related.label,
                onClick: () => openApp(related.href, related.label),
                'data-attr': `os-app-menu-related-${osAppSlug(related.label)}`,
            })),
        },
        {
            items: [
                {
                    label: 'New window',
                    onClick: () => openApp(app.href, app.name, undefined, true),
                    'data-attr': 'os-app-menu-new-window',
                },
                {
                    label: 'Minimize window',
                    onClick: () => minimizeWindow(focusedWindow.id),
                    'data-attr': 'os-app-menu-minimize',
                },
                {
                    label: 'Close window',
                    onClick: () => closeWindow(focusedWindow.id),
                    'data-attr': 'os-app-menu-close',
                },
            ],
        },
    ]

    return (
        <LemonMenu items={items} placement="bottom-start">
            <button
                type="button"
                className="OsShell__menu-trigger font-bold min-w-0"
                aria-label={`${app.name} menu`}
                data-attr="os-app-menu"
            >
                <span className="truncate">{app.name}</span>
            </button>
        </LemonMenu>
    )
}
