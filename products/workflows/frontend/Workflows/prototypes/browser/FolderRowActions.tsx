// PROTOTYPE (throwaway): the hover actions at the end of a folder row.
import { useActions, useValues } from 'kea'

import { IconEllipsis, IconFolderPlus, IconPencil, IconTrash } from '@posthog/icons'
import { LemonButton, LemonDialog, LemonMenu } from '@posthog/lemon-ui'

import { combinedVariantLogic } from '../combined/combinedVariantLogic'
import { FolderListRow } from '../combined/ItemsTable'
import { foldersVariantLogic } from '../folders/foldersVariantLogic'
import { browserVariantLogic } from './browserVariantLogic'
import { openFolderNameDialog } from './openFolderNameDialog'

function childNames(folderPaths: string[][], parent: string[]): string[] {
    return folderPaths
        .filter(
            (path) => path.length === parent.length + 1 && parent.every((segment, index) => path[index] === segment)
        )
        .map((path) => path[path.length - 1])
}

export function FolderRowActions({ folder }: { folder: FolderListRow }): JSX.Element {
    const { folderPaths } = useValues(foldersVariantLogic)
    const { createFolderAt } = useActions(combinedVariantLogic)
    const { renameFolder, deleteFolder } = useActions(browserVariantLogic)
    const hasSubfolders = childNames(folderPaths, folder.segments).length > 0
    const isEmpty = folder.count === 0 && !hasSubfolders

    const newSubfolder = (): void =>
        openFolderNameDialog({
            title: `New folder in ${folder.name}`,
            submitLabel: 'Create',
            siblings: childNames(folderPaths, folder.segments),
            onSubmit: (name) => createFolderAt(folder.segments, name),
        })

    return (
        // Clicks stop here, so they don't also open the folder through the row.
        <div className="flex items-center justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
            <span className="opacity-0 group-hover/row:opacity-100 focus-within:opacity-100">
                <LemonButton
                    size="xsmall"
                    icon={<IconFolderPlus />}
                    tooltip={`New folder in ${folder.name}`}
                    aria-label={`New folder in ${folder.name}`}
                    onClick={newSubfolder}
                    data-attr="workflows-browser-folder-new-subfolder"
                />
            </span>
            <LemonMenu
                items={[
                    {
                        label: 'Rename…',
                        icon: <IconPencil />,
                        onClick: () =>
                            openFolderNameDialog({
                                title: `Rename ${folder.name}`,
                                initialName: folder.name,
                                submitLabel: 'Rename',
                                siblings: childNames(folderPaths, folder.segments.slice(0, -1)),
                                onSubmit: (name) => name !== folder.name && renameFolder(folder.segments, name),
                            }),
                        'data-attr': 'workflows-browser-folder-rename',
                    },
                    {
                        label: 'New folder inside…',
                        icon: <IconFolderPlus />,
                        onClick: newSubfolder,
                    },
                    {
                        label: 'Delete',
                        icon: <IconTrash />,
                        status: 'danger',
                        disabledReason: isEmpty ? undefined : 'Move or delete what’s inside this folder first',
                        onClick: () =>
                            LemonDialog.open({
                                title: `Delete ${folder.name}?`,
                                description: 'The folder is empty. Nothing else is deleted.',
                                primaryButton: {
                                    children: 'Delete',
                                    status: 'danger',
                                    onClick: () => deleteFolder(folder.segments),
                                },
                                secondaryButton: { children: 'Cancel' },
                            }),
                        'data-attr': 'workflows-browser-folder-delete',
                    },
                ]}
            >
                <LemonButton
                    size="xsmall"
                    icon={<IconEllipsis />}
                    aria-label={`More actions for ${folder.name}`}
                    data-attr="workflows-browser-folder-menu"
                />
            </LemonMenu>
        </div>
    )
}
