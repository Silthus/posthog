// PROTOTYPE ONLY (silthus/posthog#212). Starter templates from the real library, picked against the project's
// data, each with an editable email draft and canned PostHog AI edits.
import type { HogFlow, HogFlowAction } from '../../Workflows/hogflows/types'
import { EMAIL_NODE_ID, ProjectFacts, TEAM_BRAND, WORKFLOW_ID } from './firstRunScenario'

export type StarterId = 'welcome' | 'comeback' | 'adoption' | 'trial' | 'onboarding'
export type AiEdit = 'shorter' | 'friendlier' | 'trial' | 'reply'

export interface EmailDraft {
    subject: string
    heading: string
    body: string
    cta: string
}

export interface Starter {
    id: StarterId
    name: string
    description: string
    triggerEvent: string
    triggerLabel: string
    delay: string | null
    draft: EmailDraft
}

export const LIBRARY_TEMPLATE_COUNT = 18

export const STARTERS: Starter[] = [
    {
        id: 'welcome',
        name: 'Welcome email sequence',
        description: 'Welcome new signups with an intro email, then check in on how they are getting on.',
        triggerEvent: 'signed_up',
        triggerLabel: 'When someone signs up',
        delay: null,
        draft: {
            subject: `Welcome to ${TEAM_BRAND.name}`,
            heading: `Welcome to ${TEAM_BRAND.name}`,
            body: `Thanks for signing up. We built ${TEAM_BRAND.name} to save you time, and the fastest way to see it is to create your first project.\n\nIf anything gets in the way, just reply to this email. A real person reads every reply.`,
            cta: 'Create your first project',
        },
    },
    {
        id: 'comeback',
        name: 'Re-engagement workflow for inactive users',
        description: 'Win back people who have not opened your product for a while, with a friendly reminder.',
        triggerEvent: '$pageview',
        triggerLabel: 'When someone goes quiet for 14 days',
        delay: '14d',
        draft: {
            subject: 'We saved your spot',
            heading: 'It has been a while',
            body: `Your ${TEAM_BRAND.name} account is right where you left it. A lot has changed since your last visit, and your projects are waiting.\n\nCome back and pick up where you stopped.`,
            cta: `Open ${TEAM_BRAND.name}`,
        },
    },
    {
        id: 'adoption',
        name: 'Feature adoption tips',
        description:
            'Send a short series of tips after someone starts using a feature, so they reach the point where it pays off.',
        triggerEvent: '$pageview',
        triggerLabel: 'When someone opens a feature for the first time',
        delay: '1d',
        draft: {
            subject: 'One tip to get more out of reports',
            heading: 'You found reports. Here is the trick.',
            body: 'Most people stop at the default view. Save a report to a dashboard and it updates on its own every morning.\n\nIt takes about a minute.',
            cta: 'Try it now',
        },
    },
    {
        id: 'trial',
        name: 'Reminder for trial ending soon',
        description: 'Email trial users before their trial runs out, and invite them to upgrade.',
        triggerEvent: 'trial_started',
        triggerLabel: 'When a trial starts',
        delay: '11d',
        draft: {
            subject: 'Your trial ends in 3 days',
            heading: 'Three days left in your trial',
            body: 'Your trial ends soon. Upgrade now to keep your projects and everything you set up.',
            cta: 'Choose a plan',
        },
    },
    {
        id: 'onboarding',
        name: 'Onboarding started but not completed',
        description: 'Nudge people who start onboarding and go quiet for a day.',
        triggerEvent: 'onboarding_started',
        triggerLabel: 'When onboarding starts',
        delay: '1d',
        draft: {
            subject: 'Need a hand finishing setup?',
            heading: 'You are almost there',
            body: 'You started setting up yesterday. Two steps are left, and they take about five minutes.',
            cta: 'Finish setup',
        },
    },
]

export function starterById(id: StarterId): Starter {
    return STARTERS.find((starter) => starter.id === id) ?? STARTERS[0]
}

export interface StarterPick {
    starter: Starter
    ready: boolean
    reason: string
}

export function pickStarters(facts: ProjectFacts): StarterPick[] {
    const sendsPageviews = facts.people > 0
    return STARTERS.map((starter): StarterPick => {
        if (starter.triggerEvent === 'signed_up') {
            return facts.signupEvent
                ? {
                      starter,
                      ready: true,
                      reason: `You send signed_up, ${facts.signupsThisMonth.toLocaleString()} times this month`,
                  }
                : { starter, ready: false, reason: 'Needs a signed_up event' }
        }
        if (starter.triggerEvent === '$pageview') {
            return sendsPageviews
                ? { starter, ready: true, reason: `${facts.people.toLocaleString()} people visit your app` }
                : { starter, ready: false, reason: 'Needs pageviews from your app' }
        }
        return { starter, ready: false, reason: `Needs a ${starter.triggerEvent} event` }
    }).sort((a, b) => Number(b.ready) - Number(a.ready))
}

export const AI_EDITS: { key: AiEdit; label: string; reply: string }[] = [
    { key: 'shorter', label: 'Make it shorter', reply: 'Done. I cut it down to the one thing that matters.' },
    { key: 'friendlier', label: 'Make it friendlier', reply: 'Done. It sounds more like a person now.' },
    { key: 'trial', label: 'Mention our free trial', reply: 'Added a line about the 14-day free trial.' },
    { key: 'reply', label: 'Ask them to reply', reply: 'It now ends with a question people can answer.' },
]

export function aiEditFor(prompt: string): AiEdit {
    const text = prompt.toLowerCase()
    if (text.includes('short')) {
        return 'shorter'
    }
    if (text.includes('trial')) {
        return 'trial'
    }
    if (text.includes('reply') || text.includes('question')) {
        return 'reply'
    }
    return 'friendlier'
}

export function applyAiEdit(draft: EmailDraft, edit: AiEdit): EmailDraft {
    switch (edit) {
        case 'shorter':
            return { ...draft, body: draft.body.split('\n\n')[0] }
        case 'friendlier':
            return {
                ...draft,
                heading: `Hey {{name}}, ${draft.heading.charAt(0).toLowerCase()}${draft.heading.slice(1)}`,
                body: draft.body.replace('Thanks for signing up.', 'So glad you are here!'),
            }
        case 'trial':
            return {
                ...draft,
                body: `${draft.body}\n\nYour free trial runs for 14 days, with every feature switched on.`,
            }
        case 'reply':
            return { ...draft, body: `${draft.body}\n\nOne question: what made you sign up? Just hit reply.` }
    }
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function emailHtml({
    draft,
    branded,
    recipientName,
}: {
    draft: EmailDraft
    branded: boolean
    recipientName: string
}): string {
    const accent = branded ? TEAM_BRAND.color : '#1d1f27'
    const logo = branded ? `&#9650; ${TEAM_BRAND.name}` : TEAM_BRAND.name
    const heading = escapeHtml(draft.heading).replace('{{name}}', recipientName)
    const paragraphs = draft.body
        .split('\n\n')
        .map((paragraph) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(paragraph)}</p>`)
        .join('')
    return `<html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,sans-serif;color:#18181b">
<div style="max-width:520px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7">
<div style="background:${accent};color:#fff;padding:18px 24px;font-weight:700;font-size:18px">${logo}</div>
<div style="padding:24px">
<h1 style="margin:0 0 12px;font-size:22px">${heading}</h1>
${paragraphs}
<a href="#" style="display:inline-block;margin-top:8px;background:${accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">${escapeHtml(draft.cta)}</a>
<p style="margin:24px 0 0;color:#71717a;font-size:13px">Ada and the ${TEAM_BRAND.name} team</p>
</div></div></body></html>`
}

function emailStep(draft: EmailDraft, integrationId: number): HogFlowAction {
    return {
        id: EMAIL_NODE_ID,
        type: 'function_email',
        name: 'Email',
        description: '',
        config: {
            template_id: 'template-email',
            inputs: {
                email: {
                    order: 0,
                    templating: 'liquid',
                    value: {
                        to: { name: '{{ person.properties.name }}', email: '{{ person.properties.email }}' },
                        from: { integrationId },
                        subject: draft.subject,
                        preheader: '',
                        html: emailHtml({ draft, branded: true, recipientName: '{{ person.properties.name }}' }),
                        text: '',
                    },
                },
            },
        },
    } as HogFlowAction
}

export function starterWorkflow({
    starter,
    draft,
    status,
    senderIntegrationId,
}: {
    starter: Starter
    draft: EmailDraft
    status: HogFlow['status']
    senderIntegrationId: number
}): HogFlow {
    const trigger: HogFlow['trigger'] = {
        type: 'event',
        filters: {
            events: [{ id: starter.triggerEvent, name: starter.triggerEvent, type: 'events' }],
            properties: [],
            actions: [],
        },
    }
    const actions: HogFlowAction[] = [
        {
            id: 'trigger_node',
            type: 'trigger',
            name: starter.triggerLabel,
            description: '',
            config: trigger,
        } as HogFlowAction,
        ...(starter.delay
            ? [
                  {
                      id: 'delay',
                      type: 'delay',
                      name: `Wait ${starter.delay.replace('d', ' days')}`,
                      description: '',
                      config: { delay_duration: starter.delay },
                  } as HogFlowAction,
              ]
            : []),
        emailStep(draft, senderIntegrationId),
        {
            id: 'exit_node',
            type: 'exit',
            name: 'Exit',
            description: '',
            config: { reason: 'Completed' },
        } as HogFlowAction,
    ]
    const order = actions.map((action) => action.id)
    return {
        id: WORKFLOW_ID,
        team_id: 1,
        version: 1,
        name: starter.name,
        description: starter.description,
        status,
        trigger,
        conversion: { window: '7d', filters: [] },
        exit_condition: 'exit_only_at_end',
        variables: [],
        actions,
        edges: order.slice(1).map((to, index) => ({ from: order[index], to, type: 'continue' as const })),
        created_at: '2026-10-03T09:00:00.000Z',
        updated_at: '2026-10-03T09:00:00.000Z',
    } as HogFlow
}
