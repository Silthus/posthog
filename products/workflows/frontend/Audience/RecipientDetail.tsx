import { useActions, useValues } from 'kea'

import { IconArrowLeft, IconExternal } from '@posthog/icons'
import {
    LemonBanner,
    LemonButton,
    LemonCard,
    LemonSkeleton,
    LemonTable,
    LemonTableColumns,
    Link,
} from '@posthog/lemon-ui'

import { CopyToClipboardInline } from 'lib/components/CopyToClipboard'
import { TZLabel } from 'lib/components/TZLabel'
import { teamLogic } from 'scenes/teamLogic'
import { urls } from 'scenes/urls'

import { optOutSceneLogic } from '../OptOuts/optOutSceneLogic'
import { ALL_MARKETING_TOPIC_ID } from './audienceFixtures'
import type { AudienceEngagementEvent, AudiencePreferenceSource, AudienceSuppressionSource } from './audienceFixtures'
import { audienceLogic } from './audienceLogic'
import { TopicStatusTag } from './TopicStatusTag'

const EVENT_LABEL: Record<AudienceEngagementEvent['event'], string> = {
    $workflows_email_sent: 'Sent',
    $workflows_email_delivered: 'Delivered',
    $workflows_email_opened: 'Opened',
    $workflows_email_link_clicked: 'Clicked a link',
    $workflows_email_bounced: 'Bounced',
    $workflows_email_blocked: 'Marked as spam',
    $workflows_email_unsubscribed: 'Unsubscribed',
}

const SOURCE_LABEL: Record<AudiencePreferenceSource, string> = {
    api: 'from your app (API)',
    preferences_page: 'on the preferences page',
    csv: 'from a CSV import',
    customerio: 'from the Customer.io import',
    none: '',
}

const SUPPRESSION_LABEL: Record<AudienceSuppressionSource, string> = {
    BOUNCE: 'Repeated bounces',
    COMPLAINT: 'Spam report',
    MANUAL: 'Added manually',
}

export function RecipientDetail(): JSX.Element {
    const { selectedRecipient, selectedRecipientEvents, topics, audienceLoading } = useValues(audienceLogic)
    const { preferencesUrlLoading } = useValues(optOutSceneLogic)
    const { openPreferencesPage } = useActions(optOutSceneLogic)
    const { currentTeam } = useValues(teamLogic)
    const captureOn = !!currentTeam?.workflows_config?.capture_workflows_engagement_events

    if (audienceLoading || !selectedRecipient) {
        if (!audienceLoading) {
            return (
                <LemonBanner type="warning">
                    No recipient with this address. It may have been removed, or the address was typed differently.{' '}
                    <Link to={urls.audience()}>Back to recipients</Link>
                </LemonBanner>
            )
        }
        return <LemonSkeleton className="h-64" />
    }

    const recipient = selectedRecipient
    const marketingTopics = topics.filter((topic) => topic.category_type === 'marketing')
    const hasPreference = Object.keys(recipient.topics).length > 0

    const timelineColumns: LemonTableColumns<AudienceEngagementEvent> = [
        {
            title: 'When',
            key: 'timestamp',
            width: 150,
            render: (_, event) => <TZLabel time={event.timestamp} />,
        },
        {
            title: 'What happened',
            key: 'event',
            width: 160,
            render: (_, event) => <span className="font-medium">{EVENT_LABEL[event.event]}</span>,
        },
        {
            title: 'Message',
            key: 'subject',
            render: (_, event) =>
                event.event === '$workflows_email_unsubscribed' ? (
                    <span className="text-muted">
                        {event.category === ALL_MARKETING_TOPIC_ID
                            ? 'All marketing'
                            : (topics.find((topic) => topic.key === event.category)?.name ?? event.category)}
                    </span>
                ) : (
                    <div className="min-w-0">
                        <div className="truncate">{event.subject}</div>
                        <div className="text-muted text-xs truncate">
                            {event.workflow_name}
                            {event.link_url ? ` · ${event.link_url}` : ''}
                        </div>
                    </div>
                ),
        },
    ]

    return (
        <div className="flex flex-col gap-4" data-attr="audience-recipient-detail">
            <div>
                <LemonButton type="tertiary" size="small" icon={<IconArrowLeft />} to={urls.audience()}>
                    Recipients
                </LemonButton>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-semibold m-0 min-w-0 truncate">
                    <CopyToClipboardInline explicitValue={recipient.email}>{recipient.email}</CopyToClipboardInline>
                </h2>
                <LemonButton
                    size="small"
                    type="secondary"
                    icon={<IconExternal />}
                    loading={preferencesUrlLoading}
                    onClick={() => openPreferencesPage(recipient.email)}
                    tooltip="Open the preferences page this recipient sees, in a new tab"
                    data-attr="audience-recipient-preferences-page"
                >
                    Open preferences page
                </LemonButton>
            </div>

            {recipient.suppression && (
                <LemonBanner
                    type="error"
                    action={{ children: 'Remove from suppression list', to: urls.audience('suppression') }}
                >
                    <strong>Suppressed.</strong> Nothing is sent to this address, whatever the topic.{' '}
                    {SUPPRESSION_LABEL[recipient.suppression.source]}
                    {recipient.suppression.reason ? `: ${recipient.suppression.reason}` : ''}, since{' '}
                    <TZLabel time={recipient.suppression.suppressed_at} />.
                </LemonBanner>
            )}

            <div className="flex flex-wrap gap-4">
                <LemonCard hoverEffect={false} className="flex-1 min-w-72 flex flex-col gap-2">
                    <h3 className="font-semibold m-0">Topics</h3>
                    {!hasPreference && (
                        <p className="text-muted text-xs m-0">
                            No preference recorded yet, so this recipient gets every marketing email.
                        </p>
                    )}
                    <div className="flex items-center justify-between gap-2 py-1 border-b">
                        <div>
                            <div className="font-medium">All marketing</div>
                            <div className="text-muted text-xs">Every marketing topic at once</div>
                        </div>
                        <TopicStatusTag status={recipient.topics[ALL_MARKETING_TOPIC_ID] ?? 'no_preference'} />
                    </div>
                    {marketingTopics.map((topic) => (
                        <div key={topic.id} className="flex items-center justify-between gap-2 py-1">
                            <div className="min-w-0">
                                <div className="font-medium truncate">{topic.name}</div>
                                <div className="text-muted text-xs truncate">{topic.description}</div>
                            </div>
                            <TopicStatusTag status={recipient.topics[topic.id] ?? 'no_preference'} />
                        </div>
                    ))}
                    {recipient.preferences_updated_at && (
                        <div className="text-muted text-xs mt-1">
                            Last changed <TZLabel time={recipient.preferences_updated_at} />{' '}
                            {SOURCE_LABEL[recipient.preferences_source]}
                        </div>
                    )}
                </LemonCard>

                <LemonCard hoverEffect={false} className="flex-1 min-w-72 flex flex-col gap-2">
                    <h3 className="font-semibold m-0">Linked persons</h3>
                    {recipient.persons.length === 0 ? (
                        <p className="text-muted text-xs m-0">
                            No person has this email. Preferences still apply when a workflow sends to it.
                        </p>
                    ) : (
                        <>
                            <p className="text-muted text-xs m-0">
                                Persons whose email property is this address. Each one can trigger a workflow.
                            </p>
                            {recipient.persons.map((person) => (
                                <div key={person.uuid} className="flex items-center justify-between gap-2 py-1">
                                    <Link to={urls.personByUUID(person.uuid)} className="font-medium truncate">
                                        {person.name ?? person.distinct_id}
                                    </Link>
                                    <span className="text-muted text-xs truncate">{person.distinct_id}</span>
                                </div>
                            ))}
                        </>
                    )}
                </LemonCard>
            </div>

            <div className="flex flex-col gap-2">
                <div>
                    <h3 className="font-semibold m-0">Engagement</h3>
                    <p className="text-muted text-xs m-0">
                        Email events for this address, matched on the address the email went to rather than on a person.
                    </p>
                </div>
                {!captureOn ? (
                    <LemonBanner
                        type="info"
                        action={{ children: 'Turn on engagement events', to: urls.audience('engagement') }}
                    >
                        Engagement events are off for this project, so there is no timeline yet.
                    </LemonBanner>
                ) : (
                    <LemonTable
                        columns={timelineColumns}
                        dataSource={selectedRecipientEvents}
                        rowKey={(event) => `${event.event}-${event.timestamp}`}
                        pagination={{ pageSize: 20 }}
                        emptyState="No email has gone to this address yet."
                        data-attr="audience-recipient-timeline"
                    />
                )}
            </div>
        </div>
    )
}
