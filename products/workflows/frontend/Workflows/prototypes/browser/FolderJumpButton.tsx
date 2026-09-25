// PROTOTYPE (throwaway): the overview the side tree gave, on demand.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconChevronDown, IconFolder, IconFolderOpen } from '@posthog/icons'
import { LemonButton, LemonInput, Popover } from '@posthog/lemon-ui'

import { joinPath } from '~/layout/panel-layout/ProjectTree/utils'

import { combinedVariantLogic } from '../combined/combinedVariantLogic'

function samePath(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((segment, index) => segment === b[index])
}

export function FolderJumpButton(): JSX.Element {
    const { folderPaths, folderCounts, scope } = useValues(combinedVariantLogic)
    const { setScope } = useActions(combinedVariantLogic)
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')

    const needle = search.trim().toLowerCase()
    const folders: string[][] = needle
        ? folderPaths.filter((path) => joinPath(path).toLowerCase().includes(needle))
        : [[], ...folderPaths]

    const jump = (segments: string[]): void => {
        setScope(segments)
        setOpen(false)
        setSearch('')
    }

    return (
        <Popover
            visible={open}
            onClickOutside={() => setOpen(false)}
            placement="bottom-start"
            overlay={
                <div className="flex flex-col gap-1 p-1 w-72" data-attr="workflows-browser-folder-jump">
                    <LemonInput
                        size="small"
                        type="search"
                        placeholder="Find a folder"
                        value={search}
                        onChange={setSearch}
                        autoFocus
                        fullWidth
                        onPressEnter={() => folders[0] && jump(folders[0])}
                    />
                    <div className="flex flex-col max-h-96 overflow-y-auto">
                        {folders.length === 0 && (
                            <span className="text-secondary text-sm px-2 py-1">No folder matches “{search}”</span>
                        )}
                        {folders.map((segments) => {
                            const label = segments.length ? segments[segments.length - 1] : 'Workflows'
                            const active = samePath(segments, scope)
                            return (
                                <div
                                    key={joinPath(segments) || 'root'}
                                    // Indentation follows the folder depth, which Tailwind can't express as a class.
                                    style={{ paddingLeft: needle ? 0 : Math.max(segments.length - 1, 0) * 14 }}
                                >
                                    <LemonButton
                                        size="small"
                                        fullWidth
                                        active={active}
                                        icon={active ? <IconFolderOpen /> : <IconFolder />}
                                        sideIcon={
                                            <span className="text-xs text-secondary tabular-nums" translate="no">
                                                {folderCounts[joinPath(segments)] ?? 0}
                                            </span>
                                        }
                                        onClick={() => jump(segments)}
                                    >
                                        <span className="truncate">
                                            {needle && segments.length > 1 ? (
                                                <>
                                                    <span className="text-secondary font-normal">
                                                        {segments.slice(0, -1).join(' / ')} /{' '}
                                                    </span>
                                                    {label}
                                                </>
                                            ) : (
                                                label
                                            )}
                                        </span>
                                    </LemonButton>
                                </div>
                            )
                        })}
                    </div>
                </div>
            }
        >
            <LemonButton
                size="xsmall"
                type="secondary"
                icon={<IconFolderOpen />}
                sideIcon={<IconChevronDown />}
                onClick={() => setOpen(!open)}
                tooltip="Jump to any folder"
                aria-label="Jump to any folder"
                data-attr="workflows-browser-folder-jump-open"
            />
        </Popover>
    )
}
