import { useActions, useValues } from 'kea'

import { IconApps, IconSearch, IconX } from '@posthog/icons'

import { AccountMenu } from 'lib/components/Account/AccountMenu'
import { ProjectMenu } from 'lib/components/Account/ProjectMenu'
import { ProfilePicture } from 'lib/lemon-ui/ProfilePicture'
import { cn } from 'lib/utils/css-classes'
import { userLogic } from 'scenes/userLogic'

import { osWindowsLogic } from '../../windows/osWindowsLogic'
import { osLauncherLogic } from './osLauncherLogic'

export function OsWindowSwitcher(): JSX.Element {
    const { windows, focusedWindow } = useValues(osWindowsLogic)
    const { restoreWindow, closeWindow } = useActions(osWindowsLogic)
    const { goHome, setSpotlightOpen } = useActions(osLauncherLogic)
    const { user } = useValues(userLogic)
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

    return (
        <header className="OsShell__menu-bar gap-2" data-os-scheme="primary" data-attr="os-window-switcher">
            <button
                type="button"
                className={cn('OsShell__menu-trigger shrink-0', !focusedWindow && 'bg-[rgb(var(--os-accent))]')}
                onClick={goHome}
                aria-label="All apps"
                data-attr="os-launcher-home-button"
            >
                <IconApps className="size-5" />
                <span>Apps</span>
            </button>
            <nav aria-label="Windows" className="flex flex-1 min-w-0 items-center gap-1 overflow-x-auto">
                {windows.map((w) => (
                    <div
                        key={w.id}
                        className={cn(
                            'flex shrink-0 max-w-48 items-center rounded text-[13px]',
                            w.id === focusedWindow?.id
                                ? 'bg-[rgb(var(--os-bg))] shadow-sm font-semibold'
                                : 'hover:bg-[rgb(var(--os-accent))]',
                            w.minimized && 'opacity-70'
                        )}
                    >
                        <button
                            type="button"
                            className="truncate py-1 pl-2 pr-1"
                            onClick={() => restoreWindow(w.id)}
                            aria-current={w.id === focusedWindow?.id ? 'page' : undefined}
                            data-attr="os-window-switcher-tab"
                        >
                            {w.title}
                        </button>
                        <button
                            type="button"
                            className="p-1 mr-0.5 rounded hover:bg-[rgb(var(--os-accent))]"
                            aria-label={`Close ${w.title}`}
                            onClick={() => closeWindow(w.id)}
                            data-attr="os-window-switcher-close"
                        >
                            <IconX className="size-3" />
                        </button>
                    </div>
                ))}
            </nav>
            <div data-os-scheme="secondary" className="flex shrink-0 items-center gap-0.5 py-1">
                <button
                    type="button"
                    className="OsShell__menu-trigger gap-2 min-w-40 justify-between bg-[rgb(var(--os-bg)/0.7)]"
                    onClick={() => setSpotlightOpen(true)}
                    data-attr="os-launcher-search"
                >
                    <span className="flex items-center gap-1">
                        <IconSearch className="size-4" />
                        Open an app
                    </span>
                    <kbd className="text-xs opacity-70">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
                </button>
                <ProjectMenu buttonProps={{ className: 'OsShell__menu-trigger font-semibold' }} />
                <AccountMenu
                    align="end"
                    trigger={
                        <button
                            type="button"
                            className="OsShell__menu-trigger"
                            aria-label="Account"
                            data-attr="os-launcher-account"
                        >
                            <ProfilePicture user={user} size="md" />
                        </button>
                    }
                />
            </div>
        </header>
    )
}
