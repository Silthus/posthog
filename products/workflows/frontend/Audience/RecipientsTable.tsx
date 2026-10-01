import { useActions, useValues } from 'kea'

import { IconWarning } from '@posthog/icons'
import {
    LemonButton,
    LemonInput,
    LemonSegmentedButton,
    LemonSelect,
    LemonTable,
    LemonTableColumns,
    LemonTag,
    Link,
} from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { urls } from 'scenes/urls'

import { ALL_MARKETING_TOPIC_ID } from './audienceFixtures'
import type { AudienceRecipient, AudienceTopicStatus } from './audienceFixtures'
import { audienceLogic } from './audienceLogic'
import { TopicStatusTag } from './TopicStatusTag'

const STATUS_OPTIONS: { value: AudienceTopicStatus; label: string }[] = [
    { value: 'subscribed', label: 'Subscribed' },
    { value: 'unsubscribed', label: 'Unsubscribed' },
    { value: 'no_preference', label: 'No preference' },
]

export function RecipientsTable(): JSX.Element {
    const { filteredRecipients, recipients, audienceLoading, searchTerm, topicFilter, showFilter, topics } =
        useValues(audienceLogic)
    const { setSearchTerm, setTopicFilter, setShowFilter } = useActions(audienceLogic)

    const marketingTopics = topics.filter((topic) => topic.category_type === 'marketing')
    const topicOptions = [
        { value: ALL_MARKETING_TOPIC_ID, label: 'All marketing' },
        ...marketingTopics.map((topic) => ({ value: topic.id, label: topic.name })),
    ]

    const columns: LemonTableColumns<AudienceRecipient> = [
        {
            title: 'Recipient',
            key: 'email',
            render: (_, recipient) => (
                <div className="flex items-center gap-2 min-w-0">
                    <Link
                        to={urls.audienceRecipient(recipient.email)}
                        className="font-medium truncate"
                        data-attr="audience-recipient-link"
                    >
                        {recipient.email}
                    </Link>
                    {recipient.suppression && (
                        <LemonTag type="danger" size="small" icon={<IconWarning />}>
                            Suppressed
                        </LemonTag>
                    )}
                </div>
            ),
        },
        {
            title: 'All marketing',
            key: 'all_marketing',
            width: 140,
            render: (_, recipient) => (
                <TopicStatusTag status={recipient.topics[ALL_MARKETING_TOPIC_ID] ?? 'no_preference'} />
            ),
        },
        {
            title: 'Topics',
            key: 'topics',
            render: (_, recipient) => {
                const explicit = marketingTopics.filter((topic) => {
                    const status = recipient.topics[topic.id]
                    return status && status !== 'no_preference'
                })
                if (explicit.length === 0) {
                    return <span className="text-muted text-xs">No preference on any topic</span>
                }
                return (
                    <div className="flex flex-wrap gap-1">
                        {explicit.map((topic) => (
                            <TopicStatusTag key={topic.id} status={recipient.topics[topic.id]} label={topic.name} />
                        ))}
                    </div>
                )
            },
        },
        {
            title: 'Persons',
            key: 'persons',
            width: 160,
            render: (_, recipient) =>
                recipient.persons.length === 0 ? (
                    <span className="text-muted text-xs">No person</span>
                ) : recipient.persons.length === 1 ? (
                    <span className="truncate">{recipient.persons[0].name ?? recipient.persons[0].distinct_id}</span>
                ) : (
                    <span>{recipient.persons.length} persons</span>
                ),
        },
        {
            title: 'Last sent',
            key: 'last_sent_at',
            width: 140,
            sorter: (a, b) => (a.last_sent_at ?? '').localeCompare(b.last_sent_at ?? ''),
            render: (_, recipient) =>
                recipient.last_sent_at ? (
                    <TZLabel time={recipient.last_sent_at} />
                ) : (
                    <span className="text-muted text-xs">Never</span>
                ),
        },
    ]

    const filtersActive = !!searchTerm || !!topicFilter || showFilter !== 'all'

    return (
        <div className="flex flex-col gap-3" data-attr="audience-recipients">
            <div className="flex flex-wrap items-center gap-2">
                <LemonInput
                    type="search"
                    size="small"
                    placeholder="Search by email or name"
                    value={searchTerm}
                    onChange={setSearchTerm}
                    className="w-64"
                    data-attr="audience-search"
                />
                <LemonSelect
                    size="small"
                    placeholder="Topic"
                    value={topicFilter?.topicId ?? null}
                    onChange={(topicId) =>
                        setTopicFilter(topicId ? { topicId, status: topicFilter?.status ?? 'subscribed' } : null)
                    }
                    options={topicOptions}
                    allowClear
                    data-attr="audience-filter-topic"
                />
                {topicFilter && (
                    <LemonSelect
                        size="small"
                        value={topicFilter.status}
                        onChange={(status) => status && setTopicFilter({ ...topicFilter, status })}
                        options={STATUS_OPTIONS}
                        data-attr="audience-filter-status"
                    />
                )}
                <LemonSegmentedButton
                    size="small"
                    value={showFilter}
                    onChange={setShowFilter}
                    options={[
                        { value: 'all', label: 'All' },
                        { value: 'suppressed', label: 'Suppressed' },
                        { value: 'no_preference', label: 'No preference' },
                        { value: 'unsubscribed_all', label: 'Unsubscribed from all' },
                    ]}
                    data-attr="audience-filter-show"
                />
                {filtersActive && (
                    <LemonButton
                        size="small"
                        type="tertiary"
                        onClick={() => {
                            setSearchTerm('')
                            setTopicFilter(null)
                            setShowFilter('all')
                        }}
                    >
                        Clear
                    </LemonButton>
                )}
                <span className="text-muted text-xs ml-auto">
                    {filtersActive
                        ? `${filteredRecipients.length} of ${recipients.length} recipients`
                        : `${recipients.length} recipients`}
                </span>
            </div>
            <LemonTable
                columns={columns}
                dataSource={filteredRecipients}
                rowKey="email"
                loading={audienceLoading}
                loadingSkeletonRows={8}
                pagination={{ pageSize: 50 }}
                emptyState={
                    filtersActive
                        ? 'No recipient matches these filters. Clear them to see everyone.'
                        : 'No recipients yet. The first one appears as soon as a preference arrives from your app.'
                }
                data-attr="audience-recipients-table"
            />
        </div>
    )
}
