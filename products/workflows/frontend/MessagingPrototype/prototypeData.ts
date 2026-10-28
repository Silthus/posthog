// PROTOTYPE, never merged: Silthus/personal#212. Invented sample data; no real customer material.

export type WorkflowView = 'Messaging' | 'Automation' | 'Loop'

/** One row of any Messaging list. Every list shows the same columns, so the kinds read alike. */
export interface MessagingRow {
    id: string
    name: string
    /** The second line under the name: the audience, the API ID, the trigger, or the template kind. */
    detail: string
    detailIsCode?: boolean
    status: string
    tags: string[]
    fact: string
    metric: string
    owner: string
    view?: WorkflowView
    preview?: TemplatePreview
}

export interface TemplatePreview {
    subject: string
    preheader: string
    from: string
    heading: string
    body: string[]
    cta: string
}

/** The kind's own labels for the shared columns. */
export interface MessagingListColumns {
    noun: string
    statusLabel: string
    factLabel: string
    metricLabel: string
}

export const BROADCAST_COLUMNS: MessagingListColumns = {
    noun: 'broadcasts',
    statusLabel: 'Status',
    factLabel: 'Send time',
    metricLabel: 'Opened',
}

export const BROADCASTS: MessagingRow[] = [
    {
        id: 'b1',
        name: 'November product update',
        detail: 'All active users',
        status: 'Scheduled',
        tags: ['product'],
        fact: 'Nov 3, 09:00',
        metric: '—',
        owner: 'Priya',
    },
    {
        id: 'b2',
        name: 'Webinar reminder: data pipelines',
        detail: 'Webinar sign-ups',
        status: 'Scheduled',
        tags: ['events'],
        fact: 'Oct 30, 15:00',
        metric: '—',
        owner: 'Sam',
    },
    {
        id: 'b3',
        name: 'Pricing page refresh',
        detail: 'Trial users',
        status: 'Draft',
        tags: ['pricing', 'product'],
        fact: 'Not scheduled',
        metric: '—',
        owner: 'Alex',
    },
    {
        id: 'b4',
        name: 'October product update',
        detail: 'All active users',
        status: 'Sent',
        tags: ['product'],
        fact: 'Oct 6, 09:00',
        metric: '41%',
        owner: 'Priya',
    },
    {
        id: 'b5',
        name: 'Beta invite: session summaries',
        detail: 'Beta cohort',
        status: 'Sent',
        tags: ['beta'],
        fact: 'Sep 22, 11:30',
        metric: '58%',
        owner: 'Sam',
    },
]

export const TRANSACTIONAL_COLUMNS: MessagingListColumns = {
    noun: 'transactional emails',
    statusLabel: 'Status',
    factLabel: 'Last sent',
    metricLabel: 'Sends, 7 days',
}

export const TRANSACTIONAL_EMAILS: MessagingRow[] = [
    {
        id: 't1',
        name: 'Password reset',
        detail: 'password-reset',
        detailIsCode: true,
        status: 'Live',
        tags: ['auth'],
        fact: '2 minutes ago',
        metric: '1,204',
        owner: 'Alex',
    },
    {
        id: 't2',
        name: 'Magic link sign-in',
        detail: 'magic-link',
        detailIsCode: true,
        status: 'Live',
        tags: ['auth'],
        fact: 'Just now',
        metric: '3,877',
        owner: 'Alex',
    },
    {
        id: 't3',
        name: 'Invoice ready',
        detail: 'invoice-ready',
        detailIsCode: true,
        status: 'Live',
        tags: ['billing'],
        fact: '1 hour ago',
        metric: '212',
        owner: 'Priya',
    },
    {
        id: 't4',
        name: 'Seat added',
        detail: 'seat-added',
        detailIsCode: true,
        status: 'Draft',
        tags: ['billing'],
        fact: 'Never',
        metric: '0',
        owner: 'Sam',
    },
]

export const WORKFLOW_COLUMNS: MessagingListColumns = {
    noun: 'workflows',
    statusLabel: 'Status',
    factLabel: 'Channels',
    metricLabel: 'Runs, 7 days',
}

export const WORKFLOWS: MessagingRow[] = [
    {
        id: 'w1',
        name: 'Onboarding drip',
        detail: 'When someone signs up',
        status: 'Live',
        tags: ['onboarding'],
        fact: 'Email',
        metric: '842',
        owner: 'Priya',
        view: 'Messaging',
    },
    {
        id: 'w2',
        name: 'Trial ending nudge',
        detail: 'Three days before a trial ends',
        status: 'Live',
        tags: ['billing', 'onboarding'],
        fact: 'Email, SMS',
        metric: '96',
        owner: 'Sam',
        view: 'Messaging',
    },
    {
        id: 'w3',
        name: 'Win-back after 30 days',
        detail: 'After 30 days without a visit',
        status: 'Paused',
        tags: ['retention'],
        fact: 'Email',
        metric: '0',
        owner: 'Sam',
        view: 'Messaging',
    },
    {
        id: 'w4',
        name: 'Alert sales on big signup',
        detail: 'When a company over 500 people signs up',
        status: 'Live',
        tags: ['sales'],
        fact: 'Slack',
        metric: '12',
        owner: 'Alex',
        view: 'Automation',
    },
    {
        id: 'w5',
        name: 'Sync new users to CRM',
        detail: 'When someone signs up',
        status: 'Live',
        tags: ['sales'],
        fact: 'Webhook',
        metric: '842',
        owner: 'Alex',
        view: 'Automation',
    },
    {
        id: 'w6',
        name: 'Churn risk follow-up',
        detail: 'When weekly usage drops by half',
        status: 'Live',
        tags: ['retention'],
        fact: 'Email, Slack',
        metric: '31',
        owner: 'Priya',
        view: 'Messaging',
    },
    {
        id: 'w7',
        name: 'Weekly activation loop',
        detail: 'Every Monday at 10:00',
        status: 'Live',
        tags: ['onboarding'],
        fact: 'Email',
        metric: '1',
        owner: 'Sam',
        view: 'Loop',
    },
]

export const TEMPLATE_COLUMNS: MessagingListColumns = {
    noun: 'templates',
    statusLabel: 'Kind',
    factLabel: 'Updated',
    metricLabel: 'Used in',
}

export const TEMPLATES: MessagingRow[] = [
    {
        id: 'tp1',
        name: 'Product update',
        detail: 'Email',
        status: 'Marketing',
        tags: ['product'],
        fact: 'Oct 2',
        metric: '3',
        owner: 'Priya',
        preview: {
            subject: "What's new in October",
            preheader: 'Three things we shipped this month',
            from: 'Example Team <team@mail.example.com>',
            heading: 'Here is what changed this month',
            body: [
                'Dashboards load twice as fast, and you can now pin a dashboard to your home page.',
                'Session summaries are in beta. Turn them on from the replay settings.',
            ],
            cta: 'Read the changelog',
        },
    },
    {
        id: 'tp2',
        name: 'Password reset',
        detail: 'Email',
        status: 'Transactional',
        tags: ['auth'],
        fact: 'Sep 14',
        metric: '1',
        owner: 'Alex',
        preview: {
            subject: 'Reset your password',
            preheader: 'This link works for one hour',
            from: 'Example <no-reply@mail.example.com>',
            heading: 'Reset your password',
            body: ['Someone asked to reset the password for {{ variables.email }}. If it was not you, ignore this.'],
            cta: 'Choose a new password',
        },
    },
    {
        id: 'tp3',
        name: 'Magic link sign-in',
        detail: 'Email',
        status: 'Transactional',
        tags: ['auth'],
        fact: 'Sep 14',
        metric: '1',
        owner: 'Alex',
        preview: {
            subject: 'Your sign-in link',
            preheader: 'It works once, for ten minutes',
            from: 'Example <no-reply@mail.example.com>',
            heading: 'Sign in to Example',
            body: ['Click the button below to sign in. The link works once.'],
            cta: 'Sign in',
        },
    },
    {
        id: 'tp4',
        name: 'Invoice ready',
        detail: 'Email',
        status: 'Transactional',
        tags: ['billing'],
        fact: 'Aug 30',
        metric: '1',
        owner: 'Priya',
        preview: {
            subject: 'Your invoice for {{ variables.month }}',
            preheader: 'Total {{ variables.total }}',
            from: 'Example Billing <billing@mail.example.com>',
            heading: 'Your invoice is ready',
            body: ['Your invoice for {{ variables.month }} is {{ variables.total }}. We charge your card on file.'],
            cta: 'View invoice',
        },
    },
    {
        id: 'tp5',
        name: 'Welcome to the team',
        detail: 'Email',
        status: 'Marketing',
        tags: ['onboarding'],
        fact: 'Aug 2',
        metric: '2',
        owner: 'Sam',
        preview: {
            subject: 'Welcome to Example',
            preheader: 'Three steps to get started',
            from: 'Sam at Example <sam@mail.example.com>',
            heading: 'Welcome aboard',
            body: ['Start by connecting your data, then invite your team.', 'Reply to this email if you get stuck.'],
            cta: 'Connect your data',
        },
    },
]

export const CHANNELS = [
    { name: 'Email', detail: 'mail.example.com', status: 'Verified' },
    { name: 'Email', detail: 'news.example.com', status: 'DNS records missing' },
    { name: 'SMS', detail: 'Twilio, +1 555 0100', status: 'Connected' },
    { name: 'Push', detail: 'Not set up', status: 'Not set up' },
    { name: 'Slack', detail: 'example-workspace', status: 'Connected' },
] as const

export const TOPICS = [
    { name: 'Product updates', optOuts: 312 },
    { name: 'Marketing', optOuts: 1048 },
    { name: 'Billing', optOuts: 4 },
] as const

export const OPT_OUTS = [
    { person: 'ana@example.com', topic: 'Marketing', when: 'Oct 27' },
    { person: 'li@example.com', topic: 'All messages', when: 'Oct 25' },
    { person: 'sam@example.org', topic: 'Product updates', when: 'Oct 21' },
] as const

export const SUPPRESSION = [
    { address: 'bounced@example.net', reason: 'Hard bounce', when: 'Oct 26' },
    { address: 'complaint@example.com', reason: 'Spam complaint', when: 'Oct 12' },
    { address: 'old@example.org', reason: 'Added by hand', when: 'Sep 30' },
] as const

/** Every item the pane search finds, with the section that lists it. */
export const SEARCHABLE_ITEMS = [
    ...BROADCASTS.map((row) => ({ section: 'broadcasts' as const, row })),
    ...TRANSACTIONAL_EMAILS.map((row) => ({ section: 'transactional' as const, row })),
    ...WORKFLOWS.filter((row) => row.view === 'Messaging').map((row) => ({ section: 'workflows' as const, row })),
    ...TEMPLATES.map((row) => ({ section: 'templates' as const, row })),
]

/** The next sends, for variant B's overview card. */
export const UPCOMING = [
    { day: 'Thu, Oct 30', items: [{ time: '15:00', name: 'Webinar reminder: data pipelines', kind: 'Broadcast' }] },
    {
        day: 'Mon, Nov 3',
        items: [
            { time: '09:00', name: 'November product update', kind: 'Broadcast' },
            { time: '10:00', name: 'Weekly activation loop', kind: 'Workflow' },
        ],
    },
] as const
