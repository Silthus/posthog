import { useValues } from 'kea'

import { IconFolderPlus } from '@posthog/icons'
import { LemonButton, LemonInput } from '@posthog/lemon-ui'

import { LemonDialog } from 'lib/lemon-ui/LemonDialog'
import { LemonField } from 'lib/lemon-ui/LemonField'

import { joinPath, splitPath } from '~/layout/panel-layout/ProjectTree/utils'

import { workflowFoldersLogic } from './workflowFoldersLogic'

export function WorkflowNewFolderButton({
    parent,
    iconOnly = false,
}: {
    parent: string
    iconOnly?: boolean
}): JSX.Element {
    const { creatingFolder, folderPaths } = useValues(workflowFoldersLogic)
    const label = `New folder in ${parent || 'the project root'}`
    return (
        <LemonButton
            size="xsmall"
            icon={<IconFolderPlus />}
            aria-label={label}
            tooltip={label}
            loading={creatingFolder}
            disabledReason={parent === 'Unfiled' ? 'Open a project folder to add a subfolder' : undefined}
            onClick={() =>
                LemonDialog.openForm({
                    title: label,
                    initialValues: { name: '' },
                    content: (
                        <LemonField name="name">
                            <LemonInput placeholder="Folder name" autoFocus />
                        </LemonField>
                    ),
                    errors: {
                        name: (name: string) =>
                            !name.trim()
                                ? 'Give the folder a name'
                                : name.includes('/')
                                  ? 'Folder names cannot contain /'
                                  : folderPaths.some(
                                          (path) =>
                                              path.toLowerCase() ===
                                              joinPath([...splitPath(parent), name.trim()]).toLowerCase()
                                      )
                                    ? 'A folder with this name already exists'
                                    : undefined,
                    },
                    shouldAwaitSubmit: true,
                    onSubmit: async ({ name }) => {
                        await workflowFoldersLogic.asyncActions.createFolder(name.trim(), parent)
                        if (workflowFoldersLogic.values.folderCreationError) {
                            throw workflowFoldersLogic.values.folderCreationError
                        }
                    },
                })
            }
            data-attr="workflows-new-folder"
        >
            {iconOnly ? null : 'New folder'}
        </LemonButton>
    )
}
