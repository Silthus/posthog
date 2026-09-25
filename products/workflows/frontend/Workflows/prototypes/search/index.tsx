// PROTOTYPE (throwaway): today's table columns, driven by the shared search bar and client-side filters.
import { useActions, useValues } from 'kea'

import { LemonButton, LemonTag, Link } from '@posthog/lemon-ui'

import { AppMetricsSparkline } from 'lib/components/AppMetrics/AppMetricsSparkline'
import { TZLabel } from 'lib/components/TZLabel'
import { LemonTable, LemonTableColumns } from 'lib/lemon-ui/LemonTable'
import { LemonTableLink } from 'lib/lemon-ui/LemonTable/LemonTableLink'
import { ProfilePicture } from 'lib/lemon-ui/ProfilePicture'
import { urls } from 'scenes/urls'

import { WorkflowDispatchSummary } from '../shared/WorkflowDispatchSummary'
import { findWorkflowFacet, formatFacetValue } from '../shared/workflowFacets'
import { WorkflowListItem } from '../shared/workflowListItems'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { WorkflowsSearchBar } from '../shared/WorkflowsSearchBar'

const STATUS_TAGS: Record<string, { label: string; type: 'success' | 'default' | 'muted' | 'highlight' }> = {
    active: { label: 'Active', type: 'success' },
    draft: { label: 'Draft', type: 'default' },
    archived: { label: 'Archived', type: 'muted' },
    template: { label: 'Template', type: 'highlight' },
}

const TYPE_TAGS: Record<string, { label: string; type: 'completion' | 'default' | 'highlight' }> = {
    messaging: { label: 'Messaging', type: 'completion' },
    automation: { label: 'Automation', type: 'default' },
    loop: { label: 'Loop', type: 'highlight' },
}

function itemLink(item: WorkflowListItem): string | undefined {
    return item.kind === 'workflow' ? urls.workflow(item.id, 'workflow') : undefined
}

export function SearchVariant(): JSX.Element {
    const { filteredItems, workflowItems, templateItems, sourcesLoading, hasLoaded, hasActiveQuery } =
        useValues(workflowsPrototypeLogic)
    const { clearAll, addFilter } = useActions(workflowsPrototypeLogic)
    const triggerFacet = findWorkflowFacet('trigger')

    const columns: LemonTableColumns<WorkflowListItem> = [
        {
            title: 'Name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (_, item) =>
                item.kind === 'workflow' && item.status !== 'archived' ? (
                    <LemonTableLink
                        to={itemLink(item)}
                        title={item.name}
                        description={item.description}
                        truncateDescription
                    />
                ) : (
                    <LemonTableLink title={item.name} description={item.description} truncateDescription />
                ),
        },
        {
            title: 'Type',
            width: 0,
            render: (_, item) => <LemonTag type={TYPE_TAGS[item.type].type}>{TYPE_TAGS[item.type].label}</LemonTag>,
        },
        {
            title: 'Trigger',
            width: 0,
            render: (_, item) => (
                <LemonTag
                    type="default"
                    onClick={() => addFilter({ facet: 'trigger', value: item.triggerType, negated: false })}
                    title="Filter by this trigger"
                >
                    {formatFacetValue(triggerFacet, item.triggerType)}
                </LemonTag>
            ),
        },
        {
            title: 'Dispatches',
            width: 0,
            render: (_, item) => <WorkflowDispatchSummary item={item} />,
        },
        {
            title: 'Created by',
            width: 0,
            render: (_, item) =>
                item.createdBy ? (
                    <div className="flex items-center gap-2">
                        <ProfilePicture user={item.createdBy} size="sm" />
                        <span>{item.createdByName}</span>
                    </div>
                ) : (
                    <span className="text-muted">{item.kind === 'template' ? 'PostHog' : 'Unknown'}</span>
                ),
        },
        {
            title: 'Updated',
            key: 'updatedAt',
            width: 0,
            sorter: (a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''),
            render: (_, item) => (item.updatedAt ? <TZLabel time={item.updatedAt} /> : null),
        },
        {
            title: 'Last 7 days',
            width: 0,
            render: (_, item) =>
                item.kind === 'workflow' ? (
                    <Link to={urls.workflow(item.id, 'metrics')}>
                        <AppMetricsSparkline
                            logicKey={item.id}
                            type="line"
                            metricLabels={{ triggered: 'Started', succeeded: 'Completed', failed: 'Failed' }}
                            metricColors={{ triggered: 'blue', succeeded: 'success', failed: 'danger' }}
                            forceParams={{
                                appSource: 'hog_flow_version',
                                appSourceIdPrefix: `${item.id}/`,
                                instanceId: '',
                                metricName: ['triggered', 'succeeded', 'failed'],
                                breakdownBy: 'metric_name',
                                interval: 'day',
                                dateFrom: '-7d',
                            }}
                        />
                    </Link>
                ) : null,
        },
        {
            title: 'Status',
            width: 0,
            render: (_, item) => (
                <LemonTag type={STATUS_TAGS[item.status].type}>{STATUS_TAGS[item.status].label}</LemonTag>
            ),
        },
    ]

    return (
        <div data-attr="workflows-prototype-search-variant">
            <div className="mb-2">
                <WorkflowsSearchBar />
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-2 min-h-7 text-sm">
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
                    <LemonButton
                        size="xsmall"
                        type="tertiary"
                        onClick={clearAll}
                        data-attr="workflows-prototype-clear-all"
                    >
                        Clear all
                    </LemonButton>
                )}
            </div>
            <LemonTable
                dataSource={filteredItems}
                loading={sourcesLoading || !hasLoaded}
                rowKey="id"
                columns={columns}
                pagination={{ pageSize: 30 }}
                nouns={['workflow', 'workflows']}
                emptyState={
                    hasActiveQuery ? (
                        <div className="flex flex-col items-center gap-2 py-4">
                            <span>No workflows or templates match these filters.</span>
                            <LemonButton size="small" type="secondary" onClick={clearAll}>
                                Clear all filters
                            </LemonButton>
                        </div>
                    ) : (
                        'No workflows yet'
                    )
                }
            />
        </div>
    )
}
