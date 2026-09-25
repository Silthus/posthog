// PROTOTYPE (throwaway): the workflows that send one email, with the step that sends it.
import { useActions } from 'kea'

import { IconEye } from '@posthog/icons'
import { LemonButton, LemonTag } from '@posthog/lemon-ui'

import { LemonTable } from 'lib/lemon-ui/LemonTable'
import { LemonTableLink } from 'lib/lemon-ui/LemonTable/LemonTableLink'
import { humanFriendlyNumber } from 'lib/utils/numbers'
import { urls } from 'scenes/urls'

import { EmailCategoryTag } from './EmailCategoryTag'
import { emailLensLogic } from './emailLensLogic'
import type { EmailSend } from './emailLensModel'
import { WorkflowStatusTag } from './WorkflowStatusTag'

export function EmailSendsTable({ sends }: { sends: EmailSend[] }): JSX.Element {
    const { openPreview } = useActions(emailLensLogic)

    return (
        <LemonTable
            size="small"
            embedded
            dataSource={sends}
            rowKey="key"
            data-attr="workflows-prototype-email-sends"
            columns={[
                {
                    title: 'Workflow',
                    render: (_, send) => (
                        <LemonTableLink
                            to={send.item.status !== 'archived' ? urls.workflow(send.item.id, 'workflow') : undefined}
                            title={send.item.leafName}
                            description={send.item.path.join(' / ') || undefined}
                        />
                    ),
                },
                { title: 'Status', width: 0, render: (_, send) => <WorkflowStatusTag status={send.item.status} /> },
                {
                    title: 'Step',
                    render: (_, send) => (
                        <div className="flex flex-wrap items-center gap-1">
                            <span>{send.step.stepName}</span>
                            {send.matchedBySubject && (
                                <LemonTag type="caution" title="This step has no Library link. Its subject matches.">
                                    Matched by subject
                                </LemonTag>
                            )}
                        </div>
                    ),
                },
                {
                    title: 'Category',
                    width: 0,
                    render: (_, send) => (
                        <EmailCategoryTag categoryType={send.categoryType} categoryName={send.categoryName} />
                    ),
                },
                {
                    title: 'Sent, 7 days',
                    width: 0,
                    align: 'right',
                    render: (_, send) =>
                        send.sent7d === null ? (
                            <span className="text-muted">No data</span>
                        ) : (
                            <span translate="no">{humanFriendlyNumber(send.sent7d)}</span>
                        ),
                },
                {
                    width: 0,
                    render: (_, send) => (
                        <LemonButton
                            size="xsmall"
                            icon={<IconEye />}
                            tooltip="Preview this email"
                            onClick={() => openPreview(send)}
                            data-attr="workflows-prototype-email-preview"
                        />
                    ),
                },
            ]}
        />
    )
}
