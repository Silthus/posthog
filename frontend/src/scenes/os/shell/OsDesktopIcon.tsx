import { LinkPrimitive } from 'lib/lemon-ui/Link'
import { cn } from 'lib/utils/css-classes'

import { GlassIcon } from './glass/GlassIcon'
import type { OsDesktopApp } from './osDesktopApps'
import type { OsWallpaperOption } from './osWallpapers'

export interface OsDesktopIconProps {
    app: OsDesktopApp
    wallpaper: OsWallpaperOption
    onOpen: (app: OsDesktopApp) => void
}

export function OsDesktopIcon({ app, wallpaper, onOpen }: OsDesktopIconProps): JSX.Element {
    const { icon } = app
    return (
        <li className="w-28 min-h-[84px] flex justify-center items-start">
            {/* Moves half a pixel on hover and press, like the posthog.com icons. */}
            <span className="relative inline-flex hover:top-[-0.5px] active:top-[0.5px]">
                <LinkPrimitive
                    to={app.href}
                    target={app.external ? '_blank' : undefined}
                    onClick={(event) => {
                        // Cmd and Ctrl clicks never reach this handler, so they open a browser tab.
                        if (app.external) {
                            return
                        }
                        event.preventDefault()
                        onOpen(app)
                    }}
                    className="group inline-flex flex-col items-center justify-center gap-0.5 max-w-28 text-center select-none text-white font-medium drop-shadow-lg rounded focus-visible:outline-2 focus-visible:outline-white"
                    data-attr={`os-desktop-icon-${app.key}`}
                >
                    {icon.kind === 'glyph' ? (
                        <GlassIcon
                            path={icon.path}
                            viewBox={icon.viewBox}
                            fillRule={icon.fillRule}
                            glowColor={wallpaper.glow.light}
                            glowColorDark={wallpaper.glow.dark}
                        />
                    ) : (
                        <span className="inline-flex size-9 items-center justify-center text-white [&_svg]:size-7">
                            {icon.element}
                        </span>
                    )}
                    <span className="text-[13px] font-medium leading-tight text-balance">
                        <span
                            className={cn(
                                'OsShell__icon-label inline-block rounded-[2px] px-0.5',
                                wallpaper.labelBackdrop && 'bg-black/50 dark:bg-black/60'
                            )}
                        >
                            {app.label}
                        </span>
                    </span>
                </LinkPrimitive>
            </span>
        </li>
    )
}
