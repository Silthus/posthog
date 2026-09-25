// PROTOTYPE (throwaway): where you are on the left, how the list shows on the right.
import { useActions, useValues } from 'kea'

import { IconFolder } from '@posthog/icons'
import { LemonButton, LemonMenu, LemonSwitch, Link } from '@posthog/lemon-ui'

import { combinedVariantLogic, currentSegments, isTemplatesLocation } from './combinedVariantLogic'

export function CombinedBreadcrumbs(): JSX.Element {
    const { location, folderPaths, flat, compact, hasActiveQuery, contents, hasLoaded } =
        useValues(combinedVariantLogic)
    const { setLocation, setFlat, setCompact } = useActions(combinedVariantLogic)
    const segments = currentSegments(location)
    const count = contents.filter((row) => row.rowType === 'item').length

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-8 mb-1">
            <div className="flex flex-wrap items-center gap-1 text-sm min-w-0">
                {/* Below the tree's breakpoint, this menu is the way to reach any folder. */}
                <span className="@3xl:hidden">
                    <LemonMenu
                        items={[
                            { label: 'Workflows', onClick: () => setLocation({ type: 'folder', segments: [] }) },
                            ...folderPaths.map((path) => ({
                                label: `${' '.repeat(path.length - 1)}${path[path.length - 1]}`,
                                onClick: () => setLocation({ type: 'folder', segments: path }),
                            })),
                            { label: 'Workflow templates', onClick: () => setLocation({ type: 'library' }) },
                        ]}
                    >
                        <LemonButton size="xsmall" type="secondary" icon={<IconFolder />}>
                            Folders
                        </LemonButton>
                    </LemonMenu>
                </span>
                {isTemplatesLocation(location) ? (
                    <span className="font-semibold">Workflow templates</span>
                ) : (
                    <>
                        {segments.length ? (
                            <Link subtle onClick={() => setLocation({ type: 'folder', segments: [] })}>
                                Workflows
                            </Link>
                        ) : (
                            <span className="font-semibold">Workflows</span>
                        )}
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
                )}
                {hasLoaded && (
                    <span className="text-secondary text-xs ml-1" translate="no">
                        {count === 1 ? '1 item' : `${count} items`}
                        {hasActiveQuery ? ' match' : ''}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
                <LemonSwitch
                    size="small"
                    label="Flat list"
                    checked={flat}
                    onChange={setFlat}
                    tooltip="Show everything in this folder and its subfolders in one list"
                    disabledReason={isTemplatesLocation(location) ? 'Workflow templates have no subfolders' : undefined}
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
            </div>
        </div>
    )
}
