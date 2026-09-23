import { useActions, useValues } from 'kea'

import { IconDocument, IconHome, IconSearch, IconSparkles, IconX } from '@posthog/icons'

import { Logo } from 'lib/brand'
import { AccountMenu } from 'lib/components/Account/AccountMenu'
import { ProjectMenu } from 'lib/components/Account/ProjectMenu'
import { commandLogic } from 'lib/components/Command/commandLogic'
import { ProfilePicture } from 'lib/lemon-ui/ProfilePicture'
import { cn } from 'lib/utils/css-classes'
import { urls } from 'scenes/urls'
import { userLogic } from 'scenes/userLogic'

import type { OsDesktopApp } from '../../shell/osDesktopApps'
import { osShellLogic } from '../../shell/osShellLogic'
import { osWindowsLogic } from '../../windows/osWindowsLogic'
import { windowsOfApp } from '../osVariantApps'

const ROW =
    'w-full flex items-center gap-2 px-2 py-1 rounded text-[13px] text-left hover:bg-[rgb(var(--os-accent))] focus-visible:outline-2 focus-visible:outline-[rgb(var(--os-text-primary))]'

function AppIcon({ app }: { app: OsDesktopApp }): JSX.Element {
    return (
        <span className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-4">
            {app.icon.kind === 'element' ? app.icon.element : <IconHome />}
        </span>
    )
}

export function OsTilingSidebar(): JSX.Element {
    const { desktopColumns } = useValues(osShellLogic)
    const { openApp } = useActions(osShellLogic)
    const { windows, focusedWindow } = useValues(osWindowsLogic)
    const { restoreWindow, closeWindow, minimizeWindow } = useActions(osWindowsLogic)
    const { toggleCommand } = useActions(commandLogic)
    const { user } = useValues(userLogic)
    const apps = [...desktopColumns.left, ...desktopColumns.right.filter((app) => app.href === urls.settings())]

    return (
        <aside
            className="flex flex-col w-60 shrink-0 h-full rounded bg-[rgb(var(--os-bg)/0.85)] backdrop-blur-xl text-[rgb(var(--os-text-primary))] shadow-xl"
            data-os-scheme="primary"
            aria-label="Apps and windows"
            data-attr="os-tiling-sidebar"
        >
            <div className="flex items-center gap-1 p-2">
                <span className="inline-flex w-6 shrink-0 [&_svg]:w-full [&_svg]:h-auto">
                    <Logo layout="logomark" variant="mono" color="currentColor" />
                </span>
                <ProjectMenu buttonProps={{ className: 'OsShell__menu-trigger font-semibold min-w-0 truncate' }} />
            </div>
            <div className="flex flex-col gap-0.5 px-2">
                <button
                    type="button"
                    className={ROW}
                    onClick={() => toggleCommand('nav-search-button')}
                    data-attr="os-tiling-search"
                >
                    <span className="flex size-5 shrink-0 items-center justify-center">
                        <IconSearch className="size-4" />
                    </span>
                    Search
                </button>
                <button
                    type="button"
                    className={ROW}
                    onClick={() => openApp(urls.ai(), 'PostHog AI')}
                    data-attr="os-tiling-ai"
                >
                    <span className="flex size-5 shrink-0 items-center justify-center">
                        <IconSparkles className="size-4" />
                    </span>
                    PostHog AI
                </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pb-2">
                <nav aria-label="Windows" className="flex flex-col gap-0.5 px-2 pt-3">
                    <h3 className="m-0 px-2 pb-1 text-xs font-semibold opacity-60">Windows</h3>
                    {windows.length === 0 ? (
                        <p className="m-0 px-2 text-xs opacity-60">Pick an app to open a window.</p>
                    ) : (
                        windows.map((w) => (
                            <div
                                key={w.id}
                                className={cn(
                                    'group flex items-center rounded',
                                    w.id === focusedWindow?.id && 'bg-[rgb(var(--os-accent))] font-semibold',
                                    w.minimized && 'opacity-60'
                                )}
                            >
                                <button
                                    type="button"
                                    className={cn(ROW, 'min-w-0')}
                                    onClick={() =>
                                        w.id === focusedWindow?.id ? minimizeWindow(w.id) : restoreWindow(w.id)
                                    }
                                    title={w.id === focusedWindow?.id ? 'Hide this window' : 'Show this window'}
                                    data-attr="os-tiling-window"
                                >
                                    <IconDocument className="size-4 shrink-0" />
                                    <span className="truncate">{w.title}</span>
                                </button>
                                <button
                                    type="button"
                                    className="p-1 mr-1 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[rgb(var(--os-bg))]"
                                    aria-label={`Close ${w.title}`}
                                    onClick={() => closeWindow(w.id)}
                                    data-attr="os-tiling-window-close"
                                >
                                    <IconX className="size-3" />
                                </button>
                            </div>
                        ))
                    )}
                </nav>
                <nav aria-label="Apps" className="flex flex-col gap-0.5 px-2 pt-3">
                    <h3 className="m-0 px-2 pb-1 text-xs font-semibold opacity-60">Apps</h3>
                    {apps.map((app) => {
                        const count = windowsOfApp(app.href, windows).length
                        return (
                            <button
                                key={app.key}
                                type="button"
                                className={ROW}
                                onClick={() => openApp(app.href, app.label)}
                                data-attr={`os-tiling-app-${app.key}`}
                            >
                                <AppIcon app={app} />
                                <span className="flex-1 truncate">{app.label}</span>
                                {count > 0 && <span className="text-xs opacity-60">{count}</span>}
                            </button>
                        )
                    })}
                </nav>
            </div>
            <div className="p-2 border-t border-[rgb(var(--os-text-primary)/0.1)]">
                <AccountMenu
                    align="start"
                    trigger={
                        <button type="button" className={ROW} data-attr="os-tiling-account">
                            <ProfilePicture user={user} size="md" />
                            <span className="truncate">{user?.first_name || user?.email}</span>
                        </button>
                    }
                />
            </div>
        </aside>
    )
}
