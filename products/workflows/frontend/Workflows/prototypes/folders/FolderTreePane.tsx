// PROTOTYPE (throwaway): the folder tree beside the contents pane. Counts follow the search pills.
import { useActions, useValues } from 'kea'
import { useEffect, useMemo, useState } from 'react'

import { IconBook, IconFolder, IconFolderOpen, IconStack } from '@posthog/icons'

import { LemonTree, TreeDataItem } from 'lib/lemon-ui/LemonTree/LemonTree'

import { joinPath } from '~/layout/panel-layout/ProjectTree/utils'

import { FolderLocation, FolderRow, foldersVariantLogic, locationKey } from './foldersVariantLogic'

function buildFolderNodes(folderPaths: string[][], parent: string[], counts: Map<string, number>): TreeDataItem[] {
    return folderPaths
        .filter(
            (segments) =>
                segments.length === parent.length + 1 && parent.every((segment, index) => segments[index] === segment)
        )
        .map((segments) => {
            const children = buildFolderNodes(folderPaths, segments, counts)
            return {
                id: `folder:${joinPath(segments)}`,
                name: segments[segments.length - 1],
                record: {
                    location: { type: 'folder', segments } as FolderLocation,
                    count: counts.get(joinPath(segments)) ?? 0,
                },
                children: children.length ? children : undefined,
            }
        })
}

function countByFolder(rows: FolderRow[]): Map<string, number> {
    const counts = new Map<string, number>()
    for (const row of rows) {
        if (!row.segments) {
            continue
        }
        for (let depth = 0; depth <= row.segments.length; depth++) {
            const key = joinPath(row.segments.slice(0, depth))
            counts.set(key, (counts.get(key) ?? 0) + 1)
        }
    }
    return counts
}

export function FolderTreePane(): JSX.Element {
    const { folderPaths, matchingRows, location } = useValues(foldersVariantLogic)
    const { setLocation } = useActions(foldersVariantLogic)

    const data = useMemo((): TreeDataItem[] => {
        const counts = countByFolder(matchingRows)
        const unfiled = matchingRows.filter((row) => !row.segments && row.kind === 'workflow').length
        const library = matchingRows.filter((row) => !row.segments && row.kind !== 'workflow').length
        return [
            {
                id: 'folder:',
                name: 'Workflows',
                record: { location: { type: 'folder', segments: [] }, count: counts.get('') ?? 0 },
                children: buildFolderNodes(folderPaths, [], counts),
            },
            {
                id: 'unfiled',
                name: 'Unfiled',
                icon: <IconStack />,
                record: { location: { type: 'unfiled' }, count: unfiled },
            },
            {
                id: 'library',
                name: 'Library',
                icon: <IconBook />,
                record: { location: { type: 'library' }, count: library },
            },
        ]
    }, [folderPaths, matchingRows])

    const activeId = locationKey(location)
    const [expandedIds, setExpandedIds] = useState<string[]>(['folder:'])
    // Opening a folder from the contents pane or the URL reveals it in the tree.
    useEffect(() => {
        if (location.type !== 'folder') {
            return
        }
        const ancestors = location.segments.map(
            (_, index) => `folder:${joinPath(location.segments.slice(0, index + 1))}`
        )
        setExpandedIds((current) => Array.from(new Set([...current, 'folder:', ...ancestors])))
    }, [location])

    return (
        <nav aria-label="Workflow folders" className="py-1" data-attr="workflows-folders-tree">
            <LemonTree
                data={data}
                expandedItemIds={expandedIds}
                onSetExpandedItemIds={setExpandedIds}
                isItemActive={(item) => (item.record?.location ? locationKey(item.record.location) : '') === activeId}
                onItemClick={(item) => item?.record?.location && setLocation(item.record.location)}
                onFolderClick={(item) => item?.record?.location && setLocation(item.record.location)}
                renderItemIcon={(item) =>
                    item.icon ??
                    ((item.record?.location ? locationKey(item.record.location) : '') === activeId ? (
                        <IconFolderOpen />
                    ) : (
                        <IconFolder />
                    ))
                }
                renderItem={(item, name) => (
                    <span className="flex items-center gap-2 min-w-0 w-full">
                        <span className="truncate">{name}</span>
                        <span className="ml-auto shrink-0 text-xs text-secondary tabular-nums">
                            {item.record?.count ?? ''}
                        </span>
                    </span>
                )}
            />
        </nav>
    )
}
