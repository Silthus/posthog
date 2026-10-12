import { useActions, useValues } from 'kea'
import { router } from 'kea-router'

import { IconArrowLeft, IconDrag, IconEllipsis, IconFolder, IconLetter } from '@posthog/icons'
import { LemonButton, LemonCheckbox, LemonMenu, LemonTag, Link } from '@posthog/lemon-ui'

import { LemonTable, LemonTableColumn, LemonTableColumns } from 'lib/lemon-ui/LemonTable'
import { LemonTableLink } from 'lib/lemon-ui/LemonTable/LemonTableLink'
import { TreeNodeDraggable, TreeNodeDroppable } from 'lib/lemon-ui/LemonTree/LemonTreeUtils'
import { urls } from 'scenes/urls'

import { getItemId, parentPath } from '~/layout/panel-layout/ProjectTree/utils'

import { WorkflowFolderActions } from './WorkflowFolderActions'
import { WorkflowFolderPath } from './WorkflowFolderPath'
import { workflowFoldersLogic, type WorkflowFolderFileRow } from './workflowFoldersLogic'
import { buildWorkflowsListV2Columns } from './workflowsListV2Columns'
import { workflowsListV2Logic } from './workflowsListV2Logic'

type ContentsRow =
    | WorkflowFolderFileRow
    | { kind: 'folder' | 'up'; id: string; name: string; path: string; count: number }

const SORTING_URL_PARAM = 'order'

const ROW_KIND_RANK: Record<ContentsRow['kind'], number> = { up: 0, folder: 1, workflow: 2, email_template: 3 }

function isNavigationRow(row: ContentsRow): row is Extract<ContentsRow, { kind: 'folder' | 'up' }> {
    return row.kind === 'folder' || row.kind === 'up'
}

export function WorkflowFolderContents(): JSX.Element {
    const {
        folderRows,
        folderTemplates,
        folderFileRows,
        childFolders,
        currentFolder,
        browserReady,
        browserReadyLoading,
        hasActiveQuery,
        selectedFileIds,
        selectableFiles,
        otherProductFileCount,
    } = useValues(workflowFoldersLogic)
    const { openFolder, moveFileToFolder, toggleSelectedFile, setSelectedFiles } = useActions(workflowFoldersLogic)
    const { shownColumns, metricsLoading, listLoaded, serverSearchStatus } = useValues(workflowsListV2Logic)
    const { searchParams } = useValues(router)
    const sortOrder = String(searchParams[SORTING_URL_PARAM] ?? '').startsWith('-') ? -1 : 1
    const keepRowKindsInPlace =
        (compareSameKind: (a: ContentsRow, b: ContentsRow) => number) =>
        (a: ContentsRow, b: ContentsRow): number =>
            sortOrder * (ROW_KIND_RANK[a.kind] - ROW_KIND_RANK[b.kind]) || compareSameKind(a, b)
    const rows: ContentsRow[] = [
        ...(currentFolder
            ? [{ kind: 'up' as const, id: 'up', name: '..', path: parentPath(currentFolder), count: 0 }]
            : []),
        ...childFolders.map((folder) => ({ ...folder, kind: 'folder' as const, id: `folder:${folder.path}` })),
        ...folderFileRows,
    ]
    const columns: LemonTableColumns<ContentsRow> = [
        {
            key: 'select',
            width: 0,
            title: (
                <LemonCheckbox
                    aria-label="Select all movable items"
                    checked={
                        selectedFileIds.length && selectedFileIds.length === Object.keys(selectableFiles).length
                            ? true
                            : selectedFileIds.length
                              ? 'indeterminate'
                              : false
                    }
                    onChange={(checked) => setSelectedFiles(checked ? Object.keys(selectableFiles) : [])}
                />
            ),
            render: (_, item) =>
                item.kind === 'workflow' || item.kind === 'email_template' ? (
                    <LemonCheckbox
                        aria-label={`Select ${item.name}`}
                        checked={selectedFileIds.includes(item.id)}
                        disabledReason={
                            !selectableFiles[item.id] ? 'Editor access is required to move this item' : undefined
                        }
                        onChange={() => toggleSelectedFile(item.id)}
                        stopPropagation
                    />
                ) : null,
        },
        ...buildWorkflowsListV2Columns(shownColumns, metricsLoading).map(
            (column): LemonTableColumn<ContentsRow, keyof ContentsRow | undefined> => ({
                key: column.key,
                title: column.title,
                width: column.width,
                align: column.align,
                sorter:
                    typeof column.sorter === 'function'
                        ? keepRowKindsInPlace((a, b) =>
                              a.kind === 'workflow' && b.kind === 'workflow' && typeof column.sorter === 'function'
                                  ? column.sorter(a.row, b.row)
                                  : a.name.localeCompare(b.name)
                          )
                        : undefined,
                className: `${typeof column.className === 'string' ? column.className : ''} ${['owner', 'updated_at', 'created_by', 'last_7_days', 'health', 'trigger', 'type'].includes(column.key ?? '') ? 'hidden @min-[48rem]/main-content:table-cell' : ''}`,
                render: (_, item, rowIndex, columnIndex) => {
                    if (item.kind === 'workflow') {
                        return column.render?.(undefined, item.row, rowIndex, columnIndex)
                    }
                    if (column.key === 'name') {
                        if (item.kind === 'folder' || item.kind === 'up') {
                            return (
                                <TreeNodeDroppable
                                    id={`project://${item.path}`}
                                    scope="workflow-project-files"
                                    isDroppable
                                >
                                    <LemonButton
                                        size="small"
                                        fullWidth
                                        icon={item.kind === 'up' ? <IconArrowLeft /> : <IconFolder />}
                                        onClick={() => openFolder(item.path || null)}
                                        data-attr="workflows-folder-row"
                                    >
                                        <span className="truncate mr-1">{item.name}</span>
                                        {item.kind === 'folder' && (
                                            <span
                                                className="text-secondary font-normal text-xs"
                                                translate="no"
                                            >{`(${item.count})`}</span>
                                        )}
                                    </LemonButton>
                                </TreeNodeDroppable>
                            )
                        }
                        if (item.kind !== 'email_template') {
                            return null
                        }
                        return (
                            <div className="flex items-center gap-2 min-w-0">
                                <TreeNodeDraggable
                                    id={getItemId(item.entry)}
                                    scope="workflow-project-files"
                                    enableDragging={!['viewer', 'none'].includes(item.entry.user_access_level ?? '')}
                                    className="max-w-8 shrink-0 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
                                >
                                    <LemonButton
                                        size="small"
                                        icon={<IconDrag />}
                                        aria-label={`Drag email template ${item.name}`}
                                        disabled={['viewer', 'none'].includes(item.entry.user_access_level ?? '')}
                                    />
                                </TreeNodeDraggable>
                                <IconLetter className="text-secondary shrink-0" />
                                <WorkflowFolderPath path={item.entry.path} />
                                <LemonTableLink
                                    to={urls.workflowsLibraryTemplate(item.entry.ref ?? '')}
                                    title={item.name}
                                    truncateTitle
                                />
                            </div>
                        )
                    }
                    if (item.kind === 'email_template' && column.key === 'status') {
                        return <LemonTag type="muted">Email template</LemonTag>
                    }
                    if (item.kind === 'email_template' && column.key === 'actions') {
                        return (
                            <LemonMenu
                                items={[
                                    {
                                        label: 'Move to…',
                                        onClick: () => moveFileToFolder(item.entry),
                                        disabledReason: ['viewer', 'none'].includes(item.entry.user_access_level ?? '')
                                            ? 'Editor access is required'
                                            : undefined,
                                    },
                                ]}
                            >
                                <LemonButton
                                    size="small"
                                    icon={<IconEllipsis />}
                                    aria-label={`Actions for ${item.name}`}
                                />
                            </LemonMenu>
                        )
                    }
                    if (item.kind === 'folder' && column.key === 'actions') {
                        return <WorkflowFolderActions path={item.path} count={item.count} />
                    }
                    return null
                },
            })
        ),
    ]
    const empty = hasActiveQuery
        ? 'Nothing matches. Remove a filter or the folder to see more.'
        : currentFolder === 'Unfiled'
          ? 'Every workflow and email template is in a folder.'
          : 'This folder is empty. Create a workflow here, or move items in with “Move to”.'
    return (
        <>
            {otherProductFileCount > 0 && (
                <div className="text-xs text-secondary mb-1" data-attr="workflows-folder-other-product-files">
                    <span>This folder also holds files from other products. </span>
                    <Link to={urls.projectFiles(currentFolder ?? '')}>Open them in project files</Link>
                </div>
            )}
            <LemonTable
                dataSource={rows}
                columns={columns}
                rowKey="id"
                rowClassName="group/row"
                onRow={(item) =>
                    isNavigationRow(item)
                        ? {
                              className: 'cursor-pointer',
                              onClick: (event) => {
                                  if (!(event.target as HTMLElement).closest('button, a, input, [role="menu"]')) {
                                      openFolder(item.path || null)
                                  }
                              },
                          }
                        : {}
                }
                size="small"
                loading={!browserReady || browserReadyLoading || !listLoaded || serverSearchStatus === 'pending'}
                pagination={{ pageSize: 100, useUrl: false }}
                emptyState={empty}
                data-attr="workflows-folder-contents"
            />
            {browserReady &&
                !browserReadyLoading &&
                serverSearchStatus !== 'pending' &&
                listLoaded &&
                folderRows.length === 0 &&
                folderTemplates.length === 0 &&
                childFolders.length === 0 &&
                currentFolder && <div className="px-2 py-3 text-sm text-secondary">{empty}</div>}
        </>
    )
}
