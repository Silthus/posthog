// PROTOTYPE (throwaway): the contents pane. Folders first, then workflows, then templates.
import { useActions, useValues } from 'kea'

import { IconDecisionTree, IconEllipsis, IconFolder, IconLetter, IconStack } from '@posthog/icons'
import { LemonButton, LemonCheckbox, LemonMenu, LemonTag, Link } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { LemonTable, LemonTableColumns } from 'lib/lemon-ui/LemonTable'
import { LemonTableLink } from 'lib/lemon-ui/LemonTable/LemonTableLink'
import { pluralize } from 'lib/utils/strings'
import { urls } from 'scenes/urls'

import { WorkflowDispatchSummary } from '../shared/WorkflowDispatchSummary'
import { ContentsRow, FolderRow, foldersVariantLogic } from './foldersVariantLogic'

const STATUS_TAGS: Record<string, { label: string; type: 'success' | 'default' | 'muted' }> = {
    active: { label: 'Active', type: 'success' },
    draft: { label: 'Draft', type: 'default' },
    archived: { label: 'Archived', type: 'muted' },
}

function rowLink(row: FolderRow): string | undefined {
    if (row.kind === 'workflow') {
        return urls.workflow(row.id, 'workflow')
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
    if (row.kind === 'workflow_template') {
        return <IconStack className="text-lg text-accent shrink-0" />
    }
    return <IconLetter className="text-lg text-warning shrink-0" />
}

function KindTag({ row }: { row: FolderRow }): JSX.Element | null {
    if (row.kind === 'workflow') {
        const status = STATUS_TAGS[row.item.status]
        return status ? <LemonTag type={status.type}>{status.label}</LemonTag> : null
    }
    const scope = row.item.templateScope
    return (
        <div className="flex flex-wrap gap-1">
            <LemonTag type={row.kind === 'workflow_template' ? 'highlight' : 'warning'}>
                {row.kind === 'workflow_template' ? 'Workflow template' : 'Email template'}
            </LemonTag>
            {scope === 'global' && <LemonTag type="muted">By PostHog</LemonTag>}
            {scope === 'organization' && <LemonTag type="muted">Organization</LemonTag>}
        </div>
    )
}

export function FolderContents(): JSX.Element {
    const { contents, showFolderColumn, selectedIds, hasLoaded, entriesLoading, hasActiveQuery, location } =
        useValues(foldersVariantLogic)
    const { setLocation, toggleSelected, setSelectedIds, moveRows } = useActions(foldersVariantLogic)

    const selectableIds = contents
        .filter((row): row is Extract<ContentsRow, { rowType: 'item' }> => row.rowType === 'item' && row.row.movable)
        .map((row) => row.id)
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id))

    const columns: LemonTableColumns<ContentsRow> = [
        {
            title: (
                <LemonCheckbox
                    checked={allSelected ? true : selectedIds.length > 0 ? 'indeterminate' : false}
                    onChange={() => setSelectedIds(allSelected ? [] : selectableIds)}
                    disabledReason={selectableIds.length === 0 ? 'Nothing here can be moved' : undefined}
                />
            ),
            width: 0,
            render: (_, row) =>
                row.rowType === 'item' ? (
                    <LemonCheckbox
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        disabledReason={row.row.movable ? undefined : 'Global templates stay in the Library'}
                    />
                ) : null,
        },
        {
            title: 'Name',
            key: 'name',
            render: (_, row) =>
                row.rowType === 'folder' ? (
                    <button
                        type="button"
                        className="flex items-center gap-2 font-semibold text-left cursor-pointer hover:underline"
                        onClick={() => setLocation({ type: 'folder', segments: row.segments })}
                        data-attr="workflows-folders-open-folder"
                    >
                        <IconFolder className="text-lg text-secondary shrink-0" />
                        {row.name}
                    </button>
                ) : (
                    <div className="flex items-center gap-2 min-w-0">
                        <KindIcon row={row.row} />
                        <LemonTableLink
                            to={row.row.item.status === 'archived' ? undefined : rowLink(row.row)}
                            title={
                                row.row.item.path.length ? (
                                    <span>
                                        <span className="text-secondary font-normal">
                                            {row.row.item.name.slice(
                                                0,
                                                row.row.item.name.length - row.row.item.leafName.length
                                            )}
                                        </span>
                                        {row.row.item.leafName}
                                    </span>
                                ) : (
                                    row.row.item.name
                                )
                            }
                            description={row.row.item.description}
                            truncateDescription
                        />
                    </div>
                ),
        },
        ...(showFolderColumn
            ? ([
                  {
                      title: 'Folder',
                      width: 0,
                      render: (_, row) => {
                          if (row.rowType !== 'item') {
                              return null
                          }
                          const segments = row.row.segments
                          if (!segments) {
                              return (
                                  <span className="text-secondary whitespace-nowrap">
                                      {row.row.kind === 'workflow' ? 'Unfiled' : 'Library'}
                                  </span>
                              )
                          }
                          return (
                              <Link
                                  className="whitespace-nowrap"
                                  onClick={() => setLocation({ type: 'folder', segments })}
                                  subtle
                              >
                                  {segments.length ? segments.join(' / ') : 'Workflows'}
                              </Link>
                          )
                      },
                  },
              ] as LemonTableColumns<ContentsRow>)
            : []),
        {
            title: 'Kind',
            width: 0,
            render: (_, row) =>
                row.rowType === 'folder' ? (
                    <span className="text-secondary whitespace-nowrap">{pluralize(row.count, 'item')}</span>
                ) : (
                    <KindTag row={row.row} />
                ),
        },
        {
            title: 'Dispatches',
            width: 0,
            render: (_, row) => (row.rowType === 'item' ? <WorkflowDispatchSummary item={row.row.item} /> : null),
        },
        {
            title: 'Updated',
            width: 0,
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
                                disabledReason: row.row.movable ? undefined : 'Global templates stay in the Library',
                            },
                        ]}
                    >
                        <LemonButton size="small" icon={<IconEllipsis />} aria-label="More actions" />
                    </LemonMenu>
                ) : null,
        },
    ]

    const emptyText = hasActiveQuery
        ? 'Nothing here matches. Try searching all folders.'
        : location.type === 'folder'
          ? 'This folder is empty. Move workflows or templates here with "Move to".'
          : location.type === 'unfiled'
            ? 'Every workflow is in a folder.'
            : 'No templates outside folders.'

    return (
        <LemonTable
            dataSource={contents}
            loading={!hasLoaded || entriesLoading}
            rowKey="id"
            columns={columns}
            pagination={{ pageSize: 50 }}
            emptyState={emptyText}
            size="small"
            data-attr="workflows-folders-contents"
        />
    )
}
