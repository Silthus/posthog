// PROTOTYPE (throwaway): the row above the list. Where you are on the left. The options menu and the one
// "New workflow" button on the right.
import { useActions, useValues } from 'kea'

import { IconFolder } from '@posthog/icons'
import { LemonButton, LemonMenu, Link } from '@posthog/lemon-ui'

import { combinedVariantLogic, tagsFromFilters } from './combinedVariantLogic'
import { ListOptionsMenu } from './ListOptionsMenu'

export function NewWorkflowButton(): JSX.Element {
    const { scope, filters } = useValues(combinedVariantLogic)
    const { startNewWorkflow } = useActions(combinedVariantLogic)
    const tags = tagsFromFilters(filters)
    const where = scope.length ? `in ${scope.join(' / ')}` : 'unfiled'
    return (
        <LemonButton
            size="small"
            type="primary"
            onClick={startNewWorkflow}
            tooltip={`Pick a template or start with AI. The workflow lands ${where}${tags.length ? `, tagged ${tags.join(', ')}` : ''}.`}
            data-attr="workflows-combined-new-workflow"
        >
            New workflow
        </LemonButton>
    )
}

/** `folderMenuClassName` adds a menu of every folder, for widths or layouts without the tree. */
export function ScopeBreadcrumbs({ folderMenuClassName }: { folderMenuClassName?: string }): JSX.Element {
    const { scope, folderPaths, contents, hasLoaded, hasActiveQuery } = useValues(combinedVariantLogic)
    const { setScope } = useActions(combinedVariantLogic)
    const count = contents.filter((row) => row.rowType === 'item').length

    return (
        <div className="flex flex-wrap items-center gap-1 text-sm min-w-0" data-attr="workflows-combined-breadcrumbs">
            {folderMenuClassName !== undefined && (
                <span className={folderMenuClassName}>
                    <LemonMenu
                        items={[
                            { label: 'Workflows', onClick: () => setScope([]) },
                            ...folderPaths.map((path) => ({
                                label: `${'\u00a0\u00a0\u00a0'.repeat(path.length)}${path[path.length - 1]}`,
                                onClick: () => setScope(path),
                            })),
                        ]}
                    >
                        <LemonButton size="xsmall" type="secondary" icon={<IconFolder />}>
                            Folders
                        </LemonButton>
                    </LemonMenu>
                </span>
            )}
            {scope.length ? (
                <Link subtle onClick={() => setScope([])}>
                    Workflows
                </Link>
            ) : (
                <span className="font-semibold">Workflows</span>
            )}
            {scope.map((segment, index) => (
                <span key={index} className="flex items-center gap-1">
                    <span className="text-secondary">/</span>
                    {index === scope.length - 1 ? (
                        <span className="font-semibold">{segment}</span>
                    ) : (
                        <Link subtle onClick={() => setScope(scope.slice(0, index + 1))}>
                            {segment}
                        </Link>
                    )}
                </span>
            ))}
            {hasLoaded && (
                <span className="text-secondary text-xs ml-1" translate="no">
                    {count === 1 ? '1 item' : `${count} items`}
                    {hasActiveQuery ? ` match${scope.length ? ', subfolders included' : ''}` : ''}
                </span>
            )}
        </div>
    )
}

/** Breadcrumbs, the options menu and New workflow. */
export function ListToolbar({ folderMenuClassName }: { folderMenuClassName?: string }): JSX.Element {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-8 mb-1">
            <ScopeBreadcrumbs folderMenuClassName={folderMenuClassName} />
            <div className="flex items-center gap-2 ml-auto">
                <ListOptionsMenu />
                <NewWorkflowButton />
            </div>
        </div>
    )
}
