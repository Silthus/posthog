// PROTOTYPE (throwaway): the runner-up shape. Today's workflow rows with an email column set, and an expandable row
// that answers "what does this workflow send, and from where".
import { useValues } from 'kea'

import { Tooltip } from '@posthog/lemon-ui'

import { LemonTable } from 'lib/lemon-ui/LemonTable'
import { LemonTableLink } from 'lib/lemon-ui/LemonTable/LemonTableLink'
import { humanFriendlyNumber } from 'lib/utils/numbers'
import { urls } from 'scenes/urls'

import type { WorkflowListItem } from '../shared/workflowListItems'
import { EmailCategoryTag } from './EmailCategoryTag'
import { emailLensLogic } from './emailLensLogic'
import { WorkflowEmailSteps } from './WorkflowEmailSteps'
import { WorkflowStatusTag } from './WorkflowStatusTag'

const SUBJECTS_SHOWN = 2

export function WorkflowEmailsTable(): JSX.Element {
    const { emailWorkflows, sendsByWorkflow, volumes } = useValues(emailLensLogic)

    const sendsOf = (item: WorkflowListItem): NonNullable<(typeof sendsByWorkflow)[string]> =>
        sendsByWorkflow[item.id] ?? []

    return (
        <LemonTable
            dataSource={emailWorkflows}
            rowKey="id"
            pagination={{ pageSize: 30 }}
            nouns={['workflow', 'workflows']}
            data-attr="workflows-prototype-workflow-emails"
            expandable={{
                expandedRowRender: (item) => <WorkflowEmailSteps sends={sendsOf(item)} />,
                noIndent: true,
            }}
            columns={[
                {
                    title: 'Workflow',
                    render: (_, item) => (
                        <LemonTableLink
                            to={item.status !== 'archived' ? urls.workflow(item.id, 'workflow') : undefined}
                            title={item.leafName}
                            description={item.path.join(' / ') || undefined}
                        />
                    ),
                },
                { title: 'Status', width: 0, render: (_, item) => <WorkflowStatusTag status={item.status} /> },
                {
                    title: 'Sends',
                    render: (_, item) => {
                        const subjects = Array.from(new Set(sendsOf(item).map((send) => send.step.subject)))
                        return (
                            <div className="flex flex-col text-sm min-w-0">
                                {subjects.slice(0, SUBJECTS_SHOWN).map((subject) => (
                                    <span key={subject} className="truncate">
                                        {subject}
                                    </span>
                                ))}
                                {subjects.length > SUBJECTS_SHOWN && (
                                    <Tooltip title={subjects.slice(SUBJECTS_SHOWN).join('\n')}>
                                        <span className="text-secondary text-xs">
                                            and {subjects.length - SUBJECTS_SHOWN} more
                                        </span>
                                    </Tooltip>
                                )}
                            </div>
                        )
                    },
                },
                {
                    title: 'From and category',
                    render: (_, item) => {
                        const senders = new Map(
                            sendsOf(item).map((send) => [send.step.fromAddress, send.step.fromName] as const)
                        )
                        const types = Array.from(new Set(sendsOf(item).map((send) => send.categoryType)))
                        return (
                            <div className="flex flex-col gap-1 text-sm items-start">
                                {Array.from(senders, ([address, name]) => (
                                    <div key={address ?? 'unknown'} className="flex flex-col">
                                        <span>{name ?? 'Unknown sender'}</span>
                                        <span className="text-xs text-secondary">{address}</span>
                                    </div>
                                ))}
                                <div className="flex flex-wrap gap-1">
                                    {types.map((type) => (
                                        <EmailCategoryTag key={type ?? 'none'} categoryType={type} />
                                    ))}
                                </div>
                            </div>
                        )
                    },
                },
                {
                    title: 'Sent, 7 days',
                    key: 'sent7d',
                    width: 0,
                    align: 'right',
                    sorter: (a, b) =>
                        sendsOf(a).reduce((t, s) => t + (s.sent7d ?? 0), 0) -
                        sendsOf(b).reduce((t, s) => t + (s.sent7d ?? 0), 0),
                    render: (_, item) =>
                        volumes === null ? (
                            <span className="text-muted">No data</span>
                        ) : (
                            <span translate="no">
                                {humanFriendlyNumber(sendsOf(item).reduce((t, s) => t + (s.sent7d ?? 0), 0))}
                            </span>
                        ),
                },
            ]}
        />
    )
}
