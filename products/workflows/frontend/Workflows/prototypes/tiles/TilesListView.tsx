// PROTOTYPE (throwaway): the list side of the list/tile switch. Same summaries as the tiles, as table rows.
import { useActions, useValues } from 'kea'

import { IconSidePanel } from '@posthog/icons'
import { LemonButton, LemonTag } from '@posthog/lemon-ui'

import { LemonTable, LemonTableColumns } from 'lib/lemon-ui/LemonTable'
import { LemonTableLink } from 'lib/lemon-ui/LemonTable/LemonTableLink'
import { urls } from 'scenes/urls'

import type { WorkflowListItem } from '../shared/workflowListItems'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { ActivitySparkline } from './ActivitySparkline'
import { DispatchList } from './DispatchList'
import { FlowStrip } from './FlowStrip'
import { tilesVariantLogic } from './tilesVariantLogic'
import { TriggerLine } from './TriggerLine'
import { STATUS_TAGS, startFromTemplate, useTileSummary } from './WorkflowTile'

function TriggerCell({ item }: { item: WorkflowListItem }): JSX.Element {
    const { trigger, steps } = useTileSummary(item)
    return (
        <div className="flex flex-col gap-1 min-w-0 max-w-60">
            <TriggerLine trigger={trigger} />
            <FlowStrip triggerKind={trigger.kind} steps={steps} showCounts={false} />
        </div>
    )
}

function DispatchCell({ item }: { item: WorkflowListItem }): JSX.Element {
    const { dispatches } = useTileSummary(item)
    return (
        <div className="max-w-56">
            <DispatchList item={item} dispatches={dispatches} limit={2} />
        </div>
    )
}

export function TilesListView({ emptyState }: { emptyState: JSX.Element | string }): JSX.Element {
    const { filteredItems, sourcesLoading, hasLoaded } = useValues(workflowsPrototypeLogic)
    const { openPeek } = useActions(tilesVariantLogic)

    const columns: LemonTableColumns<WorkflowListItem> = [
        {
            title: 'Name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (_, item) => (
                <div className="flex flex-col items-start gap-1 min-w-36">
                    <LemonTableLink
                        to={item.kind === 'workflow' ? urls.workflow(item.id, 'workflow') : undefined}
                        title={item.leafName}
                        description={item.path.join(' / ') || undefined}
                    />
                    <div className="flex items-center gap-1">
                        <LemonTag type={STATUS_TAGS[item.status].type}>{STATUS_TAGS[item.status].label}</LemonTag>
                        {item.kind === 'template' ? (
                            <LemonButton size="xsmall" type="secondary" onClick={() => startFromTemplate(item)}>
                                Use template
                            </LemonButton>
                        ) : null}
                        <LemonButton
                            size="xsmall"
                            icon={<IconSidePanel />}
                            tooltip="Quick look"
                            onClick={() => openPeek(item.id)}
                        />
                    </div>
                </div>
            ),
        },
        { title: 'Trigger and flow', render: (_, item) => <TriggerCell item={item} /> },
        { title: 'Dispatches', render: (_, item) => <DispatchCell item={item} /> },
        {
            title: 'Last 7 days',
            width: 0,
            render: (_, item) => (item.kind === 'workflow' ? <ActivitySparkline workflowId={item.id} /> : null),
        },
    ]

    return (
        <LemonTable
            dataSource={filteredItems}
            loading={sourcesLoading || !hasLoaded}
            rowKey="id"
            columns={columns}
            pagination={{ pageSize: 30 }}
            nouns={['workflow', 'workflows']}
            emptyState={emptyState}
        />
    )
}
