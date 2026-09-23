import { useMountedLogic, useValues } from 'kea'

import { osShellLogic } from '../../shell/osShellLogic'
import { OsWallpaper } from '../../shell/OsWallpaper'
import { OsWindowLayer } from '../../windows/OsWindowLayer'
import { osWindowsLogic } from '../../windows/osWindowsLogic'
import { OsLauncherHome } from './OsLauncherHome'
import { osLauncherLogic } from './osLauncherLogic'
import { OsLauncherSpotlight } from './OsLauncherSpotlight'
import { OsWindowSwitcher } from './OsWindowSwitcher'

/**
 * PROTOTYPE variant C, launcher first: the app grid is home, windows open at full size, a tab strip
 * switches between them, and Cmd+K opens any app or window. No desktop icons, no dock.
 */
export function OsLauncherShell(): JSX.Element {
    useMountedLogic(osLauncherLogic)
    const { wallpaper } = useValues(osShellLogic)
    const { focusedWindow } = useValues(osWindowsLogic)

    return (
        <div className="OsShell" data-os-scheme="primary" data-os-wallpaper={wallpaper.key} data-attr="os-shell">
            <div className="relative z-1 flex flex-col h-full p-2 pointer-events-none">
                <div className="pointer-events-auto">
                    <OsWindowSwitcher />
                </div>
                <div className="OsShell__window-layer flex flex-1 min-h-0 pt-2">
                    <OsWindowLayer />
                </div>
            </div>
            <div className="absolute inset-0 z-0">
                <OsWallpaper wallpaper={wallpaper.key} />
                {!focusedWindow && (
                    <div className="absolute inset-0 top-[58px]">
                        <OsLauncherHome />
                    </div>
                )}
            </div>
            <OsLauncherSpotlight />
        </div>
    )
}
