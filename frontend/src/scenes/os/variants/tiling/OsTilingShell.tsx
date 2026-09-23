import { useMountedLogic, useValues } from 'kea'

import { osShellLogic } from '../../shell/osShellLogic'
import { OsWallpaper } from '../../shell/OsWallpaper'
import { OsWindowLayer } from '../../windows/OsWindowLayer'
import { osTilingLogic } from './osTilingLogic'
import { OsTilingSidebar } from './OsTilingSidebar'

/**
 * PROTOTYPE variant D, tiling: a sidebar close to today's navigation lists the apps and the open windows,
 * and the visible windows always share the space in a grid. No menu bar, no desktop icons, no dock.
 */
export function OsTilingShell(): JSX.Element {
    useMountedLogic(osTilingLogic)
    const { wallpaper } = useValues(osShellLogic)

    return (
        <div className="OsShell" data-os-scheme="primary" data-os-wallpaper={wallpaper.key} data-attr="os-shell">
            <div className="relative z-1 flex h-full p-2 gap-2 pointer-events-none">
                <div className="pointer-events-auto h-full">
                    <OsTilingSidebar />
                </div>
                <div className="OsShell__window-layer flex flex-1 min-w-0">
                    <OsWindowLayer />
                </div>
            </div>
            <div className="absolute inset-0 z-0">
                <OsWallpaper wallpaper={wallpaper.key} />
            </div>
        </div>
    )
}
