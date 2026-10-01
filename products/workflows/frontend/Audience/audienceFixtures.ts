// PROTOTYPE: invented data standing in for the recipient listing API that does not exist yet.
// Every address is on an example.com domain. Everything is generated deterministically so stories
// and the running stack show the same people.

export type AudienceTopicStatus = 'subscribed' | 'unsubscribed' | 'no_preference'

export const ALL_MARKETING_TOPIC_ID = '$all'

export interface AudienceTopic {
    id: string
    key: string
    name: string
    description: string
    category_type: 'marketing' | 'transactional'
}

export interface AudienceLinkedPerson {
    uuid: string
    distinct_id: string
    name: string | null
}

export type AudienceSuppressionSource = 'BOUNCE' | 'COMPLAINT' | 'MANUAL'

export interface AudienceSuppression {
    source: AudienceSuppressionSource
    reason: string | null
    suppressed_at: string
}

export type AudiencePreferenceSource = 'api' | 'preferences_page' | 'csv' | 'customerio' | 'none'

export interface AudienceRecipient {
    email: string
    topics: Record<string, AudienceTopicStatus>
    suppression: AudienceSuppression | null
    persons: AudienceLinkedPerson[]
    last_sent_at: string | null
    preferences_updated_at: string | null
    preferences_source: AudiencePreferenceSource
}

export type AudienceEngagementEventName =
    | '$workflows_email_sent'
    | '$workflows_email_delivered'
    | '$workflows_email_opened'
    | '$workflows_email_link_clicked'
    | '$workflows_email_bounced'
    | '$workflows_email_blocked'
    | '$workflows_email_unsubscribed'

export interface AudienceEngagementEvent {
    event: AudienceEngagementEventName
    timestamp: string
    email_to: string
    subject: string
    workflow_name: string
    category: string | null
    link_url: string | null
}

export interface AudienceCoverage {
    persons_total: number
    persons_without_email: number
}

export interface AudienceAppMetricsTotals {
    sent: number
    delivered: number
    bounced: number
    period_days: number
}

export interface AudienceFixtureData {
    topics: AudienceTopic[]
    recipients: AudienceRecipient[]
    events: AudienceEngagementEvent[]
    coverage: AudienceCoverage
    app_metrics: AudienceAppMetricsTotals
}

export const FIXTURE_NOW = new Date('2026-10-01T09:00:00Z')

export const AUDIENCE_TOPICS: AudienceTopic[] = [
    {
        id: '0199c0ff-0000-7000-8000-000000000101',
        key: 'product-updates',
        name: 'Product updates',
        description: 'New features and changes to the product',
        category_type: 'marketing',
    },
    {
        id: '0199c0ff-0000-7000-8000-000000000102',
        key: 'weekly-digest',
        name: 'Weekly digest',
        description: 'A summary of activity in your workspace, every Monday',
        category_type: 'marketing',
    },
    {
        id: '0199c0ff-0000-7000-8000-000000000103',
        key: 'events-and-webinars',
        name: 'Events and webinars',
        description: 'Invitations to live sessions',
        category_type: 'marketing',
    },
    {
        id: '0199c0ff-0000-7000-8000-000000000104',
        key: 'account-notices',
        name: 'Account notices',
        description: 'Billing, security and service messages',
        category_type: 'transactional',
    },
]

const FIRST_NAMES = [
    'Jamie',
    'Priya',
    'Marco',
    'Dana',
    'Lukas',
    'Aisha',
    'Tomas',
    'Sofia',
    'Noor',
    'Elias',
    'Mina',
    'Ravi',
    'Hana',
    'Oscar',
    'Leila',
    'Jonas',
    'Keiko',
    'Mateo',
    'Ingrid',
    'Samir',
    'Wren',
    'Felix',
    'Zara',
    'Ivan',
]
const LAST_NAMES = [
    'Okafor',
    'Lindqvist',
    'Moreau',
    'Haddad',
    'Castillo',
    'Nakamura',
    'Petrov',
    'Brennan',
    'Yilmaz',
    'Fischer',
    'Mbeki',
    'Rossi',
    'Novak',
    'Sato',
    'Dubois',
    'Kowalski',
    'Andersen',
    'Mendes',
    'Quinn',
    'Varga',
]
const DOMAINS = ['example.com', 'mail.example.com', 'corp.example.com', 'example.org']
const WORKFLOWS = ['Weekly digest', 'Onboarding drip', 'Trial nudge', 'October launch broadcast']
const SUBJECTS: Record<string, string> = {
    'Weekly digest': 'Your week in Lumen',
    'Onboarding drip': 'Three things to try this week',
    'Trial nudge': 'Your trial ends in 3 days',
    'October launch broadcast': 'Introducing shared views',
}
const TOPIC_FOR_WORKFLOW: Record<string, string> = {
    'Weekly digest': 'weekly-digest',
    'Onboarding drip': 'product-updates',
    'Trial nudge': 'product-updates',
    'October launch broadcast': 'product-updates',
}

function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function pick<T>(rng: () => number, items: T[]): T {
    return items[Math.floor(rng() * items.length)]
}

function hoursAgo(hours: number): string {
    return new Date(FIXTURE_NOW.getTime() - hours * 3600 * 1000).toISOString()
}

function uuidFrom(rng: () => number, prefix: string): string {
    const hex = Array.from({ length: 12 }, () => Math.floor(rng() * 16).toString(16)).join('')
    return `${prefix}-0000-7000-8000-${hex}`
}

function buildTopics(rng: () => number, bucket: number): Record<string, AudienceTopicStatus> {
    const topics: Record<string, AudienceTopicStatus> = {}
    if (bucket < 0.18) {
        return topics
    }
    if (bucket < 0.3) {
        topics[ALL_MARKETING_TOPIC_ID] = 'unsubscribed'
        return topics
    }
    topics[ALL_MARKETING_TOPIC_ID] = rng() < 0.6 ? 'subscribed' : 'no_preference'
    for (const topic of AUDIENCE_TOPICS) {
        if (topic.category_type !== 'marketing') {
            continue
        }
        const roll = rng()
        topics[topic.id] = roll < 0.5 ? 'subscribed' : roll < 0.72 ? 'unsubscribed' : 'no_preference'
    }
    return topics
}

function buildSuppression(rng: () => number, bucket: number): AudienceSuppression | null {
    if (bucket < 0.05) {
        return {
            source: 'BOUNCE',
            reason: null,
            suppressed_at: hoursAgo(24 * Math.floor(rng() * 40) + 6),
        }
    }
    if (bucket < 0.065) {
        return {
            source: 'COMPLAINT',
            reason: 'Marked as spam via feedback loop',
            suppressed_at: hoursAgo(24 * Math.floor(rng() * 20) + 3),
        }
    }
    if (bucket < 0.08) {
        return {
            source: 'MANUAL',
            reason: 'Asked support to stop all email',
            suppressed_at: hoursAgo(24 * Math.floor(rng() * 60) + 12),
        }
    }
    return null
}

function buildEventsFor(rng: () => number, recipient: AudienceRecipient): AudienceEngagementEvent[] {
    const events: AudienceEngagementEvent[] = []
    const sendCount = recipient.suppression ? 1 : 1 + Math.floor(rng() * 4)
    for (let i = 0; i < sendCount; i++) {
        const workflow = pick(rng, WORKFLOWS)
        const sentAt = 24 * Math.floor(rng() * 28) + Math.floor(rng() * 20)
        const base = {
            email_to: recipient.email,
            subject: SUBJECTS[workflow],
            workflow_name: workflow,
            category: TOPIC_FOR_WORKFLOW[workflow],
            link_url: null,
        }
        events.push({ ...base, event: '$workflows_email_sent', timestamp: hoursAgo(sentAt) })
        if (recipient.suppression?.source === 'BOUNCE' && i === sendCount - 1) {
            events.push({ ...base, event: '$workflows_email_bounced', timestamp: hoursAgo(sentAt - 0.05) })
            continue
        }
        events.push({ ...base, event: '$workflows_email_delivered', timestamp: hoursAgo(sentAt - 0.02) })
        if (rng() < 0.55) {
            events.push({ ...base, event: '$workflows_email_opened', timestamp: hoursAgo(sentAt - 2 - rng() * 10) })
            if (rng() < 0.4) {
                events.push({
                    ...base,
                    event: '$workflows_email_link_clicked',
                    timestamp: hoursAgo(sentAt - 3 - rng() * 10),
                    link_url: 'https://app.example.com/launch',
                })
            }
        }
        if (recipient.suppression?.source === 'COMPLAINT' && i === sendCount - 1) {
            events.push({ ...base, event: '$workflows_email_blocked', timestamp: hoursAgo(sentAt - 5) })
        }
    }
    const unsubscribedTopic = Object.entries(recipient.topics).find(([, status]) => status === 'unsubscribed')
    if (unsubscribedTopic && rng() < 0.7) {
        const [topicId] = unsubscribedTopic
        const topic = AUDIENCE_TOPICS.find((t) => t.id === topicId)
        events.push({
            event: '$workflows_email_unsubscribed',
            timestamp: recipient.preferences_updated_at ?? hoursAgo(24 * 5),
            email_to: recipient.email,
            subject: '',
            workflow_name: '',
            category: topic?.key ?? ALL_MARKETING_TOPIC_ID,
            link_url: null,
        })
    }
    return events
}

export function buildAudienceFixtures(count: number = 312): AudienceFixtureData {
    const rng = mulberry32(20261001)
    const recipients: AudienceRecipient[] = []
    const events: AudienceEngagementEvent[] = []
    const seen = new Set<string>()

    while (recipients.length < count) {
        const first = pick(rng, FIRST_NAMES)
        const last = pick(rng, LAST_NAMES)
        const domain = pick(rng, DOMAINS)
        const suffix = rng() < 0.3 ? String(Math.floor(rng() * 90) + 10) : ''
        const email = `${first}.${last}${suffix}@${domain}`.toLowerCase()
        if (seen.has(email)) {
            continue
        }
        seen.add(email)

        const topicBucket = rng()
        const topics = buildTopics(rng, topicBucket)
        const suppression = buildSuppression(rng, rng())
        const personRoll = rng()
        const personCount = personRoll < 0.12 ? 0 : personRoll < 0.9 ? 1 : 2
        const persons: AudienceLinkedPerson[] = Array.from({ length: personCount }, (_, i) => ({
            uuid: uuidFrom(rng, '0199c1aa'),
            distinct_id: i === 0 ? `user_${Math.floor(rng() * 90000) + 10000}` : email,
            name: i === 0 ? `${first} ${last}` : null,
        }))
        const hasPreference = Object.keys(topics).length > 0
        const sourceRoll = rng()
        const preferences_source: AudiencePreferenceSource = !hasPreference
            ? 'none'
            : sourceRoll < 0.55
              ? 'api'
              : sourceRoll < 0.8
                ? 'preferences_page'
                : sourceRoll < 0.92
                  ? 'customerio'
                  : 'csv'

        const recipient: AudienceRecipient = {
            email,
            topics,
            suppression,
            persons,
            last_sent_at: rng() < 0.85 ? hoursAgo(24 * Math.floor(rng() * 30) + 1) : null,
            preferences_updated_at: hasPreference ? hoursAgo(24 * Math.floor(rng() * 90) + 2) : null,
            preferences_source,
        }
        recipients.push(recipient)
        if (recipient.last_sent_at) {
            events.push(...buildEventsFor(rng, recipient))
        }
    }

    events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))

    return {
        topics: AUDIENCE_TOPICS,
        recipients,
        events,
        coverage: { persons_total: 1184, persons_without_email: 143 },
        app_metrics: { sent: 12480, delivered: 11902, bounced: 212, period_days: 30 },
    }
}

export const EMPTY_AUDIENCE_FIXTURES: AudienceFixtureData = {
    topics: [],
    recipients: [],
    events: [],
    coverage: { persons_total: 1184, persons_without_email: 143 },
    app_metrics: { sent: 0, delivered: 0, bounced: 0, period_days: 30 },
}
