// PROTOTYPE, never merged: Silthus/personal#212. Invented sample data; no real customer material.

export type SendStatus = 'Draft' | 'Scheduled' | 'Sending' | 'Sent' | 'Live' | 'Paused'
export type WorkflowView = 'Messaging' | 'Automation' | 'Loop'

export const BROADCASTS = [
    {
        name: 'November product update',
        status: 'Scheduled',
        audience: 'All active users',
        when: 'Nov 3, 09:00',
        openRate: '—',
    },
    {
        name: 'Webinar reminder: data pipelines',
        status: 'Scheduled',
        audience: 'Webinar sign-ups',
        when: 'Oct 30, 15:00',
        openRate: '—',
    },
    { name: 'Pricing page refresh', status: 'Draft', audience: 'Trial users', when: 'Not scheduled', openRate: '—' },
    {
        name: 'October product update',
        status: 'Sent',
        audience: 'All active users',
        when: 'Oct 6, 09:00',
        openRate: '41%',
    },
    {
        name: 'Beta invite: session summaries',
        status: 'Sent',
        audience: 'Beta cohort',
        when: 'Sep 22, 11:30',
        openRate: '58%',
    },
] as const

export const TRANSACTIONAL_EMAILS = [
    { name: 'Password reset', key: 'password-reset', sends: '1,204', lastSent: '2 minutes ago' },
    { name: 'Magic link sign-in', key: 'magic-link', sends: '3,877', lastSent: 'Just now' },
    { name: 'Invoice ready', key: 'invoice-ready', sends: '212', lastSent: '1 hour ago' },
] as const

export const WORKFLOWS = [
    { name: 'Onboarding drip', status: 'Live', view: 'Messaging', channels: 'Email', trigger: 'Signed up' },
    {
        name: 'Trial ending nudge',
        status: 'Live',
        view: 'Messaging',
        channels: 'Email, SMS',
        trigger: 'Trial ends in 3 days',
    },
    {
        name: 'Win-back after 30 days',
        status: 'Paused',
        view: 'Messaging',
        channels: 'Email',
        trigger: 'Inactive 30 days',
    },
    {
        name: 'Alert sales on big signup',
        status: 'Live',
        view: 'Automation',
        channels: 'Slack',
        trigger: 'Company size > 500',
    },
    { name: 'Sync new users to CRM', status: 'Live', view: 'Automation', channels: 'Webhook', trigger: 'Signed up' },
    {
        name: 'Churn risk follow-up',
        status: 'Live',
        view: 'Messaging',
        channels: 'Email, Slack',
        trigger: 'Usage dropped',
    },
    { name: 'Weekly activation loop', status: 'Live', view: 'Loop', channels: 'Email', trigger: 'Every Monday' },
] as const

export const TEMPLATES = [
    { name: 'Product update', kind: 'Email', transactional: false, updated: 'Oct 2' },
    { name: 'Password reset', kind: 'Email', transactional: true, updated: 'Sep 14' },
    { name: 'Magic link sign-in', kind: 'Email', transactional: true, updated: 'Sep 14' },
    { name: 'Invoice ready', kind: 'Email', transactional: true, updated: 'Aug 30' },
    { name: 'Welcome to the team', kind: 'Email', transactional: false, updated: 'Aug 2' },
] as const

export const CALENDAR = [
    { day: 'Wed, Oct 29', items: [{ time: '09:00', name: 'Onboarding drip, step 2', kind: 'Workflow' }] },
    { day: 'Thu, Oct 30', items: [{ time: '15:00', name: 'Webinar reminder: data pipelines', kind: 'Broadcast' }] },
    {
        day: 'Mon, Nov 3',
        items: [
            { time: '09:00', name: 'November product update', kind: 'Broadcast' },
            { time: '10:00', name: 'Weekly activation loop', kind: 'Workflow' },
        ],
    },
] as const

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
