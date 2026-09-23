import { useActions, useValues } from 'kea'

import { IconDocument } from '@posthog/icons'

import { Tooltip } from 'lib/lemon-ui/Tooltip'
import { cn } from 'lib/utils/css-classes'
import { urls } from 'scenes/urls'

import { GlassIcon } from '../../shell/glass/GlassIcon'
import { GlassIconFromElement } from '../../shell/glass/GlassIconFromElement'
import type { OsDesktopApp } from '../../shell/osDesktopApps'
import { osShellLogic } from '../../shell/osShellLogic'
import { osWindowsLogic } from '../../windows/osWindowsLogic'
import { appShowsPath, windowsOfApp } from '../osVariantApps'

// PROTOTYPE: a placeholder dock for the Mac variant, until the real dock (`dock/`) lands.

function zoomOrigin(from: Element): { x: number; y: number } | undefined {
    const layer = document.querySelector('[data-attr="os-window-layer"]')?.getBoundingClientRect()
    const icon = from.getBoundingClientRect()
    return layer ? { x: icon.left + icon.width / 2 - layer.left, y: icon.top - layer.top } : undefined
}

function DockIcon({ app }: { app: OsDesktopApp }): JSX.Element {
    const { wallpaper } = useValues(osShellLogic)
    return app.icon.kind === 'glyph' ? (
        <GlassIcon
            path={app.icon.path}
            viewBox={app.icon.viewBox}
            fillRule={app.icon.fillRule}
            glowColor={wallpaper.glow.light}
            glowColorDark={wallpaper.glow.dark}
        />
    ) : (
        <GlassIconFromElement
            icon={app.icon.element}
            glowColor={wallpaper.glow.light}
            glowColorDark={wallpaper.glow.dark}
        />
    )
}

const MAX_PINNED = 10

const DOCK_BUTTON =
    'group relative flex flex-col items-center justify-end h-14 w-12 rounded-lg transition-transform duration-150 ease-out hover:-translate-y-1.5 hover:scale-110 motion-reduce:transition-none motion-reduce:hover:transform-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

export function OsMacDock(): JSX.Element {
    const { desktopColumns } = useValues(osShellLogic)
    const { openApp } = useActions(osShellLogic)
    const { windows, focusedWindow } = useValues(osWindowsLogic)
    const { restoreWindow, minimizeWindow } = useActions(osWindowsLogic)

    // A dock holds a handful of apps. The menu bar's Apps menu lists the rest.
    const pinned: OsDesktopApp[] = [
        ...desktopColumns.left.slice(0, MAX_PINNED),
        ...desktopColumns.right.filter((app) => !app.external && app.href === urls.settings()),
    ]
    const loose = windows.filter((w) => w.minimized || !pinned.some((app) => appShowsPath(app.href, w.path)))

    return (
        <nav
            aria-label="Dock"
            className="OsShell__dock flex items-end gap-1 px-2 pt-1.5 pb-1 max-w-full"
            data-os-scheme="primary"
            data-attr="os-mac-dock"
        >
            {pinned.map((app) => {
                const running = windowsOfApp(app.href, windows)
                const top = running[0]
                return (
                    <Tooltip key={app.key} title={app.label} placement="top">
                        <button
                            type="button"
                            aria-label={app.label}
                            className={DOCK_BUTTON}
                            onClick={(event) => {
                                if (!top) {
                                    openApp(app.href, app.label, zoomOrigin(event.currentTarget))
                                } else if (top.id === focusedWindow?.id) {
                                    minimizeWindow(top.id)
                                } else {
                                    restoreWindow(top.id)
                                }
                            }}
                            data-attr={`os-mac-dock-${app.key}`}
                        >
                            <span className="scale-[1.3] origin-bottom mb-2">
                                <DockIcon app={app} />
                            </span>
                            <span
                                aria-hidden
                                className={cn(
                                    'absolute bottom-0 size-1 rounded-full bg-[rgb(var(--os-text-primary))]',
                                    running.length === 0 && 'invisible'
                                )}
                            />
                        </button>
                    </Tooltip>
                )
            })}
            {loose.length > 0 && (
                <span aria-hidden className="self-stretch w-px mx-1 my-1 bg-[rgb(var(--os-text-primary)/0.2)]" />
            )}
            {loose.map((w) => (
                <Tooltip key={w.id} title={w.minimized ? `${w.title} (minimized)` : w.title} placement="top">
                    <button
                        type="button"
                        aria-label={w.title}
                        className={DOCK_BUTTON}
                        onClick={() => restoreWindow(w.id)}
                        data-attr="os-mac-dock-window"
                    >
                        <span
                            className={cn(
                                'mb-2 flex flex-col w-11 h-9 rounded-md overflow-hidden border border-[rgb(var(--os-text-primary)/0.25)] bg-[rgb(var(--os-bg))] shadow',
                                w.minimized && 'opacity-70'
                            )}
                        >
                            <span className="h-1.5 bg-[rgb(var(--os-accent))]" />
                            <span className="flex flex-1 items-center justify-center text-[rgb(var(--os-text-primary))]">
                                <IconDocument className="size-4" />
                            </span>
                        </span>
                        <span
                            aria-hidden
                            className="absolute bottom-0 size-1 rounded-full bg-[rgb(var(--os-text-primary))]"
                        />
                    </button>
                </Tooltip>
            ))}
        </nav>
    )
}
