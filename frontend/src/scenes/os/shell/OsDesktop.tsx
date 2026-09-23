import { useActions, useValues } from 'kea'

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from 'lib/ui/ContextMenu/ContextMenu'
import { urls } from 'scenes/urls'

import { OsDesktopIcon } from './OsDesktopIcon'
import { osShellLogic } from './osShellLogic'
import { OsWallpaper } from './OsWallpaper'
import { OS_WALLPAPERS, OsWallpaperKey } from './osWallpapers'

// The menu bar is 42px tall inside the shell's 8px padding. Icons start 16px below it.
const ICON_COLUMN_CLASS = 'list-none m-0 p-0 flex flex-col content-start h-[calc(100dvh-82px)]'

/** The wallpaper, the icon columns and the right-click menu. Windows render above it. */
export function OsDesktop(): JSX.Element {
    const { wallpaper, desktopColumns } = useValues(osShellLogic)
    const { setWallpaper, openApp } = useActions(osShellLogic)
    const onOpen = ({ href, label }: { href: string; label: string }): void => openApp(href, label)

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div className="absolute inset-0" data-attr="os-desktop">
                    <OsWallpaper wallpaper={wallpaper.key} />
                    <nav aria-label="Desktop" className="relative flex justify-between items-start px-1 pt-[66px]">
                        <ul className={`${ICON_COLUMN_CLASS} flex-wrap`}>
                            {desktopColumns.left.map((app) => (
                                <OsDesktopIcon key={app.key} app={app} wallpaper={wallpaper} onOpen={onOpen} />
                            ))}
                        </ul>
                        {/* Wraps into new columns towards the middle, so the first column stays on the edge. */}
                        <ul className={`${ICON_COLUMN_CLASS} flex-wrap-reverse`}>
                            {desktopColumns.right.map((app) => (
                                <OsDesktopIcon key={app.key} app={app} wallpaper={wallpaper} onOpen={onOpen} />
                            ))}
                        </ul>
                    </nav>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-56">
                <ContextMenuLabel>Wallpaper</ContextMenuLabel>
                <ContextMenuRadioGroup
                    value={wallpaper.key}
                    onValueChange={(value) => setWallpaper(value as OsWallpaperKey)}
                >
                    {OS_WALLPAPERS.map(({ key, label }) => (
                        <ContextMenuRadioItem key={key} value={key} data-attr={`os-wallpaper-${key}`}>
                            {label}
                        </ContextMenuRadioItem>
                    ))}
                </ContextMenuRadioGroup>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onSelect={() => onOpen({ href: urls.settings('user-navigation'), label: 'Settings' })}
                    data-attr="os-desktop-customize-icons"
                >
                    Choose desktop apps
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}
