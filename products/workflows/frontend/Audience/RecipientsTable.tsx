import { useActions, useValues } from 'kea'

import { IconWarning } from '@posthog/icons'
import { LemonButton, LemonTable, LemonTableColumns, LemonTag, Link } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { humanFriendlyNumber } from 'lib/utils/numbers'
import { urls } from 'scenes/urls'

import { serializeFacetQuery } from '../Workflows/WorkflowsListV2/FacetSearchBar/facetQuery'
import { FacetSearchBar } from '../Workflows/WorkflowsListV2/FacetSearchBar/FacetSearchBar'
import { ALL_MARKETING_TOPIC_ID } from './audienceFixtures'
import type { AudienceRecipient } from './audienceFixtures'
import { audienceLogic } from './audienceLogic'
import { matchesRecipientText } from './audienceRecipientFacets'
import { TopicStatusTag } from './TopicStatusTag'

export function RecipientsTable(): JSX.Element {
    const { filteredRecipients, recipients, audienceLoading, searchValue, facets, topics, personsWithoutEmail } =
        useValues(audienceLogic)
    const { setSearchValue, clearSearch } = useActions(audienceLogic)

    const marketingTopics = topics.filter((topic) => topic.category_type === 'marketing')

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

    const filtersActive = searchValue.filters.length > 0 || searchValue.text.trim() !== ''

    return (
        <div className="flex flex-col gap-3 min-w-0" data-attr="audience-recipients">
            <FacetSearchBar
                facets={facets}
                items={recipients}
                value={searchValue}
                onChange={setSearchValue}
                matchesText={matchesRecipientText}
                placeholder="Search by email or name, or filter with subscribed:, unsubscribed:, suppressed: and more"
                dataAttr="audience-search"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>
                    {filtersActive
                        ? `${filteredRecipients.length} of ${recipients.length} recipients`
                        : `${recipients.length} recipients`}
                </span>
                {personsWithoutEmail !== null && personsWithoutEmail > 0 && (
                    <span>
                        <Link to={urls.persons()} data-attr="audience-unreachable-persons">
                            {humanFriendlyNumber(personsWithoutEmail)} persons can't be reached
                        </Link>{' '}
                        because they have no email property.
                    </span>
                )}
            </div>
            {!audienceLoading && recipients.length > 0 && filteredRecipients.length === 0 ? (
                <div className="flex flex-col items-center gap-2 border rounded p-8 text-center">
                    <span>No recipient matches these filters</span>
                    <LemonButton type="secondary" size="small" onClick={clearSearch} data-attr="audience-clear-filters">
                        Clear filters
                    </LemonButton>
                </div>
            ) : (
                <LemonTable
                    key={`${serializeFacetQuery(searchValue.filters)}\n${searchValue.text}`}
                    columns={columns}
                    dataSource={filteredRecipients}
                    rowKey="email"
                    loading={audienceLoading}
                    loadingSkeletonRows={8}
                    pagination={{ pageSize: 50, useUrl: false }}
                    nouns={['recipient', 'recipients']}
                    emptyState="No recipients yet. The first one appears as soon as a preference arrives from your app."
                    data-attr="audience-recipients-table"
                />
            )}
        </div>
    )
}
