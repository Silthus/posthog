// PROTOTYPE ONLY (silthus/posthog#212). Shared constants for the first-run prototype. Never ship.
import { urls } from 'scenes/urls'

export const FIRST_RUN_PROTOTYPE_FLAG = 'workflows-first-run-prototype'

export function isFirstRunPrototype(): boolean {
    const flags = (window as any).POSTHOG_APP_CONTEXT?.persisted_feature_flags
    if (Array.isArray(flags)) {
        return flags.includes(FIRST_RUN_PROTOTYPE_FLAG)
    }
    return Boolean(flags?.[FIRST_RUN_PROTOTYPE_FLAG])
}

export type ProjectData = 'signups-and-emails' | 'few-emails' | 'nothing-yet'
export type OwnDomain = 'none' | 'verifying' | 'verified'

export interface ProjectFacts {
    signupEvent: string | null
    signupsThisMonth: number
    people: number
    peopleWithEmail: number
}

export const PROJECT_FACTS: Record<ProjectData, ProjectFacts> = {
    'signups-and-emails': { signupEvent: 'signed_up', signupsThisMonth: 312, people: 1240, peopleWithEmail: 1180 },
    'few-emails': { signupEvent: 'signed_up', signupsThisMonth: 312, people: 1240, peopleWithEmail: 140 },
    'nothing-yet': { signupEvent: null, signupsThisMonth: 0, people: 0, peopleWithEmail: 0 },
}

export const SIGNED_IN_USER = { name: 'Ada', email: 'ada@example.com' }
export const TEAM_BRAND = { name: 'Example', domain: 'example.com', color: '#6d28d9' }

export const SHARED_SENDER = {
    integrationId: 1,
    address: 'onboarding@trial.posthog.com',
    label: `${TEAM_BRAND.name} <onboarding@trial.posthog.com>`,
}
export const OWN_SENDER = {
    integrationId: 2,
    address: `hello@${TEAM_BRAND.domain}`,
    label: `${TEAM_BRAND.name} <hello@${TEAM_BRAND.domain}>`,
}

export const WORKFLOW_ID = 'first-run-workflow'
export const EMAIL_NODE_ID = 'email'

export const SETUP_TASK = {
    sendExample: 'workflows_send_example_welcome',
    turnOnWelcome: 'launch_workflow',
    ownDomain: 'workflows_send_from_own_domain',
    brand: 'workflows_brand_your_emails',
    broadcast: 'workflows_send_a_broadcast',
    nudgeQuiet: 'workflows_nudge_quiet_users',
    templates: 'workflows_browse_templates',
} as const

export function firstWorkflowUrl(): string {
    return `${urls.workflow(WORKFLOW_ID, 'workflow')}?view=graph&node=${EMAIL_NODE_ID}`
}

export const RECENT_SIGNUPS: { name: string; email: string; signedUp: string }[] = [
    { name: 'Noor Haddad', email: 'noor@example.org', signedUp: '12 minutes ago' },
    { name: 'Tomás Rivera', email: 'tomas@example.net', signedUp: '1 hour ago' },
    { name: 'Mei Lin', email: 'mei.lin@example.org', signedUp: '3 hours ago' },
    { name: 'Jonas Becker', email: 'jonas@example.net', signedUp: '5 hours ago' },
    { name: 'Amara Okafor', email: 'amara@example.org', signedUp: 'Yesterday' },
]
