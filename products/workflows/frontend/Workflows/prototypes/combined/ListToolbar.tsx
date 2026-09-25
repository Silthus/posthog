// PROTOTYPE (throwaway): the row above the list. Where you are on the left. How the list shows, and the one
// "New workflow" button, on the right.
import { useActions, useValues } from 'kea'

import { IconEllipsis, IconFolder, IconPalette } from '@posthog/icons'
import { LemonButton, LemonMenu, LemonSwitch, Link } from '@posthog/lemon-ui'

import { ColumnPicker } from './ColumnPicker'
import { combinedVariantLogic, tagsFromFilters } from './combinedVariantLogic'

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
                                label: `${' '.repeat(path.length - 1)}${path[path.length - 1]}`,
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

export function DisplayOptions(): JSX.Element {
    const { flat, compact, hasActiveQuery } = useValues(combinedVariantLogic)
    const { setFlat, setCompact, setManageTagsOpen } = useActions(combinedVariantLogic)
    return (
        <div className="flex items-center gap-2">
            <LemonSwitch
                size="small"
                label="Flat list"
                checked={flat || hasActiveQuery}
                onChange={setFlat}
                tooltip="Show everything in this folder and its subfolders in one list"
                disabledReason={hasActiveQuery ? 'Search results always include subfolders' : undefined}
                data-attr="workflows-combined-flat"
            />
            <LemonSwitch
                size="small"
                label="Compact"
                checked={compact}
                onChange={setCompact}
                tooltip="One line per row, without descriptions"
                data-attr="workflows-combined-compact"
            />
            <ColumnPicker />
            <LemonMenu
                items={[
                    {
                        label: 'Manage tags',
                        icon: <IconPalette />,
                        onClick: () => setManageTagsOpen(true),
                        'data-attr': 'workflows-combined-manage-tags-open',
                    },
                ]}
            >
                <LemonButton size="small" type="tertiary" icon={<IconEllipsis />} aria-label="More options" />
            </LemonMenu>
        </div>
    )
}

/** Breadcrumbs, display options and New workflow. */
export function ListToolbar({ folderMenuClassName }: { folderMenuClassName?: string }): JSX.Element {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-8 mb-1">
            <ScopeBreadcrumbs folderMenuClassName={folderMenuClassName} />
            <div className="flex items-center gap-2 ml-auto">
                <DisplayOptions />
                <NewWorkflowButton />
            </div>
        </div>
    )
}
