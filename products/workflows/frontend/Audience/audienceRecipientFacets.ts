import type { FacetDefinition } from '../Workflows/WorkflowsListV2/FacetSearchBar/facetQuery'
import { ALL_MARKETING_TOPIC_ID } from './audienceFixtures'
import type {
    AudienceRecipient,
    AudienceSuppressionSource,
    AudienceTopic,
    AudienceTopicStatus,
} from './audienceFixtures'

const SUPPRESSION_LABELS: Record<AudienceSuppressionSource, string> = {
    BOUNCE: 'Bounces',
    COMPLAINT: 'Spam report',
    MANUAL: 'Added manually',
}

/** Every word of the text must appear in the address or a linked person's name. */
export function matchesRecipientText(recipient: AudienceRecipient, text: string): boolean {
    const haystack = [recipient.email, ...recipient.persons.map((person) => person.name ?? '')].join(' ').toLowerCase()
    return text
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => haystack.includes(word))
}

function topicsWithStatus(
    recipient: AudienceRecipient,
    topics: AudienceTopic[],
    status: AudienceTopicStatus
): string[] {
    const keys: string[] = []
    if ((recipient.topics[ALL_MARKETING_TOPIC_ID] ?? 'no_preference') === status) {
        keys.push('all-marketing')
    }
    for (const topic of topics) {
        if (topic.category_type === 'marketing' && (recipient.topics[topic.id] ?? 'no_preference') === status) {
            keys.push(topic.key)
        }
    }
    return keys
}

export function buildRecipientFacets(topics: AudienceTopic[]): FacetDefinition<AudienceRecipient>[] {
    const topicLabels: Record<string, string> = { 'all-marketing': 'All marketing' }
    for (const topic of topics) {
        topicLabels[topic.key] = topic.name
    }
    const topicLabel = (value: string): string => topicLabels[value] ?? value

    return [
        {
            key: 'subscribed',
            label: 'Subscribed to',
            description: 'A topic the recipient subscribed to',
            showOnFocus: true,
            order: 1,
            getValues: (recipient) => topicsWithStatus(recipient, topics, 'subscribed'),
            formatValue: topicLabel,
        },
        {
            key: 'unsubscribed',
            label: 'Unsubscribed from',
            description: 'A topic the recipient left, or all marketing',
            showOnFocus: true,
            order: 2,
            getValues: (recipient) => topicsWithStatus(recipient, topics, 'unsubscribed'),
            formatValue: topicLabel,
        },
        {
            key: 'no-preference',
            label: 'No preference on',
            description: 'A topic with nothing recorded, so marketing is sent',
            showOnFocus: true,
            order: 3,
            getValues: (recipient) => topicsWithStatus(recipient, topics, 'no_preference'),
            formatValue: topicLabel,
        },
        {
            key: 'suppressed',
            label: 'Suppressed',
            description: 'Never sent to, and why',
            showOnFocus: true,
            order: 4,
            getValues: (recipient) => (recipient.suppression ? [recipient.suppression.source] : []),
            formatValue: (value) => SUPPRESSION_LABELS[value as AudienceSuppressionSource] ?? value,
        },
        {
            key: 'person',
            label: 'Person',
            description: 'Whether a person holds this address',
            showOnFocus: true,
            order: 5,
            getValues: (recipient) => [recipient.persons.length === 0 ? 'none' : 'linked'],
            formatValue: (value) => (value === 'none' ? 'No person' : 'Linked'),
        },
        {
            key: 'preference',
            label: 'Preference',
            description: 'Whether any preference was ever recorded',
            order: 6,
            getValues: (recipient) => [Object.keys(recipient.topics).length === 0 ? 'none' : 'recorded'],
            formatValue: (value) => (value === 'none' ? 'None recorded' : 'Recorded'),
        },
        {
            key: 'source',
            label: 'Source',
            description: 'Where the preference came from',
            order: 7,
            getValues: (recipient) => (recipient.preferences_source === 'none' ? [] : [recipient.preferences_source]),
            formatValue: (value) =>
                ({
                    api: 'Your app (API)',
                    preferences_page: 'Preferences page',
                    csv: 'CSV import',
                    customerio: 'Customer.io',
                })[value] ?? value,
        },
    ]
}
