import './OsShell.scss'

import { useValues } from 'kea'

import { OsWindow } from '../windows/OsWindow'
import { OsDesktop } from './OsDesktop'
import { OsMenuBar } from './OsMenuBar'
import { osShellLogic } from './osShellLogic'

/**
 * The OS desktop that replaces the regular layout. Layers from the back: the desktop (wallpaper and
 * icons), the window layer, and the menu bar on top. The menu bar comes first in the DOM, so it is
 * the first thing the keyboard reaches.
 */
export function OsShell(): JSX.Element {
    const { wallpaper, focusedWindow } = useValues(osShellLogic)

    return (
        <div className="OsShell" data-os-scheme="primary" data-os-wallpaper={wallpaper.key} data-attr="os-shell">
            <div className="relative z-1 flex flex-col h-full p-2 pointer-events-none">
                <div className="pointer-events-auto">
                    <OsMenuBar />
                </div>
                <div
                    className="relative flex flex-1 min-h-0 items-center justify-center pt-2"
                    data-attr="os-window-layer"
                >
                    {focusedWindow && (
                        <div className="pointer-events-auto flex flex-col w-[80%] h-[95%]">
                            <OsWindow id="focused" title={focusedWindow.title} src={focusedWindow.src} />
                        </div>
                    )}
                </div>
            </div>
            <OsDesktop />
        </div>
    )
}
