import { useActions, useValues } from 'kea'

import { LemonInput } from 'lib/lemon-ui/LemonInput'

import { appsItemName } from '~/layout/panel-layout/navbar/tabs/appsCatalog'
import { iconForType } from '~/layout/panel-layout/ProjectTree/defaultTree'

import { GlassIconFromElement } from '../../shell/glass/GlassIconFromElement'
import { osShellLogic } from '../../shell/osShellLogic'
import { osLauncherLogic } from './osLauncherLogic'

export function OsLauncherHome(): JSX.Element {
    const { groupedApps, search } = useValues(osLauncherLogic)
    const { setSearch, openApp } = useActions(osLauncherLogic)
    const { wallpaper } = useValues(osShellLogic)

    return (
        <div className="absolute inset-0 overflow-y-auto bg-black/35 backdrop-blur-sm" data-attr="os-launcher-home">
            <div className="mx-auto max-w-5xl px-6 pt-8 pb-24 flex flex-col gap-6">
                <LemonInput
                    type="search"
                    placeholder="Search apps"
                    value={search}
                    onChange={setSearch}
                    className="max-w-md mx-auto w-full"
                    data-attr="os-launcher-home-search"
                />
                {groupedApps.length === 0 ? (
                    <p className="text-center text-white">No apps match that search.</p>
                ) : (
                    groupedApps.map((group) => (
                        <section key={group.label} aria-label={group.label}>
                            <h2 className="text-white/80 text-xs font-semibold uppercase tracking-wide mb-2">
                                {group.label}
                            </h2>
                            <ul className="list-none m-0 p-0 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-y-3">
                                {group.items.map((item) => {
                                    const label = appsItemName(item)
                                    return (
                                        <li key={item.href ?? item.path} className="flex justify-center">
                                            <button
                                                type="button"
                                                className="group flex flex-col items-center gap-1 w-28 p-1 rounded text-white text-[13px] font-medium drop-shadow-lg focus-visible:outline-2 focus-visible:outline-white"
                                                onClick={() => item.href && openApp(item.href, label)}
                                                data-attr="os-launcher-app"
                                            >
                                                <span className="scale-125 my-1.5">
                                                    <GlassIconFromElement
                                                        icon={iconForType(item.iconType, item.iconColor)}
                                                        glowColor={wallpaper.glow.light}
                                                        glowColorDark={wallpaper.glow.dark}
                                                    />
                                                </span>
                                                <span className="OsShell__icon-label text-center leading-tight text-balance">
                                                    {label}
                                                </span>
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        </section>
                    ))
                )}
            </div>
        </div>
    )
}
