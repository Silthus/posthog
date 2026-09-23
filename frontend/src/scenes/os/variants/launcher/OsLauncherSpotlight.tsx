import { useActions, useValues } from 'kea'
import { useEffect, useState } from 'react'

import { IconDocument } from '@posthog/icons'

import { LemonInput } from 'lib/lemon-ui/LemonInput'
import { cn } from 'lib/utils/css-classes'

import { appsItemName } from '~/layout/panel-layout/navbar/tabs/appsCatalog'
import { iconForType } from '~/layout/panel-layout/ProjectTree/defaultTree'

import { osWindowsLogic } from '../../windows/osWindowsLogic'
import { osLauncherLogic } from './osLauncherLogic'

interface SpotlightResult {
    key: string
    label: string
    hint: string
    icon: JSX.Element
    run: () => void
}

const MAX_APP_RESULTS = 8

/**
 * The Cmd+K launcher: open windows first, then apps. `osLauncherLogic` opens it in place of the command
 * palette. It only hears Cmd+K while the page has focus, because key presses inside a window stay in its frame.
 */
export function OsLauncherSpotlight(): JSX.Element | null {
    const { spotlightOpen, allItems } = useValues(osLauncherLogic)
    const { setSpotlightOpen, openApp } = useActions(osLauncherLogic)
    const { windows } = useValues(osWindowsLogic)
    const { restoreWindow } = useActions(osWindowsLogic)
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)

    useEffect(() => {
        setQuery('')
        setActive(0)
    }, [spotlightOpen])

    if (!spotlightOpen) {
        return null
    }

    const needle = query.trim().toLowerCase()
    const results: SpotlightResult[] = [
        ...windows
            .filter((w) => !needle || w.title.toLowerCase().includes(needle))
            .sort((a, b) => b.zIndex - a.zIndex)
            .map((w) => ({
                key: `window-${w.id}`,
                label: w.title,
                hint: w.minimized ? 'Minimized window' : 'Open window',
                icon: <IconDocument />,
                run: () => {
                    restoreWindow(w.id)
                    setSpotlightOpen(false)
                },
            })),
        ...allItems
            .filter((item) => item.href && (!needle || appsItemName(item).toLowerCase().includes(needle)))
            .slice(0, MAX_APP_RESULTS)
            .map((item) => ({
                key: `app-${item.href}`,
                label: appsItemName(item),
                hint: item.category || 'App',
                icon: iconForType(item.iconType, item.iconColor),
                run: () => openApp(item.href as string, appsItemName(item)),
            })),
    ]
    const activeIndex = Math.min(active, Math.max(results.length - 1, 0))

    return (
        <div
            className="fixed inset-0 z-[2147482000] flex justify-center items-start pt-[18vh] bg-black/30"
            onMouseDown={(event) => event.target === event.currentTarget && setSpotlightOpen(false)}
            data-attr="os-launcher-spotlight"
        >
            <div
                role="dialog"
                aria-label="Open an app or a window"
                className="w-[36rem] max-w-[calc(100vw-2rem)] rounded-lg bg-surface-primary border border-primary shadow-xl p-2 flex flex-col gap-1"
            >
                <LemonInput
                    autoFocus
                    size="large"
                    placeholder="Open an app or a window"
                    value={query}
                    onChange={(value) => {
                        setQuery(value)
                        setActive(0)
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            setSpotlightOpen(false)
                        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                            event.preventDefault()
                            const step = event.key === 'ArrowDown' ? 1 : -1
                            setActive((activeIndex + step + results.length) % Math.max(results.length, 1))
                        } else if (event.key === 'Enter') {
                            results[activeIndex]?.run()
                        }
                    }}
                    data-attr="os-launcher-spotlight-input"
                />
                {results.length === 0 ? (
                    <p className="m-0 px-2 py-3 text-secondary">No apps or windows match that search.</p>
                ) : (
                    <ul className="list-none m-0 p-0 max-h-96 overflow-y-auto" role="listbox">
                        {results.map((result, index) => (
                            <li key={result.key} role="option" aria-selected={index === activeIndex}>
                                <button
                                    type="button"
                                    className={cn(
                                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left',
                                        index === activeIndex ? 'bg-fill-highlight-100' : 'hover:bg-fill-highlight-50'
                                    )}
                                    onMouseEnter={() => setActive(index)}
                                    onClick={result.run}
                                    data-attr="os-launcher-spotlight-result"
                                >
                                    <span className="flex size-5 items-center justify-center [&_svg]:size-4">
                                        {result.icon}
                                    </span>
                                    <span className="flex-1 truncate font-medium">{result.label}</span>
                                    <span className="text-secondary text-xs">{result.hint}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
