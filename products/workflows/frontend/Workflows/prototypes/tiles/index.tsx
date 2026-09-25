// PROTOTYPE (throwaway): the tiles variant. A tile grid with a list/tile switch under the shared search
// bar. Each tile shows the trigger, the flow shape and what the workflow dispatches, so you can tell what
// it does without opening it.
import { useActions, useValues } from 'kea'

import { IconApps, IconList } from '@posthog/icons'
import { LemonButton, LemonSegmentedButton, LemonSkeleton } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { filterKey } from '../shared/workflowFacets'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { WorkflowsSearchBar } from '../shared/WorkflowsSearchBar'
import { TilesListView } from './TilesListView'
import { TilesViewMode, TilesDensity, tilesVariantLogic } from './tilesVariantLogic'
import { WorkflowPeekDrawer } from './WorkflowPeekDrawer'
import { WorkflowTile } from './WorkflowTile'

const TEMPLATES_ONLY = { facet: 'is', value: 'template', negated: false }

export function TilesVariant(): JSX.Element {
    const { filteredItems, workflowItems, templateItems, hasLoaded, hasActiveQuery, filters } =
        useValues(workflowsPrototypeLogic)
    const { clearAll, addFilter, removeFilter } = useActions(workflowsPrototypeLogic)
    const { viewMode, density, visibleItems } = useValues(tilesVariantLogic)
    const { setViewMode, setDensity, showMore } = useActions(tilesVariantLogic)
    const templatesOnly = filters.some((filter) => filterKey(filter) === filterKey(TEMPLATES_ONLY))

    const emptyState = hasActiveQuery ? (
        <div className="flex flex-col items-center gap-2 py-4">
            <span>No workflows or templates match these filters.</span>
            <LemonButton size="small" type="secondary" onClick={clearAll}>
                Clear all filters
            </LemonButton>
        </div>
    ) : (
        'No workflows yet'
    )

    return (
        <div data-attr="workflows-prototype-tiles-variant">
            <div className="mb-2">
                <WorkflowsSearchBar />
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3 min-h-7 text-sm">
                {hasLoaded ? (
                    <span className="text-secondary" translate="no">
                        {hasActiveQuery
                            ? `${filteredItems.length} of ${workflowItems.length + templateItems.length} match`
                            : `${workflowItems.length} workflows and ${templateItems.length} templates`}
                    </span>
                ) : (
                    <span className="text-secondary">Loading workflows…</span>
                )}
                {hasActiveQuery && (
                    <LemonButton size="xsmall" type="tertiary" onClick={clearAll}>
                        Clear all
                    </LemonButton>
                )}
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                    <LemonButton
                        size="small"
                        type={templatesOnly ? 'primary' : 'secondary'}
                        onClick={() => (templatesOnly ? removeFilter(TEMPLATES_ONLY) : addFilter(TEMPLATES_ONLY))}
                        data-attr="workflows-prototype-templates-only"
                    >
                        Templates only
                    </LemonButton>
                    {viewMode === 'tiles' ? (
                        <LemonSegmentedButton<TilesDensity>
                            size="small"
                            value={density}
                            onChange={setDensity}
                            options={[
                                { value: 'comfortable', label: 'Detailed' },
                                { value: 'compact', label: 'Compact' },
                            ]}
                        />
                    ) : null}
                    <LemonSegmentedButton<TilesViewMode>
                        size="small"
                        value={viewMode}
                        onChange={setViewMode}
                        options={[
                            { value: 'tiles', icon: <IconApps />, label: 'Tiles' },
                            { value: 'list', icon: <IconList />, label: 'List' },
                        ]}
                        data-attr="workflows-prototype-view-switch"
                    />
                </div>
            </div>

            {viewMode === 'list' ? (
                <TilesListView emptyState={emptyState} />
            ) : !hasLoaded ? (
                <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]">
                    {Array.from({ length: 6 }, (_, index) => (
                        <LemonSkeleton key={index} className="h-56" />
                    ))}
                </div>
            ) : filteredItems.length === 0 ? (
                <div className="border rounded bg-surface-primary p-6 text-center">{emptyState}</div>
            ) : (
                <>
                    <div
                        className={cn(
                            'grid gap-3',
                            density === 'compact'
                                ? 'grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]'
                                : 'grid-cols-[repeat(auto-fill,minmax(19rem,1fr))]'
                        )}
                    >
                        {visibleItems.map((item) => (
                            <WorkflowTile key={item.id} item={item} />
                        ))}
                    </div>
                    {visibleItems.length < filteredItems.length ? (
                        <div className="flex flex-col items-center gap-1 mt-4">
                            <span className="text-xs text-secondary" translate="no">
                                {`Showing ${visibleItems.length} of ${filteredItems.length}`}
                            </span>
                            <LemonButton type="secondary" size="small" onClick={showMore}>
                                Show more
                            </LemonButton>
                        </div>
                    ) : null}
                </>
            )}
            <WorkflowPeekDrawer />
        </div>
    )
}
