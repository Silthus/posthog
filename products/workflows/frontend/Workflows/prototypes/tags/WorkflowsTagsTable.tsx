// PROTOTYPE (throwaway): one dense table with optional collapsible group headers. Group headers are rows
// whose name cell spans the table, so the columns stay aligned across groups.
import { useActions, useValues } from 'kea'

import { IconChevronDown, IconChevronRight } from '@posthog/icons'
import { LemonButton, LemonCheckbox, LemonTag, Link } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { useResizeBreakpoints } from 'lib/hooks/useResizeObserver'
import { LemonTable, LemonTableColumn } from 'lib/lemon-ui/LemonTable'
import { ProfilePicture } from 'lib/lemon-ui/ProfilePicture'
import { colorForString } from 'lib/utils/colors'
import { urls } from 'scenes/urls'

import { WorkflowDispatchSummary } from '../shared/WorkflowDispatchSummary'
import { findWorkflowFacet, formatFacetValue } from '../shared/workflowFacets'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { TagsTableRow, workflowsTagsVariantLogic } from './workflowsTagsVariantLogic'
import { WorkflowTagsCell } from './WorkflowTagsCell'

const STATUS_TAGS: Record<string, { label: string; type: 'success' | 'default' | 'muted' | 'highlight' }> = {
    active: { label: 'Active', type: 'success' },
    draft: { label: 'Draft', type: 'default' },
    archived: { label: 'Archived', type: 'muted' },
    template: { label: 'Template', type: 'highlight' },
}

const HIDDEN_CELL = { children: null, props: { hidden: true } }

type Column = LemonTableColumn<TagsTableRow, keyof TagsTableRow | undefined>

export function WorkflowsTagsTable(): JSX.Element {
    const { rows, compact, selectedIds, groupBy, store } = useValues(workflowsTagsVariantLogic)
    const { toggleGroup, toggleSelected } = useActions(workflowsTagsVariantLogic)
    const { sourcesLoading, hasLoaded, hasActiveQuery } = useValues(workflowsPrototypeLogic)
    const { clearAll, addFilter } = useActions(workflowsPrototypeLogic)
    const { ref, size } = useResizeBreakpoints({ 0: 'narrow', 900: 'medium', 1240: 'wide' })
    const wide = size === 'wide'
    const medium = size !== 'narrow'
    const selected = new Set(selectedIds)
    const triggerFacet = findWorkflowFacet('trigger')

    const dataColumns: Column[] = [
        {
            title: 'Name',
            key: 'name',
            render: (_, row) => {
                if (row.kind === 'group') {
                    return null
                }
                const { item } = row
                const title = (
                    <span className="flex items-baseline gap-1 min-w-0">
                        {item.path.length > 0 && (
                            <span className="text-secondary shrink-0">{item.path.join(' / ')} /</span>
                        )}
                        <span className="truncate font-semibold">{item.leafName}</span>
                    </span>
                )
                return (
                    <div className="min-w-0 max-w-120" title={item.name}>
                        {item.kind === 'workflow' ? (
                            <Link to={urls.workflow(item.id, 'workflow')} subtle className="block">
                                {title}
                            </Link>
                        ) : (
                            title
                        )}
                        {!compact && item.description && (
                            <div className="text-secondary text-xs truncate">{item.description}</div>
                        )}
                    </div>
                )
            },
        },
        {
            title: 'Tags',
            key: 'tags',
            render: (_, row) => (row.kind === 'item' ? <WorkflowTagsCell item={row.item} rowKey={row.rowKey} /> : null),
        },
        {
            title: 'Trigger',
            key: 'trigger',
            width: 0,
            isHidden: !medium,
            render: (_, row) =>
                row.kind === 'item' ? (
                    <span
                        className="block max-w-28 truncate text-secondary"
                        title={formatFacetValue(triggerFacet, row.item.triggerType)}
                    >
                        {formatFacetValue(triggerFacet, row.item.triggerType)}
                    </span>
                ) : null,
        },
        {
            title: 'Sends',
            key: 'dispatches',
            width: 0,
            render: (_, row) => (row.kind === 'item' ? <WorkflowDispatchSummary item={row.item} /> : null),
        },
        {
            title: 'Runs, 7 days',
            key: 'runs',
            width: 0,
            align: 'right',
            render: (_, row) => {
                if (row.kind === 'group' || row.item.kind !== 'workflow') {
                    return null
                }
                const metrics = row.item.metrics
                if (!metrics || (!metrics.succeeded && !metrics.failed)) {
                    return <span className="text-secondary">None</span>
                }
                return (
                    <span className="whitespace-nowrap" translate="no">
                        <span>{metrics.succeeded.toLocaleString()}</span>
                        {metrics.failed > 0 && (
                            <span className="text-danger font-semibold">{` · ${metrics.failed} failed`}</span>
                        )}
                    </span>
                )
            },
        },
        {
            title: 'Owner',
            key: 'owner',
            width: 0,
            render: (_, row) =>
                row.kind === 'item' && row.item.owners.length ? (
                    <span className="whitespace-nowrap text-secondary" translate="no">
                        {row.item.owners.map((owner) => `@${owner}`).join(', ')}
                    </span>
                ) : null,
        },
        {
            title: 'By',
            key: 'createdBy',
            width: 0,
            isHidden: !wide,
            render: (_, row) =>
                row.kind === 'item' && row.item.createdBy ? (
                    <span title={row.item.createdByName ?? undefined}>
                        <ProfilePicture user={row.item.createdBy} size="sm" />
                    </span>
                ) : null,
        },
        {
            title: 'Updated',
            key: 'updated',
            width: 0,
            isHidden: !medium,
            render: (_, row) =>
                row.kind === 'item' && row.item.updatedAt ? (
                    <TZLabel time={row.item.updatedAt} className="whitespace-nowrap" />
                ) : null,
        },
        {
            title: 'Status',
            key: 'status',
            width: 0,
            render: (_, row) =>
                row.kind === 'item' ? (
                    <LemonTag size="small" type={STATUS_TAGS[row.item.status].type}>
                        {STATUS_TAGS[row.item.status].label}
                    </LemonTag>
                ) : null,
        },
    ]
    const visibleDataColumns = dataColumns.filter((column) => !column.isHidden).length

    const selectColumn: Column = {
        key: 'select',
        width: 0,
        render: (_, row) => {
            if (row.kind === 'group') {
                const ids = row.group.items.filter((item) => item.kind === 'workflow').map((item) => item.id)
                const count = ids.filter((id) => selected.has(id)).length
                return ids.length ? (
                    <LemonCheckbox
                        checked={count === 0 ? false : count === ids.length ? true : 'indeterminate'}
                        onChange={(checked) => toggleSelected(ids, checked)}
                        aria-label={`Select every workflow in ${row.group.label}`}
                    />
                ) : null
            }
            return row.item.kind === 'workflow' ? (
                <LemonCheckbox
                    checked={selected.has(row.item.id)}
                    onChange={(checked) => toggleSelected([row.item.id], checked)}
                    aria-label={`Select ${row.item.name}`}
                />
            ) : null
        },
    }

    // A group header's name cell spans every data column, so the other data cells of that row are hidden.
    const columns: Column[] = [
        selectColumn,
        ...dataColumns.map(
            (column, index): Column => ({
                ...column,
                render: (value, row, rowIndex, rowCount) => {
                    if (row.kind !== 'group') {
                        return column.render?.(value, row, rowIndex, rowCount)
                    }
                    if (index > 0) {
                        return HIDDEN_CELL
                    }
                    const { group } = row
                    return {
                        props: { colSpan: visibleDataColumns },
                        children: (
                            <div className="flex items-center gap-2">
                                <LemonButton
                                    size="xsmall"
                                    icon={row.collapsed ? <IconChevronRight /> : <IconChevronDown />}
                                    onClick={() => toggleGroup(group.key)}
                                    aria-expanded={!row.collapsed}
                                    data-attr="workflows-tags-group-toggle"
                                >
                                    {groupBy.key === 'tag' && group.value ? (
                                        <LemonTag size="small" type={colorForString(group.value)}>
                                            {group.label}
                                        </LemonTag>
                                    ) : (
                                        <span className="font-semibold">{group.label}</span>
                                    )}
                                </LemonButton>
                                <span className="text-secondary" translate="no">
                                    {group.items.length}
                                </span>
                                {groupBy.facet && group.value && (
                                    <LemonButton
                                        size="xsmall"
                                        type="tertiary"
                                        onClick={() =>
                                            addFilter({ facet: groupBy.facet!, value: group.value!, negated: false })
                                        }
                                        data-attr="workflows-tags-group-filter"
                                    >
                                        Show only this group
                                    </LemonButton>
                                )}
                            </div>
                        ),
                    }
                },
            })
        ),
    ]

    return (
        <div ref={ref}>
            <LemonTable
                dataSource={rows}
                columns={columns}
                rowKey="rowKey"
                size="small"
                loading={sourcesLoading || !hasLoaded || !store}
                loadingSkeletonRows={12}
                rowClassName={(row) => (row.kind === 'group' ? 'bg-surface-secondary' : null)}
                nouns={['workflow', 'workflows']}
                emptyState={
                    hasActiveQuery ? (
                        <div className="flex flex-col items-center gap-2 py-4">
                            <span>No workflows or templates match these filters.</span>
                            <LemonButton size="small" type="secondary" onClick={clearAll}>
                                Clear filters
                            </LemonButton>
                        </div>
                    ) : (
                        'No workflows yet'
                    )
                }
                data-attr="workflows-tags-table"
            />
        </div>
    )
}
