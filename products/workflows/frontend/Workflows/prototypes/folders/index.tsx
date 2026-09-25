import './folderFacet'

// PROTOTYPE (throwaway): the folders variant. Workflows and templates share one project tree folder layout.
import { useActions, useValues } from 'kea'

import { IconFolder, IconFolderMove, IconFolderPlus, IconMagicWand } from '@posthog/icons'
import { LemonButton, LemonInput, LemonMenu, LemonSegmentedButton, LemonSwitch, Link } from '@posthog/lemon-ui'

import { LemonDialog } from 'lib/lemon-ui/LemonDialog'
import { LemonField } from 'lib/lemon-ui/LemonField'
import { pluralize } from 'lib/utils/strings'

import { WorkflowsSearchBar } from '../shared/WorkflowsSearchBar'
import { FolderContents } from './FolderContents'
import { KindFilter, foldersVariantLogic } from './foldersVariantLogic'
import { FolderTreePane } from './FolderTreePane'
import { PrefixToFoldersModal } from './PrefixToFoldersModal'

function FolderBreadcrumbs(): JSX.Element {
    const { location, folderPaths } = useValues(foldersVariantLogic)
    const { setLocation } = useActions(foldersVariantLogic)
    const segments = location.type === 'folder' ? location.segments : []

    return (
        <div className="flex flex-wrap items-center gap-1 min-h-8 mb-1 text-sm">
            {/* Below the tree's breakpoint, this menu is the way to reach any folder. */}
            <span className="@3xl:hidden">
                <LemonMenu
                    items={[
                        { label: 'Workflows', onClick: () => setLocation({ type: 'folder', segments: [] }) },
                        ...folderPaths.map((path) => ({
                            label: `${' '.repeat(path.length - 1)}${path[path.length - 1]}`,
                            onClick: () => setLocation({ type: 'folder', segments: path }),
                        })),
                        { label: 'Unfiled', onClick: () => setLocation({ type: 'unfiled' }) },
                        { label: 'Library', onClick: () => setLocation({ type: 'library' }) },
                    ]}
                >
                    <LemonButton size="xsmall" type="secondary" icon={<IconFolder />}>
                        Folders
                    </LemonButton>
                </LemonMenu>
            </span>
            {location.type === 'folder' ? (
                <>
                    <Link subtle onClick={() => setLocation({ type: 'folder', segments: [] })}>
                        Workflows
                    </Link>
                    {segments.map((segment, index) => (
                        <span key={index} className="flex items-center gap-1">
                            <span className="text-secondary">/</span>
                            {index === segments.length - 1 ? (
                                <span className="font-semibold">{segment}</span>
                            ) : (
                                <Link
                                    subtle
                                    onClick={() =>
                                        setLocation({ type: 'folder', segments: segments.slice(0, index + 1) })
                                    }
                                >
                                    {segment}
                                </Link>
                            )}
                        </span>
                    ))}
                </>
            ) : (
                <span className="font-semibold">
                    {location.type === 'unfiled' ? 'Unfiled workflows' : 'Library templates outside folders'}
                </span>
            )}
        </div>
    )
}

export function FoldersVariant(): JSX.Element {
    const { kindFilter, scope, selectedIds, hasActiveQuery, location, prefixMoveCount, contents } =
        useValues(foldersVariantLogic)
    const { setKindFilter, setScope, moveRows, createFolder, openPrefixModal } = useActions(foldersVariantLogic)

    const openNewFolder = (): void =>
        LemonDialog.openForm({
            title: 'New folder',
            initialValues: { name: '' },
            content: (
                <LemonField name="name">
                    <LemonInput placeholder="Folder name" autoFocus data-attr="workflows-folders-new-folder-name" />
                </LemonField>
            ),
            errors: { name: (name: string) => (!name?.trim() ? 'Give the folder a name' : undefined) },
            onSubmit: ({ name }) => createFolder(name),
        })

    return (
        <div className="@container" data-attr="workflows-prototype-folders-variant">
            <div className="mb-2">
                <WorkflowsSearchBar />
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <LemonSegmentedButton<KindFilter>
                    size="small"
                    value={kindFilter}
                    onChange={setKindFilter}
                    options={[
                        { value: 'all', label: 'All' },
                        { value: 'workflows', label: 'Workflows' },
                        { value: 'templates', label: 'Templates' },
                    ]}
                />
                <LemonSwitch
                    bordered
                    size="small"
                    checked={scope === 'everywhere'}
                    onChange={(checked) => setScope(checked ? 'everywhere' : 'folder')}
                    label="Search all folders"
                    disabledReason={!hasActiveQuery ? 'Add a filter or search text first' : undefined}
                    data-attr="workflows-folders-search-scope"
                />
                <div className="flex-1" />
                {selectedIds.length > 0 && (
                    <LemonButton
                        size="small"
                        type="primary"
                        icon={<IconFolderMove />}
                        onClick={() => moveRows(selectedIds)}
                        data-attr="workflows-folders-bulk-move"
                    >
                        Move {pluralize(selectedIds.length, 'item')} to…
                    </LemonButton>
                )}
                <LemonButton
                    size="small"
                    type="secondary"
                    icon={<IconFolderPlus />}
                    onClick={openNewFolder}
                    disabledReason={location.type !== 'folder' ? 'Open a folder to add one inside it' : undefined}
                    data-attr="workflows-folders-new-folder"
                >
                    New folder
                </LemonButton>
                <LemonButton
                    size="small"
                    type="secondary"
                    icon={<IconMagicWand />}
                    onClick={openPrefixModal}
                    tooltip={
                        prefixMoveCount
                            ? `${pluralize(prefixMoveCount, 'item')} outside a folder have a "::" name prefix`
                            : undefined
                    }
                    data-attr="workflows-folders-prefixes"
                >
                    Prefixes to folders
                    {prefixMoveCount ? <span className="ml-1 text-secondary">({prefixMoveCount})</span> : null}
                </LemonButton>
            </div>
            <div className="flex gap-3 items-start">
                <aside className="hidden @3xl:block w-52 @5xl:w-60 shrink-0 border rounded bg-surface-primary sticky top-0 max-h-[80vh] overflow-y-auto">
                    <FolderTreePane />
                </aside>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <FolderBreadcrumbs />
                        {hasActiveQuery && (
                            <span className="text-secondary text-xs">
                                {pluralize(contents.length, 'match', 'matches')}{' '}
                                {scope === 'everywhere' ? 'in all folders' : 'in this folder and below'}
                            </span>
                        )}
                    </div>
                    <FolderContents />
                </div>
            </div>
            <PrefixToFoldersModal />
        </div>
    )
}
