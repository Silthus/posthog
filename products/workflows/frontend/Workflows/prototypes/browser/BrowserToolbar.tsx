// PROTOTYPE (throwaway): the row above the browser variant's list.
import { useActions, useValues } from 'kea'

import { IconFolderPlus } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { combinedVariantLogic } from '../combined/combinedVariantLogic'
import { ListOptionsMenu } from '../combined/ListOptionsMenu'
import { NewWorkflowButton, ScopeBreadcrumbs } from '../combined/ListToolbar'
import { FolderJumpButton } from './FolderJumpButton'
import { openFolderNameDialog } from './openFolderNameDialog'

export function BrowserToolbar(): JSX.Element {
    const { scope, folderPaths } = useValues(combinedVariantLogic)
    const { createFolderAt } = useActions(combinedVariantLogic)
    const here = scope.length ? scope[scope.length - 1] : 'Workflows'
    const siblings = folderPaths
        .filter((path) => path.length === scope.length + 1 && scope.every((segment, index) => path[index] === segment))
        .map((path) => path[path.length - 1])

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-8 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
                <FolderJumpButton />
                <ScopeBreadcrumbs />
                <LemonButton
                    size="xsmall"
                    type="tertiary"
                    icon={<IconFolderPlus />}
                    tooltip={`New folder in ${here}`}
                    onClick={() =>
                        openFolderNameDialog({
                            title: `New folder in ${here}`,
                            submitLabel: 'Create',
                            siblings,
                            onSubmit: (name) => createFolderAt(scope, name),
                        })
                    }
                    data-attr="workflows-browser-new-folder"
                >
                    New folder
                </LemonButton>
            </div>
            <div className="flex items-center gap-2 ml-auto">
                <ListOptionsMenu />
                <NewWorkflowButton />
            </div>
        </div>
    )
}
