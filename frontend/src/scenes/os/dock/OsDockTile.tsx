import { useActions } from 'kea'
import { useRef } from 'react'

import { Tooltip } from 'lib/lemon-ui/Tooltip'
import { ButtonPrimitive } from 'lib/ui/Button/ButtonPrimitives'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from 'lib/ui/ContextMenu/ContextMenu'
import { cn } from 'lib/utils/css-classes'

import type { OsPoint } from '../windows/osWindowGeometry'
import type { OsDockItem } from './osDockItems'
import { osDockLogic } from './osDockLogic'

export interface OsDockTileProps {
    item: OsDockItem
    icon: JSX.Element
    'data-attr': string
}

// Windows zoom open from the dock tile, in the window layer's coordinates.
function originOf(from: Element | null): OsPoint | undefined {
    const layer = document.querySelector('[data-attr="os-window-layer"]')?.getBoundingClientRect()
    const tile = from?.getBoundingClientRect()
    return layer && tile
        ? { x: tile.left + tile.width / 2 - layer.left, y: tile.top + tile.height / 2 - layer.top }
        : undefined
}

function accessibleName({ title, focused, minimized, pinned, windowIds }: OsDockItem): string {
    if (!windowIds.length) {
        return pinned ? `${title}, pinned` : title
    }
    if (minimized) {
        return `${title}, minimized`
    }
    return focused ? `${title}, active` : title
}

export function OsDockTile({ item, icon, 'data-attr': dataAttr }: OsDockTileProps): JSX.Element {
    const { activateItem, openItemInNewWindow, minimizeItem, restoreItem, closeItem, pinApp, unpinApp } =
        useActions(osDockLogic)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const open = item.windowIds.length > 0
    const windowCount = item.windowIds.length

    return (
        <li className="OsDock__item">
            <ContextMenu>
                <Tooltip title={item.title} placement="top">
                    <ContextMenuTrigger asChild>
                        <button
                            ref={buttonRef}
                            type="button"
                            className={cn(
                                'OsDock__button',
                                item.focused && 'OsDock__button--focused',
                                item.minimized && 'OsDock__button--minimized'
                            )}
                            aria-label={accessibleName(item)}
                            aria-current={item.focused ? 'true' : undefined}
                            onClick={(event) => activateItem(item.key, originOf(event.currentTarget))}
                            data-attr={dataAttr}
                        >
                            {icon}
                        </button>
                    </ContextMenuTrigger>
                </Tooltip>
                <ContextMenuContent className="min-w-48" aria-label={`${item.title} options`}>
                    {item.app && (
                        <>
                            <ContextMenuGroup>
                                <ContextMenuItem asChild>
                                    {item.pinned ? (
                                        <ButtonPrimitive
                                            menuItem
                                            onClick={() => unpinApp(item.key)}
                                            data-attr="os-dock-unpin"
                                        >
                                            Unpin from dock
                                        </ButtonPrimitive>
                                    ) : (
                                        <ButtonPrimitive
                                            menuItem
                                            onClick={() => pinApp(item.key)}
                                            data-attr="os-dock-pin"
                                        >
                                            Pin to dock
                                        </ButtonPrimitive>
                                    )}
                                </ContextMenuItem>
                            </ContextMenuGroup>
                            <ContextMenuSeparator />
                        </>
                    )}
                    <ContextMenuGroup>
                        <ContextMenuItem asChild>
                            <ButtonPrimitive
                                menuItem
                                onClick={() =>
                                    open
                                        ? openItemInNewWindow(item.key, originOf(buttonRef.current))
                                        : activateItem(item.key, originOf(buttonRef.current))
                                }
                                data-attr={open ? 'os-dock-open-new-window' : 'os-dock-open'}
                            >
                                {open ? 'Open in new window' : 'Open'}
                            </ButtonPrimitive>
                        </ContextMenuItem>
                        {open && (
                            <ContextMenuItem asChild>
                                {item.minimized ? (
                                    <ButtonPrimitive
                                        menuItem
                                        onClick={() => restoreItem(item.key)}
                                        data-attr="os-dock-restore"
                                    >
                                        Restore
                                    </ButtonPrimitive>
                                ) : (
                                    <ButtonPrimitive
                                        menuItem
                                        onClick={() => minimizeItem(item.key)}
                                        data-attr="os-dock-minimize"
                                    >
                                        Minimize
                                    </ButtonPrimitive>
                                )}
                            </ContextMenuItem>
                        )}
                    </ContextMenuGroup>
                    {open && (
                        <>
                            <ContextMenuSeparator />
                            <ContextMenuGroup>
                                <ContextMenuItem asChild>
                                    <ButtonPrimitive
                                        menuItem
                                        onClick={() => closeItem(item.key)}
                                        data-attr="os-dock-close"
                                    >
                                        {windowCount > 1 ? `Close ${windowCount} windows` : 'Close'}
                                    </ButtonPrimitive>
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </>
                    )}
                </ContextMenuContent>
            </ContextMenu>
            {open && <span className="OsDock__running" aria-hidden />}
        </li>
    )
}
