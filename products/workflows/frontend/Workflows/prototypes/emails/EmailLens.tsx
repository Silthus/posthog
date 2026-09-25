// PROTOTYPE (throwaway): the email-first mode. From-address, then each email it sends, then the workflows that send it.
import { useActions, useValues } from 'kea'

import { IconEye, IconWarning } from '@posthog/icons'
import { LemonButton, LemonCollapse, LemonTag, Tooltip } from '@posthog/lemon-ui'

import { LemonTable } from 'lib/lemon-ui/LemonTable'
import { humanFriendlyNumber } from 'lib/utils/numbers'
import { pluralize } from 'lib/utils/strings'

import { EmailCategoryTag } from './EmailCategoryTag'
import { emailLensLogic } from './emailLensLogic'
import type { EmailGroup, SenderGroup } from './emailLensModel'
import { EmailSendsTable } from './EmailSendsTable'

function SenderHeader({ sender, volumesKnown }: { sender: SenderGroup; volumesKnown: boolean }): JSX.Element {
    return (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 w-full min-w-0">
            <span className="font-semibold truncate">{sender.name ?? 'Unknown sender'}</span>
            <span className="text-secondary truncate">{sender.address ?? 'No from-address set'}</span>
            <span className="text-secondary text-xs ml-auto" translate="no">
                {pluralize(sender.emails.length, 'email')} · {pluralize(sender.workflowCount, 'workflow')}
                {volumesKnown ? ` · ${humanFriendlyNumber(sender.sent7d)} sent in 7 days` : ''}
            </span>
        </div>
    )
}

function EmailCell({ email }: { email: EmailGroup }): JSX.Element {
    return (
        <div className="flex flex-col gap-0.5 min-w-0 py-1">
            <span className="font-semibold">{email.subject || 'No subject'}</span>
            <div className="flex flex-wrap items-center gap-1 text-xs">
                {email.libraryTemplateName ? (
                    <LemonTag type="completion" title="Linked Library template">
                        Library: {email.libraryTemplateName}
                    </LemonTag>
                ) : (
                    <Tooltip title="These steps have no link to a Library template, so they are grouped by subject.">
                        <LemonTag type="muted">Not linked, grouped by subject</LemonTag>
                    </Tooltip>
                )}
                {email.subjectMatchesLibrary && (
                    <span className="text-secondary">Same subject as “{email.subjectMatchesLibrary}”</span>
                )}
            </div>
        </div>
    )
}

function EmailFlags({ email }: { email: EmailGroup }): JSX.Element | null {
    const flags: { label: string; tooltip: string }[] = []
    if (email.activeWorkflowCount > 1) {
        flags.push({
            label: `Possible duplicate: ${email.activeWorkflowCount} active`,
            tooltip: 'Several active workflows send this email. A person who enters more than one can get it twice.',
        })
    }
    if (email.otherSenders.length) {
        flags.push({
            label: `Also from ${email.otherSenders.join(', ')}`,
            tooltip: 'The same email goes out from more than one address.',
        })
    }
    if (email.categoryTypes.length > 1) {
        flags.push({
            label: 'Mixed categories',
            tooltip: 'Some steps send this as marketing and some as transactional, so opt-outs apply unevenly.',
        })
    }
    if (!flags.length) {
        return null
    }
    return (
        <div className="flex flex-wrap gap-1">
            {flags.map((flag) => (
                <Tooltip key={flag.label} title={flag.tooltip}>
                    <LemonTag type="warning" icon={<IconWarning />}>
                        {flag.label}
                    </LemonTag>
                </Tooltip>
            ))}
        </div>
    )
}

function SenderEmailsTable({ sender, volumesKnown }: { sender: SenderGroup; volumesKnown: boolean }): JSX.Element {
    const { openPreview } = useActions(emailLensLogic)
    return (
        <LemonTable
            embedded
            dataSource={sender.emails}
            rowKey="key"
            data-attr="workflows-prototype-sender-emails"
            expandable={{
                expandedRowRender: (email) => <EmailSendsTable sends={email.sends} />,
                noIndent: true,
            }}
            columns={[
                { title: 'Email', render: (_, email) => <EmailCell email={email} /> },
                {
                    title: 'Sent by',
                    render: (_, email) => (
                        <div className="flex flex-col gap-1">
                            <span translate="no">
                                {pluralize(email.workflowCount, 'workflow')}
                                {email.activeWorkflowCount < 2 ? `, ${email.activeWorkflowCount} active` : ''}
                            </span>
                            <EmailFlags email={email} />
                        </div>
                    ),
                },
                {
                    title: 'Category',
                    width: 0,
                    render: (_, email) => (
                        <div className="flex flex-col gap-1 items-start">
                            {email.categoryTypes.length ? (
                                email.categoryTypes.map((type) => <EmailCategoryTag key={type} categoryType={type} />)
                            ) : (
                                <EmailCategoryTag categoryType={null} />
                            )}
                        </div>
                    ),
                },
                {
                    title: 'Sent, 7 days',
                    width: 0,
                    align: 'right',
                    render: (_, email) =>
                        volumesKnown ? (
                            <span translate="no">{humanFriendlyNumber(email.sent7d)}</span>
                        ) : (
                            <span className="text-muted">No data</span>
                        ),
                },
                {
                    width: 0,
                    render: (_, email) => (
                        <LemonButton
                            size="xsmall"
                            icon={<IconEye />}
                            tooltip="Preview this email"
                            onClick={() => openPreview(email.sends[0])}
                            data-attr="workflows-prototype-email-preview"
                        />
                    ),
                },
            ]}
        />
    )
}

export function EmailLens(): JSX.Element {
    const { senderGroups, volumes } = useValues(emailLensLogic)
    const volumesKnown = volumes !== null
    // Open everything once a filter narrows the lens down, otherwise only the two busiest senders.
    const openKeys =
        senderGroups.length <= 3 ? senderGroups.map((s) => s.key) : senderGroups.slice(0, 2).map((s) => s.key)

    return (
        <LemonCollapse
            key={senderGroups.map((sender) => sender.key).join('|')}
            multiple
            defaultActiveKeys={openKeys}
            panels={senderGroups.map((sender) => ({
                key: sender.key,
                header: <SenderHeader sender={sender} volumesKnown={volumesKnown} />,
                content: <SenderEmailsTable sender={sender} volumesKnown={volumesKnown} />,
                dataAttr: 'workflows-prototype-sender',
            }))}
        />
    )
}
