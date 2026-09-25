// PROTOTYPE (throwaway): the list itself, shared by every layout. It shows the items in the scope folder, with a `..`
// row to go up. In flat mode (or while searching) it shows everything below the scope too, and each title carries its
// path relative to the scope: `Cards / Card expiring reminder`. Layouts without a side tree pass `showFolderRows`.
import { useActions, useValues } from 'kea'

import { IconArrowLeft, IconDecisionTree, IconEllipsis, IconFolder, IconLetter } from '@posthog/icons'
import { LemonButton, LemonCheckbox, LemonMenu, LemonTag, Link } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { LemonTable, LemonTableColumn, LemonTableColumns } from 'lib/lemon-ui/LemonTable'
import { humanFriendlyNumber } from 'lib/utils/numbers'
import { urls } from 'scenes/urls'

import { FolderRow } from '../folders/foldersVariantLogic'
import { findWorkflowFacet, formatFacetValue } from '../shared/workflowFacets'
import { healthOfItem } from '../tags/workflowTagFacets'
import { ColumnKey } from './combinedStore'
import { ListRow, combinedVariantLogic, relativePathOf } from './combinedVariantLogic'
import { RowTagsCell } from './RowTagsCell'
import { SendsCell } from './SendsCell'

const STATUS_TAGS: Record<string, { label: string; type: 'success' | 'default' | 'muted' }> = {
    active: { label: 'Active', type: 'success' },
    draft: { label: 'Draft', type: 'default' },
    archived: { label: 'Archived', type: 'muted' },
}

const HEALTH_TAGS = {
    failing: { label: 'Failing', type: 'danger' },
    healthy: { label: 'Healthy', type: 'success' },
    idle: { label: 'No runs', type: 'muted' },
} as const

function rowLink(row: FolderRow): string | undefined {
    if (row.kind === 'workflow') {
        return row.item.status === 'archived' ? undefined : urls.workflow(row.id, 'workflow')
    }
    return row.kind === 'email_template' ? urls.workflowsLibraryTemplate(row.id) : undefined
}

type ItemRow = Extract<ListRow, { rowType: 'item' }>

function ItemTitle({ row }: { row: FolderRow }): JSX.Element {
    const { scope, effectiveFlat, compact } = useValues(combinedVariantLogic)
    const relative = effectiveFlat ? relativePathOf(row, scope) : []
    const link = rowLink(row)
    const title = (
        // The path gives way before the name does when the row is narrow.
        <span
            className="flex min-w-0 overflow-hidden whitespace-nowrap"
            title={[...relative, row.item.name].join(' / ')}
        >
            {relative.length > 0 && (
                <>
                    <span className="text-secondary truncate min-w-5">{relative.join(' / ')}</span>
                    <span className="text-secondary shrink-0">&nbsp;/&nbsp;</span>
                </>
            )}
            <span
                className={
                    relative.length > 0
                        ? 'font-semibold truncate shrink-0 max-w-[calc(100%-2.5rem)]'
                        : 'font-semibold truncate min-w-0'
                }
            >
                {row.item.name}
            </span>
        </span>
    )
    return (
        <div className="flex items-center gap-2 min-w-0 max-w-52 @2xl:max-w-72 @4xl:max-w-80 @5xl:max-w-md">
            {row.kind === 'workflow' ? (
                <IconDecisionTree className="text-lg text-secondary shrink-0" />
            ) : (
                <IconLetter className="text-lg text-warning shrink-0" />
            )}
            <div className="flex flex-col min-w-0">
                {link ? (
                    <Link
                        to={link}
                        subtle
                        className="flex min-w-0 text-primary"
                        data-attr="workflows-combined-row-link"
                    >
                        {title}
                    </Link>
                ) : (
                    <span className="flex min-w-0">{title}</span>
                )}
                {!compact && row.item.description && (
                    <span className="text-xs text-secondary truncate">{row.item.description}</span>
                )}
            </div>
        </div>
    )
}

function optionalColumn(key: ColumnKey): LemonTableColumn<ListRow, any> {
    const item = (render: (row: FolderRow) => JSX.Element | string | null): ((_: any, row: ListRow) => any) => {
        return (_, row) => (row.rowType === 'item' ? render(row.row) : null)
    }
    switch (key) {
        case 'tags':
            return { title: 'Tags', key, render: item((row) => <RowTagsCell itemId={row.id} />) }
        case 'status':
            return {
                title: 'Status',
                key,
                width: 0,
                render: item((row) => {
                    if (row.kind !== 'workflow') {
                        return <LemonTag type="muted">Template</LemonTag>
                    }
                    const status = STATUS_TAGS[row.item.status]
                    return status ? <LemonTag type={status.type}>{status.label}</LemonTag> : null
                }),
            }
        case 'sends':
            return { title: 'Sends', key, width: 0, render: item((row) => <SendsCell row={row} />) }
        case 'updated':
            return {
                title: 'Updated',
                key,
                width: 0,
                className: 'hidden @2xl:table-cell',
                render: item((row) =>
                    row.item.updatedAt ? <TZLabel time={row.item.updatedAt} className="whitespace-nowrap" /> : null
                ),
            }
        case 'trigger':
            return {
                title: 'Trigger',
                key,
                width: 0,
                render: item((row) =>
                    row.kind === 'workflow' ? (
                        <span className="whitespace-nowrap">
                            {formatFacetValue(findWorkflowFacet('trigger'), row.item.triggerType)}
                        </span>
                    ) : null
                ),
            }
        case 'owner':
            return {
                title: 'Owner',
                key,
                width: 0,
                render: item((row) => (
                    <span className="whitespace-nowrap">{row.item.owners.map((owner) => `@${owner}`).join(', ')}</span>
                )),
            }
        case 'createdBy':
            return {
                title: 'Created by',
                key,
                width: 0,
                render: item((row) => <span className="whitespace-nowrap">{row.item.createdByName ?? ''}</span>),
            }
        case 'last7':
            return {
                title: 'Last 7 days',
                key,
                width: 0,
                render: item((row) => {
                    const metrics = row.item.metrics
                    if (row.kind !== 'workflow' || !metrics) {
                        return null
                    }
                    return (
                        <span className="whitespace-nowrap text-xs" translate="no">
                            {humanFriendlyNumber(metrics.succeeded)} ran
                            {metrics.failed > 0 && (
                                <span className="text-danger"> · {humanFriendlyNumber(metrics.failed)} failed</span>
                            )}
                        </span>
                    )
                }),
            }
        case 'health':
            return {
                title: 'Health',
                key,
                width: 0,
                render: item((row) => {
                    const health = healthOfItem(row.item)
                    return health ? (
                        <LemonTag type={HEALTH_TAGS[health].type}>{HEALTH_TAGS[health].label}</LemonTag>
                    ) : null
                }),
            }
    }
}

export function ItemsTable({ showFolderRows = false }: { showFolderRows?: boolean }): JSX.Element {
    const { contents, childFolders, selectedIds, hasLoaded, entriesLoading, hasActiveQuery, compact, columns, scope } =
        useValues(combinedVariantLogic)
    const { setScope, toggleSelected, setSelectedIds, moveRows } = useActions(combinedVariantLogic)

    const up = contents.filter((row) => row.rowType === 'up')
    const items = contents.filter((row): row is ItemRow => row.rowType === 'item')
    const dataSource: ListRow[] = [...up, ...(showFolderRows ? childFolders : []), ...items]
    const selectableIds = items.filter((row) => row.row.movable).map((row) => row.id)
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id))

    const tableColumns: LemonTableColumns<ListRow> = [
        {
            title: (
                <LemonCheckbox
                    checked={allSelected ? true : selectedIds.length > 0 ? 'indeterminate' : false}
                    onChange={() => setSelectedIds(allSelected ? [] : selectableIds)}
                    disabledReason={selectableIds.length === 0 ? 'Nothing here can be selected' : undefined}
                />
            ),
            width: 0,
            render: (_, row) =>
                row.rowType === 'item' ? (
                    <LemonCheckbox
                        checked={selectedIds.includes(row.id)}
                        onChange={(checked) => toggleSelected([row.id], checked)}
                        disabledReason={row.row.movable ? undefined : 'This item isn’t in the project tree yet'}
                    />
                ) : null,
        },
        {
            title: 'Name',
            key: 'name',
            render: (_, row) => {
                if (row.rowType === 'up') {
                    return (
                        <button
                            type="button"
                            className="flex items-center gap-2 font-semibold cursor-pointer hover:underline"
                            onClick={() => setScope(row.parent)}
                            aria-label="Up one folder"
                            data-attr="workflows-combined-up"
                        >
                            <IconArrowLeft className="text-lg text-secondary rotate-90 shrink-0" />
                            ..
                        </button>
                    )
                }
                if (row.rowType === 'folder') {
                    return (
                        <button
                            type="button"
                            className="flex items-center gap-2 font-semibold cursor-pointer hover:underline"
                            onClick={() => setScope(row.segments)}
                            data-attr="workflows-combined-folder-row"
                        >
                            <IconFolder className="text-lg text-secondary shrink-0" />
                            {row.name}
                            <span className="text-xs text-secondary font-normal" translate="no">
                                {row.count}
                            </span>
                        </button>
                    )
                }
                return <ItemTitle row={row.row} />
            },
        },
        // Updated stays last, after any optional column the view adds.
        ...[...columns.filter((key) => key !== 'updated'), ...columns.filter((key) => key === 'updated')].map(
            optionalColumn
        ),
        {
            width: 0,
            render: (_, row) =>
                row.rowType === 'item' ? (
                    <LemonMenu
                        items={[
                            {
                                label: 'Move to…',
                                onClick: () => moveRows([row.id]),
                                disabledReason: row.row.movable ? undefined : 'This item isn’t in the project tree yet',
                            },
                        ]}
                    >
                        <LemonButton size="xsmall" icon={<IconEllipsis />} aria-label="More actions" />
                    </LemonMenu>
                ) : null,
        },
    ]

    const emptyText = hasActiveQuery
        ? `Nothing ${scope.length ? `in ${scope.join(' / ')} ` : ''}matches. Remove a filter${scope.length ? ' or the folder' : ''} to see more.`
        : 'This folder is empty. Create a workflow here, or move items in with "Move to".'

    return (
        <>
            <LemonTable
                dataSource={dataSource}
                loading={!hasLoaded || entriesLoading}
                rowKey="id"
                columns={tableColumns}
                pagination={{ pageSize: 100 }}
                emptyState={emptyText}
                size={compact ? 'small' : 'middle'}
                rowClassName="group/row"
                data-attr="workflows-combined-contents"
            />
            {items.length === 0 && dataSource.length > 0 && !(showFolderRows && childFolders.length) && (
                <div className="px-2 py-3 text-sm text-secondary" data-attr="workflows-combined-empty">
                    {emptyText}
                </div>
            )}
        </>
    )
}
