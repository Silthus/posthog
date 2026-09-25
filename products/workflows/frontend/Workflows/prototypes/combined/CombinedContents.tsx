// PROTOTYPE (throwaway): the items in the open folder. No subfolder rows: a `..` row goes up, the tree does the rest.
// With the flat list on, items from subfolders join in, each with its folder path.
import clsx from 'clsx'
import { useActions, useValues } from 'kea'

import { IconArrowLeft, IconDecisionTree, IconEllipsis, IconFolder, IconLetter, IconStack } from '@posthog/icons'
import { LemonButton, LemonCheckbox, LemonMenu, LemonTag, Link } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { LemonTable, LemonTableColumns } from 'lib/lemon-ui/LemonTable'
import { LemonTableLink } from 'lib/lemon-ui/LemonTable/LemonTableLink'
import { urls } from 'scenes/urls'

import { FolderRow } from '../folders/foldersVariantLogic'
import { WorkflowDispatchSummary } from '../shared/WorkflowDispatchSummary'
import {
    CombinedRow,
    combinedVariantLogic,
    currentSegments,
    isTemplatesLocation,
    placementOf,
} from './combinedVariantLogic'
import { RowTagsCell } from './RowTagsCell'

const STATUS_TAGS: Record<string, { label: string; type: 'success' | 'default' | 'muted' }> = {
    active: { label: 'Active', type: 'success' },
    draft: { label: 'Draft', type: 'default' },
    archived: { label: 'Archived', type: 'muted' },
}

function rowLink(row: FolderRow): string | undefined {
    if (row.kind === 'workflow') {
        return row.item.status === 'archived' ? undefined : urls.workflow(row.id, 'workflow')
    }
    if (row.kind === 'email_template') {
        return urls.workflowsLibraryTemplate(row.id)
    }
    return undefined
}

function KindIcon({ row }: { row: FolderRow }): JSX.Element {
    if (row.kind === 'workflow') {
        return <IconDecisionTree className="text-lg text-secondary shrink-0" />
    }
    if (row.kind === 'email_template') {
        return <IconLetter className="text-lg text-warning shrink-0" />
    }
    return <IconStack className="text-lg text-tertiary shrink-0" />
}

function KindTag({ row }: { row: FolderRow }): JSX.Element | null {
    if (row.kind === 'workflow') {
        const status = STATUS_TAGS[row.item.status]
        return status ? <LemonTag type={status.type}>{status.label}</LemonTag> : null
    }
    if (row.kind === 'email_template') {
        return <LemonTag type="warning">Email template</LemonTag>
    }
    return <LemonTag type="muted">Workflow template{row.item.templateScope === 'global' ? ' · PostHog' : ''}</LemonTag>
}

export function CombinedContents(): JSX.Element {
    const {
        contents,
        selectedIds,
        hasLoaded,
        entriesLoading,
        hasActiveQuery,
        location,
        flat,
        compact,
        hiddenBelowCount,
    } = useValues(combinedVariantLogic)
    const { setLocation, toggleSelected, setSelectedIds, moveRows, setFlat } = useActions(combinedVariantLogic)
    const here = currentSegments(location)

    const selectableIds = contents
        .filter((row): row is Extract<CombinedRow, { rowType: 'item' }> => row.rowType === 'item' && row.row.movable)
        .map((row) => row.id)
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id))

    const columns: LemonTableColumns<CombinedRow> = [
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
                        disabledReason={row.row.movable ? undefined : 'Templates by PostHog can’t be moved or tagged'}
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
                            onClick={() => setLocation(row.parent)}
                            aria-label="Up one folder"
                            data-attr="workflows-combined-up"
                        >
                            <IconArrowLeft className="text-lg text-secondary rotate-90 shrink-0" />
                            ..
                        </button>
                    )
                }
                const { item } = row.row
                const placement = placementOf(row.row)
                const relative = flat && Array.isArray(placement) ? placement.slice(here.length) : []
                const prefix = item.name.slice(0, item.name.length - item.leafName.length)
                return (
                    <div className="flex items-center gap-2 min-w-0">
                        <KindIcon row={row.row} />
                        <LemonTableLink
                            to={rowLink(row.row)}
                            title={
                                compact ? (
                                    // Compact rows keep one line, so they drop the `::` prefix the folder already shows.
                                    <span className="whitespace-nowrap" title={item.name}>
                                        {item.leafName}
                                    </span>
                                ) : (
                                    <span>
                                        {prefix && <span className="text-secondary font-normal">{prefix}</span>}
                                        {item.leafName}
                                    </span>
                                )
                            }
                            description={
                                relative.length > 0 ? (
                                    <span>
                                        <Link
                                            subtle
                                            className="inline-flex items-center gap-0.5 text-secondary"
                                            onClick={() =>
                                                setLocation({ type: 'folder', segments: [...here, ...relative] })
                                            }
                                            data-attr="workflows-combined-row-path"
                                        >
                                            <IconFolder className="shrink-0" />
                                            {relative.join(' / ')}
                                        </Link>
                                        {!compact && item.description ? ` · ${item.description}` : null}
                                    </span>
                                ) : compact ? undefined : (
                                    item.description
                                )
                            }
                            truncateDescription
                        />
                    </div>
                )
            },
        },
        {
            title: 'Tags',
            key: 'tags',
            render: (_, row) =>
                row.rowType === 'item' ? <RowTagsCell itemId={row.id} editable={row.row.kind === 'workflow'} /> : null,
        },
        {
            title: 'Kind',
            width: 0,
            render: (_, row) => (row.rowType === 'item' ? <KindTag row={row.row} /> : null),
        },
        {
            title: 'Dispatches',
            width: 0,
            // Narrow scenes drop the lower-value columns before the name starts to squeeze.
            className: 'hidden @5xl:table-cell',
            render: (_, row) => (row.rowType === 'item' ? <WorkflowDispatchSummary item={row.row.item} /> : null),
        },
        {
            title: 'Updated',
            width: 0,
            className: 'hidden @4xl:table-cell',
            render: (_, row) =>
                row.rowType === 'item' && row.row.item.updatedAt ? <TZLabel time={row.row.item.updatedAt} /> : null,
        },
        {
            width: 0,
            render: (_, row) =>
                row.rowType === 'item' ? (
                    <LemonMenu
                        items={[
                            {
                                label: 'Move to…',
                                onClick: () => moveRows([row.id]),
                                disabledReason: row.row.movable
                                    ? undefined
                                    : 'Templates by PostHog stay in the Library',
                            },
                        ]}
                    >
                        <LemonButton size="xsmall" icon={<IconEllipsis />} aria-label="More actions" />
                    </LemonMenu>
                ) : null,
        },
    ]

    const itemCount = contents.filter((row) => row.rowType === 'item').length
    const emptyText = hasActiveQuery
        ? hiddenBelowCount
            ? 'Nothing in this folder matches.'
            : 'Nothing here matches. Change the filters or open another folder.'
        : isTemplatesLocation(location)
          ? 'No workflow templates outside folders.'
          : 'This folder is empty. Create a workflow here, or move items in with "Move to".'

    return (
        <>
            <LemonTable
                dataSource={contents}
                loading={!hasLoaded || entriesLoading}
                rowKey="id"
                columns={columns}
                pagination={{ pageSize: 100 }}
                emptyState={emptyText}
                size={compact ? 'small' : 'middle'}
                rowClassName={(row) =>
                    clsx(row.rowType === 'item' && row.row.kind === 'workflow_template' && 'text-secondary') || null
                }
                data-attr="workflows-combined-contents"
            />
            {itemCount === 0 && contents.length > 0 && (
                <div className="px-2 py-3 text-sm text-secondary" data-attr="workflows-combined-empty">
                    {emptyText}
                </div>
            )}
            {hasActiveQuery && hiddenBelowCount > 0 && (
                <div className="mt-2 text-sm text-secondary" data-attr="workflows-combined-hidden-below">
                    {hiddenBelowCount === 1 ? '1 more match' : `${hiddenBelowCount} more matches`} in subfolders.{' '}
                    <Link onClick={() => setFlat(true)}>Show them in a flat list</Link>
                </div>
            )}
        </>
    )
}
