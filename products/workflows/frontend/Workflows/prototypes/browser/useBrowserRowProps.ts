// PROTOTYPE (throwaway): folder rows open on click and take dropped item rows.
import { useActions, useValues } from 'kea'
import { DragEvent, HTMLProps, useState } from 'react'

import type { ListRow } from '../combined/combinedVariantLogic'
import { combinedVariantLogic } from '../combined/combinedVariantLogic'
import { browserVariantLogic } from './browserVariantLogic'

const DRAG_TYPE = 'application/x-posthog-workflow-rows'

type RowProps = Omit<HTMLProps<HTMLTableRowElement>, 'key'>

function dropTarget(row: ListRow): string[] | null {
    if (row.rowType === 'folder') {
        return row.segments
    }
    return row.rowType === 'up' ? row.parent : null
}

export function useBrowserRowProps(): (row: ListRow) => RowProps {
    const { selectedIds } = useValues(combinedVariantLogic)
    const { setScope } = useActions(combinedVariantLogic)
    const { moveIdsToFolder } = useActions(browserVariantLogic)
    const [overId, setOverId] = useState<string | null>(null)

    const accepts = (event: DragEvent): boolean => event.dataTransfer.types.includes(DRAG_TYPE)

    return (row) => {
        if (row.rowType === 'item') {
            if (!row.row.movable) {
                return {}
            }
            return {
                draggable: true,
                onDragStart: (event) => {
                    const ids = selectedIds.includes(row.id) ? selectedIds : [row.id]
                    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
                    event.dataTransfer.effectAllowed = 'move'
                },
                onDragEnd: () => setOverId(null),
                className: 'cursor-grab active:cursor-grabbing',
            }
        }
        const target = dropTarget(row)
        if (!target) {
            return {}
        }
        return {
            onClick: (event) => {
                // The name button handles its own click.
                if (!(event.target as HTMLElement).closest('button, a')) {
                    setScope(target)
                }
            },
            onDragOver: (event) => {
                if (accepts(event)) {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    if (overId !== row.id) {
                        setOverId(row.id)
                    }
                }
            },
            onDragLeave: (event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setOverId((current) => (current === row.id ? null : current))
                }
            },
            onDrop: (event) => {
                event.preventDefault()
                setOverId(null)
                const ids = JSON.parse(event.dataTransfer.getData(DRAG_TYPE) || '[]') as string[]
                if (ids.length) {
                    moveIdsToFolder(ids, target)
                }
            },
            className: overId === row.id ? 'bg-accent-highlight-secondary outline outline-2 outline-accent' : undefined,
        }
    }
}
