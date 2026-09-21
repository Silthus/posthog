import { useActions, useValues } from 'kea'

import { LemonButton, LemonTable, LemonTableColumn, LemonTableColumns, LemonTag } from '@posthog/lemon-ui'

import { AccessControlAction } from 'lib/components/AccessControlAction'
import { TZLabel } from 'lib/components/TZLabel'

import { AccessControlLevel, AccessControlResourceType } from '~/types'

import {
    RevisionChangedByCell,
    RevisionSourceCell,
    codeManagedWorkflowRestoreReason,
    type WorkflowRevisionRow,
} from './revisions/revisionSource'
import { workflowLogic } from './workflowLogic'
import { workflowRevisionsLogic } from './workflowRevisionsLogic'

/** Where the Source column sits. The prototype renders both so the order can be judged from a picture. */
export type RevisionSourceColumnPosition = 'after-changed-by' | 'last'

export function WorkflowRevisions({
    id,
    sourceColumnPosition = 'after-changed-by',
}: {
    id: string
    sourceColumnPosition?: RevisionSourceColumnPosition
}): JSX.Element {
    const logic = workflowRevisionsLogic({ id })
    const { revisions, revisionsCount, revisionsResponseLoading, restoringVersion } = useValues(logic)
    const { restoreRevision } = useActions(logic)
    const { originalWorkflow, workflowUserAccessLevel } = useValues(workflowLogic({ id }))

    const liveVersion = originalWorkflow?.version
    const isCodeManaged = originalWorkflow?.managed_by === 'code'

    const sourceColumn: LemonTableColumn<WorkflowRevisionRow, any> = {
        title: 'Source',
        key: 'source',
        render: (_, revision) => <RevisionSourceCell revision={revision} />,
    }

    const columns: LemonTableColumns<WorkflowRevisionRow> = [
        {
            title: 'Version',
            key: 'version',
            render: (_, revision) => (
                <span className="flex items-center gap-2 font-semibold">
                    v{revision.version}
                    {revision.version === liveVersion && <LemonTag type="success">Live</LemonTag>}
                </span>
            ),
        },
        {
            title: 'Changed by',
            key: 'created_by',
            render: (_, revision) => <RevisionChangedByCell revision={revision} />,
        },
        ...(sourceColumnPosition === 'after-changed-by' ? [sourceColumn] : []),
        {
            title: 'Date',
            key: 'created_at',
            render: (_, revision) => <TZLabel time={revision.created_at} />,
        },
        ...(sourceColumnPosition === 'last' ? [sourceColumn] : []),
        {
            key: 'actions',
            width: 0,
            render: (_, revision) => (
                // The flex wrapper keeps the button at its intrinsic height instead of
                // stretching to the (avatar-driven) row height.
                <div className="flex items-center">
                    <AccessControlAction
                        resourceType={AccessControlResourceType.Workflow}
                        minAccessLevel={AccessControlLevel.Editor}
                        userAccessLevel={workflowUserAccessLevel ?? undefined}
                    >
                        <LemonButton
                            type="secondary"
                            size="xsmall"
                            // Narrow, the label wraps instead of pushing the actions column out of view.
                            className="@[36rem]/revisions:whitespace-nowrap"
                            onClick={() => restoreRevision(revision.version)}
                            loading={restoringVersion === revision.version}
                            disabledReason={
                                isCodeManaged
                                    ? codeManagedWorkflowRestoreReason
                                    : revision.version === liveVersion
                                      ? 'This is the live version'
                                      : restoringVersion !== null && restoringVersion !== revision.version
                                        ? 'Another restore is in progress'
                                        : undefined
                            }
                        >
                            Restore as draft
                        </LemonButton>
                    </AccessControlAction>
                </div>
            ),
        },
    ]

    return (
        <div className="@container/revisions flex flex-col gap-2">
            <div>
                <h3 className="mb-0">Versions</h3>
                <p className="text-secondary mb-0">
                    A version is saved each time the live workflow changes. Restore one to open it as a draft, then
                    publish it to go live.
                </p>
            </div>
            <LemonTable<WorkflowRevisionRow>
                dataSource={revisions}
                loading={revisionsResponseLoading}
                rowKey="version"
                footer={
                    revisionsCount > revisions.length ? (
                        <div className="px-3 py-2 text-xs text-secondary">
                            Showing the newest {revisions.length} of {revisionsCount} versions.
                        </div>
                    ) : undefined
                }
                emptyState="No versions yet. One is saved each time the live workflow changes."
                columns={columns}
            />
        </div>
    )
}
