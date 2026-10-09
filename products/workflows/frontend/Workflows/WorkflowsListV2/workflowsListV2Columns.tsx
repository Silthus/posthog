import { LemonTag, Link, Spinner, Tooltip } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { LemonTableColumn } from 'lib/lemon-ui/LemonTable'
import { ProfilePicture } from 'lib/lemon-ui/ProfilePicture'
import { urls } from 'scenes/urls'

import { UserBasicType } from '~/types'

import { WorkflowStatusTag } from '../WorkflowStatusTag'
import { HEALTH_TAGS, OPTIONAL_COLUMN_TITLES, OptionalColumn, TRIGGER_LABELS, TYPE_LABELS } from './workflowListLabels'
import { WorkflowListNameCell } from './WorkflowListNameCell'
import { WorkflowLibraryRow, WorkflowRunCounts, workflowLibraryObject } from './workflowListRows'
import { WorkflowRowMenu } from './WorkflowRowMenu'
import { WorkflowTagsCell } from './WorkflowTagsCell'

type Column = LemonTableColumn<WorkflowLibraryRow, keyof WorkflowLibraryRow | undefined>

const TYPE_TAGS = { messaging: 'completion', automation: 'default', loop: 'highlight' } as const

const countsLabel = ({ failed, succeeded }: WorkflowRunCounts): string => `${failed} failed · ${succeeded} succeeded`

function MetricsPending({ metricsLoading }: { metricsLoading: boolean }): JSX.Element {
    return metricsLoading ? (
        <Spinner />
    ) : (
        <Tooltip title="Couldn't load run counts. Reload the page to try again.">
            <span className="text-muted">Unavailable</span>
        </Tooltip>
    )
}

function optionalRenderers(metricsLoading: boolean): Record<OptionalColumn, Column['render']> {
    return {
        type: (_, row) => {
            if (row.kind === 'email_template') {
                return <LemonTag type="default">Email template</LemonTag>
            }
            if (row.workflow.type === 'broadcast') {
                return null
            }
            const tag = <LemonTag type={TYPE_TAGS[row.workflow.type]}>{TYPE_LABELS[row.workflow.type]}</LemonTag>
            return row.workflow.type === 'loop' ? <Link to={urls.codeLoopLink(row.id)}>{tag}</Link> : tag
        },
        trigger: (_, row) =>
            row.kind === 'workflow' && row.triggerType ? (
                <LemonTag type="default">{TRIGGER_LABELS[row.triggerType] ?? row.triggerType}</LemonTag>
            ) : null,
        owner: (_, row) => (
            <span className="whitespace-nowrap">
                {row.kind === 'workflow' ? row.owners.map((owner) => `@${owner}`).join(', ') : null}
            </span>
        ),
        created_by: (_, row) => {
            const user = workflowLibraryObject(row).created_by
            if (!user) {
                return <span className="text-muted">Unknown</span>
            }
            return (
                <div className="flex items-center gap-2 whitespace-nowrap">
                    <ProfilePicture user={user as UserBasicType} size="sm" />
                    <span>{user.first_name || user.email}</span>
                </div>
            )
        },
        last_7_days: (_, row) =>
            row.kind === 'email_template' ? null : row.last7Days ? (
                <Link to={urls.workflow(row.id, 'metrics')} className="whitespace-nowrap">
                    {countsLabel(row.last7Days)}
                </Link>
            ) : (
                <MetricsPending metricsLoading={metricsLoading} />
            ),
        health: (_, row) => {
            if (row.kind === 'email_template') {
                return null
            }
            if (!row.last7Days) {
                return <MetricsPending metricsLoading={metricsLoading} />
            }
            const tag = HEALTH_TAGS[row.health]
            return (
                <Tooltip title={`${countsLabel(row.last7Days)} in the last 7 days`}>
                    <LemonTag type={tag.type}>{tag.label}</LemonTag>
                </Tooltip>
            )
        },
    }
}

export function buildWorkflowsListV2Columns(visibleColumns: OptionalColumn[], metricsLoading: boolean): Column[] {
    const renderers = optionalRenderers(metricsLoading)
    const optionalColumn = (column: OptionalColumn): Column => ({
        title: OPTIONAL_COLUMN_TITLES[column],
        key: column,
        width: 0,
        render: renderers[column],
    })
    return [
        {
            title: 'Name',
            key: 'name',
            // Takes the leftover width and truncates, so the other columns and the menu stay in view. With
            // optional columns on a narrow scene it keeps a readable minimum and the table scrolls sideways.
            className: 'w-full max-w-0 min-w-40',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (_, row) =>
                row.kind === 'workflow' ? (
                    <WorkflowListNameCell row={row} />
                ) : (
                    <Link to={urls.workflowsLibraryTemplate(row.id)} className="block truncate">
                        {row.name}
                    </Link>
                ),
        },
        {
            title: 'Tags',
            key: 'tags',
            width: 128,
            className: 'min-w-24',
            render: (_, row) => <WorkflowTagsCell row={row} />,
        },
        ...(visibleColumns.includes('type') ? [optionalColumn('type')] : []),
        {
            title: 'Status',
            key: 'status',
            width: 0,
            render: (_, row) => (row.kind === 'workflow' ? <WorkflowStatusTag status={row.workflow.status} /> : null),
        },
        ...visibleColumns.filter((column) => column !== 'type').map(optionalColumn),
        {
            title: 'Updated',
            key: 'updated_at',
            width: 0,
            align: 'right',
            sorter: (a, b) =>
                Date.parse(workflowLibraryObject(a).updated_at) - Date.parse(workflowLibraryObject(b).updated_at),
            render: (_, row) => (
                <div className="whitespace-nowrap text-right">
                    <TZLabel time={workflowLibraryObject(row).updated_at} />
                </div>
            ),
        },
        {
            key: 'actions',
            width: 0,
            render: (_, row) => (row.kind === 'workflow' ? <WorkflowRowMenu row={row} /> : null),
        },
    ]
}
