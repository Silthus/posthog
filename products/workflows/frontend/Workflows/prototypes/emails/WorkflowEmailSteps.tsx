// PROTOTYPE (throwaway): the inverse question for one workflow. What it sends, and from where.
import { useActions } from 'kea'

import { IconEye } from '@posthog/icons'
import { LemonButton, LemonTag } from '@posthog/lemon-ui'

import { LemonTable } from 'lib/lemon-ui/LemonTable'
import { humanFriendlyNumber } from 'lib/utils/numbers'

import { EmailCategoryTag } from './EmailCategoryTag'
import { emailLensLogic } from './emailLensLogic'
import type { EmailSend } from './emailLensModel'

export function WorkflowEmailSteps({ sends }: { sends: EmailSend[] }): JSX.Element {
    const { openPreview } = useActions(emailLensLogic)

    return (
        <LemonTable
            size="small"
            embedded
            dataSource={sends}
            rowKey="key"
            data-attr="workflows-prototype-workflow-email-steps"
            columns={[
                { title: 'Step', render: (_, send) => send.step.stepName },
                {
                    title: 'Subject',
                    render: (_, send) => (
                        <div className="flex flex-col gap-0.5 py-1">
                            <span className="font-semibold">{send.step.subject || 'No subject'}</span>
                            {send.step.libraryTemplateName ? (
                                <span className="text-xs text-secondary">
                                    Library: {send.step.libraryTemplateName}
                                    {send.matchedBySubject ? ' (matched by subject)' : ''}
                                </span>
                            ) : (
                                <span className="text-xs text-muted">Not linked to a Library template</span>
                            )}
                        </div>
                    ),
                },
                {
                    title: 'From',
                    render: (_, send) => (
                        <div className="flex flex-col">
                            <span>{send.step.fromName ?? 'Unknown sender'}</span>
                            <span className="text-xs text-secondary">{send.step.fromAddress}</span>
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
                            <LemonTag type="muted">No data</LemonTag>
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
