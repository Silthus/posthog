import { useActions, useValues } from 'kea'

import { OsDesktopIcon } from '../../shell/OsDesktopIcon'
import { OsMenuBar } from '../../shell/OsMenuBar'
import { osShellLogic } from '../../shell/osShellLogic'
import { OsWallpaper } from '../../shell/OsWallpaper'
import { OsWindowLayer } from '../../windows/OsWindowLayer'
import { OsMacDock } from './OsMacDock'

/**
 * PROTOTYPE variant B, Mac: the menu bar on top, a dock at the bottom that launches apps and brings back
 * minimized windows, and an almost empty desktop with only the system items on the right.
 */
export function OsMacShell(): JSX.Element {
    const { wallpaper, desktopColumns } = useValues(osShellLogic)
    const { openApp } = useActions(osShellLogic)

    return (
        <div className="OsShell" data-os-scheme="primary" data-os-wallpaper={wallpaper.key} data-attr="os-shell">
            <div className="relative z-1 flex flex-col h-full p-2 pointer-events-none">
                <div className="pointer-events-auto">
                    <OsMenuBar />
                </div>
                <div className="OsShell__window-layer flex flex-1 min-h-0 py-2">
                    <OsWindowLayer />
                </div>
                <div className="flex justify-center">
                    <div className="pointer-events-auto max-w-full">
                        <OsMacDock />
                    </div>
                </div>
            </div>
            <div className="absolute inset-0 z-0" data-attr="os-desktop">
                <OsWallpaper wallpaper={wallpaper.key} />
                <nav aria-label="Desktop" className="relative flex justify-end px-1 pt-[66px]">
                    <ul className="list-none m-0 p-0 flex flex-col">
                        {desktopColumns.right.map((app) => (
                            <OsDesktopIcon
                                key={app.key}
                                app={app}
                                wallpaper={wallpaper}
                                onOpen={(opened) => openApp(opened.href, opened.label)}
                            />
                        ))}
                    </ul>
                </nav>
            </div>
        </div>
    )
}
