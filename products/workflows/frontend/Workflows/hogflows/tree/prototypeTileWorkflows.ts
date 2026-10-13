// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// The common workflows, with invented companies and content. Template ids that start with
// `prototype-` are invented step kinds (AI prompt, replay summary, run insight) to show how they could look.
import type { HogFlow, HogFlowAction } from '../types'

type Edge = HogFlow['edges'][number]
type AnyConfig = Record<string, any>

const BASE = {
    team_id: 1,
    version: 1,
    status: 'draft',
    exit_condition: 'exit_only_at_end',
    created_at: '2026-10-01T09:00:00.000Z',
    updated_at: '2026-10-10T12:00:00.000Z',
    variables: [],
} as const

const step = (id: string, type: string, name: string, config: AnyConfig): HogFlowAction =>
    ({ id, type, name, description: '', config }) as HogFlowAction

const fn = (id: string, name: string, templateId: string, inputs: AnyConfig): HogFlowAction =>
    step(id, 'function', name, {
        template_id: templateId,
        inputs: Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, { value }])),
    })

const slack = (id: string, name: string, channel: string, text: string): HogFlowAction =>
    fn(id, name, 'template-slack', { slack_workspace: 1, channel, text })

const aiPrompt = (id: string, name: string, prompt: string, outputs: string[], tools: string[] = []): HogFlowAction =>
    fn(id, name, 'prototype-ai-prompt', { prompt, outputs, tools })

const emailHtml = (brand: string, accent: string, heading: string, paragraphs: string[], cta: string): string =>
    [
        '<html><body style="margin:0;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#1f2937">',
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">',
        '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px">',
        `<tr><td style="padding:28px 40px 4px;font-size:14px;font-weight:700;color:${accent}">${brand}</td></tr>`,
        `<tr><td style="padding:8px 40px"><h1 style="margin:0;font-size:26px;line-height:1.3">${heading}</h1></td></tr>`,
        ...paragraphs.map((p) => `<tr><td style="padding:8px 40px;font-size:16px;line-height:1.6">${p}</td></tr>`),
        `<tr><td style="padding:24px 40px 40px"><a href="https://example.com" style="background:${accent};color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none">${cta}</a></td></tr>`,
        '</table></td></tr></table></body></html>',
    ].join('')

type Brand = { name: string; accent: string }
const QUILLMATE: Brand = { name: 'Quillmate', accent: '#6d28d9' }
const FERNWOOD: Brand = { name: 'Fernwood Outfitters', accent: '#3f5a2e' }

const email = (
    id: string,
    name: string,
    brand: Brand,
    subject: string,
    preheader: string,
    paragraphs: string[],
    cta: string,
    category: 'marketing' | 'transactional' = 'marketing'
): HogFlowAction =>
    step(id, 'function_email', name, {
        template_id: 'template-email',
        message_category_type: category,
        inputs: {
            email: {
                order: 0,
                templating: 'liquid',
                value: {
                    to: { name: '', email: '{{ person.properties.email }}' },
                    from: { integrationId: 1 },
                    subject,
                    preheader,
                    html: emailHtml(brand.name, brand.accent, subject, paragraphs, cta),
                    text: paragraphs.join('\n\n'),
                },
            },
        },
    })

const eventTrigger = (name: string, properties: AnyConfig[] = []): HogFlow['trigger'] =>
    ({
        type: 'event',
        filters: { events: [{ id: name, name, type: 'events' }], properties, actions: [] },
    }) as HogFlow['trigger']

const triggerStep = (name: string, trigger: HogFlow['trigger']): HogFlowAction =>
    step('trigger_node', 'trigger', name, trigger as AnyConfig)

const delay = (id: string, duration: string): HogFlowAction =>
    step(id, 'delay', `Wait ${duration}`, { delay_duration: duration })

const waitFor = (id: string, eventName: string, maxWait: string): HogFlowAction =>
    step(id, 'wait_until_condition', `Wait for ${eventName}`, {
        condition: { name: eventName, filters: { events: [{ id: eventName, name: eventName, type: 'events' }] } },
        max_wait_duration: maxWait,
    })

const businessHours = (id: string): HogFlowAction =>
    step(id, 'wait_until_time_window', 'Business hours', { timezone: 'UTC', day: 'weekday', time: ['09:00', '17:00'] })

const split = (
    id: string,
    name: string,
    key: string,
    type: string,
    values: [string, string, string?][]
): HogFlowAction =>
    step(id, 'conditional_branch', name, {
        conditions: values.map(([label, value, operator]) => ({
            name: label,
            filters: { properties: [{ key, type, value: [value], operator: operator ?? 'exact' }] },
        })),
    })

const exit = (id: string, reason: string): HogFlowAction => step(id, 'exit', 'Exit', { reason })

const next = (from: string, to: string): Edge => ({ from, to, type: 'continue' })
const branch = (from: string, to: string, index: number): Edge => ({ from, to, type: 'branch', index })

const flow = (
    id: string,
    name: string,
    description: string,
    trigger: HogFlow['trigger'],
    actions: HogFlowAction[],
    edges: Edge[],
    extra: Partial<HogFlow> = {}
): HogFlow => ({ ...BASE, id, name, description, trigger, actions, edges, ...extra }) as HogFlow

function welcomeSequence(): HogFlow {
    const trigger = eventTrigger('Signed up')
    return flow(
        'prototype-tile-welcome-sequence',
        'Welcome email sequence',
        'Welcomes new Quillmate accounts and nudges them to their first document.',
        trigger,
        [
            triggerStep('Signed up', trigger),
            email(
                'welcome',
                'Welcome',
                QUILLMATE,
                'Welcome to Quillmate',
                'Your first doc takes two minutes',
                ['Thanks for signing up. Here is the fastest way to write your first doc together with your team.'],
                'Write your first doc'
            ),
            waitFor('wait_first_doc', 'Created first doc', '2d'),
            email(
                'tips',
                'Tips',
                QUILLMATE,
                'Three tricks for your next doc',
                'Slash commands, templates, and comments',
                ['You wrote your first doc. Here are three tricks that people use every day.'],
                'See the tricks'
            ),
            email(
                'templates',
                'Templates',
                QUILLMATE,
                'Start from a template',
                'Twenty ready-made docs to copy',
                ['Not sure where to begin? Pick a template and change it to fit.'],
                'Browse templates'
            ),
            delay('wait_three_days', '3d'),
            email(
                'invite',
                'Invite',
                QUILLMATE,
                'Quillmate is better with your team',
                'Invite three people for free',
                ['Docs get better when people comment on them. Invite your team to try it.'],
                'Invite your team'
            ),
            exit('exit_node', 'Welcome sequence finished'),
        ],
        [
            next('trigger_node', 'welcome'),
            next('welcome', 'wait_first_doc'),
            branch('wait_first_doc', 'tips', 0),
            next('wait_first_doc', 'templates'),
            next('tips', 'wait_three_days'),
            next('templates', 'wait_three_days'),
            next('wait_three_days', 'invite'),
            next('invite', 'exit_node'),
        ],
        { conversion: { window: '14d', filters: [] } } as Partial<HogFlow>
    )
}

function supportTicketToSlack(): HogFlow {
    const trigger = eventTrigger('Ticket created')
    return flow(
        'prototype-tile-ticket-to-slack',
        'New support ticket to Slack',
        'Posts every new support ticket to Slack, urgent ones right away.',
        trigger,
        [
            triggerStep('Ticket created', trigger),
            split('by_priority', 'By priority', 'priority', 'event', [['Urgent', 'urgent']]),
            slack(
                'urgent_slack',
                'Urgent ticket',
                '#support-urgent',
                '@here Urgent ticket from {person.properties.email}: {event.properties.subject}'
            ),
            businessHours('business_hours'),
            slack(
                'ticket_slack',
                'New ticket',
                '#support',
                'New ticket from {person.properties.email}: {event.properties.subject}'
            ),
            exit('exit_node', 'Team notified'),
        ],
        [
            next('trigger_node', 'by_priority'),
            branch('by_priority', 'urgent_slack', 0),
            next('by_priority', 'business_hours'),
            next('business_hours', 'ticket_slack'),
            next('urgent_slack', 'exit_node'),
            next('ticket_slack', 'exit_node'),
        ]
    )
}

function negativeSurvey(): HogFlow {
    const trigger = eventTrigger('survey sent', [{ key: 'nps_score', type: 'event', value: '6', operator: 'lte' }])
    return flow(
        'prototype-tile-negative-survey',
        'Negative survey response alert',
        'Alerts the team when someone gives a low score, with a summary of their last session.',
        trigger,
        [
            triggerStep('Survey response', trigger),
            fn('summarize_replay', 'Summarize last session', 'prototype-summarize-replay', {
                session: 'latest',
                lookback: '24h',
                output: 'session_summary',
            }),
            slack(
                'alert_slack',
                'Alert the team',
                '#customer-voice',
                'Score {event.properties.nps_score} from {person.properties.email}: “{event.properties.comment}”\n{variables.session_summary}'
            ),
            fn('mark_detractor', 'Mark detractor', 'template-posthog-update-person-properties', {
                properties: { nps_segment: 'detractor' },
            }),
            exit('exit_node', 'Team alerted'),
        ],
        [
            next('trigger_node', 'summarize_replay'),
            next('summarize_replay', 'alert_slack'),
            next('alert_slack', 'mark_detractor'),
            next('mark_detractor', 'exit_node'),
        ]
    )
}

function trialToPaid(): HogFlow {
    const trigger = eventTrigger('Trial started')
    return flow(
        'prototype-tile-trial-to-paid',
        'Convert trials to paid',
        'Helps active trials upgrade and gives stuck trials a hand before the trial ends.',
        trigger,
        [
            triggerStep('Trial started', trigger),
            delay('wait_ten_days', '10d'),
            split('by_activation', 'Activated?', 'docs_created', 'person', [['Active', '3', 'gte']]),
            email(
                'upgrade',
                'Upgrade',
                QUILLMATE,
                'Keep your team’s docs after the trial',
                'Upgrade now and keep everything',
                ['Your team wrote a lot this week. Upgrade to keep every doc and comment.'],
                'Upgrade'
            ),
            split('by_seats', 'Big team?', 'seats', 'person', [['10+ seats', '10', 'gte']]),
            slack(
                'sales_slack',
                'Tell sales',
                '#sales-trials',
                'Big trial is stuck: {person.properties.company} ({person.properties.seats} seats)'
            ),
            email(
                'help',
                'Need a hand',
                QUILLMATE,
                'Need a hand getting started?',
                'Book 15 minutes with us',
                ['It looks like you have not written many docs yet. We are happy to help.'],
                'Book a call'
            ),
            waitFor('wait_upgrade', 'Upgraded', '4d'),
            exit('exit_converted', 'Converted to paid'),
            email(
                'last_day',
                'Last day',
                QUILLMATE,
                'Your trial ends tomorrow',
                'Pick a plan to keep your docs',
                ['Your trial ends tomorrow. Pick a plan so your team keeps working.'],
                'Pick a plan'
            ),
            exit('exit_node', 'Trial ended'),
        ],
        [
            next('trigger_node', 'wait_ten_days'),
            next('wait_ten_days', 'by_activation'),
            branch('by_activation', 'upgrade', 0),
            next('by_activation', 'by_seats'),
            branch('by_seats', 'sales_slack', 0),
            next('by_seats', 'help'),
            next('sales_slack', 'wait_upgrade'),
            next('help', 'wait_upgrade'),
            next('upgrade', 'wait_upgrade'),
            branch('wait_upgrade', 'exit_converted', 0),
            next('wait_upgrade', 'last_day'),
            next('last_day', 'exit_node'),
        ],
        { conversion: { window: '14d', filters: [] } } as Partial<HogFlow>
    )
}

function abandonedCheckout(): HogFlow {
    const trigger = eventTrigger('Checkout started')
    return flow(
        'prototype-tile-abandoned-checkout',
        'Abandoned checkout recovery',
        'Reminds people who left a checkout, then offers a discount.',
        trigger,
        [
            triggerStep('Checkout started', trigger),
            waitFor('wait_order', 'Order completed', '1h'),
            exit('exit_bought', 'Bought'),
            email(
                'reminder',
                'Reminder',
                FERNWOOD,
                'You left something in your cart',
                'Your gear is still waiting',
                ['The items in your cart are still there. Finish your order before they sell out.'],
                'Back to my cart'
            ),
            waitFor('wait_order_again', 'Order completed', '1d'),
            exit('exit_bought_later', 'Bought after reminder'),
            email(
                'discount',
                'Discount',
                FERNWOOD,
                '10% off the gear in your cart',
                'Use code TRAIL10 at checkout',
                ['Here is 10% off to help you decide. The code works for 48 hours.'],
                'Use my discount'
            ),
            exit('exit_node', 'Recovery finished'),
        ],
        [
            next('trigger_node', 'wait_order'),
            branch('wait_order', 'exit_bought', 0),
            next('wait_order', 'reminder'),
            next('reminder', 'wait_order_again'),
            branch('wait_order_again', 'exit_bought_later', 0),
            next('wait_order_again', 'discount'),
            next('discount', 'exit_node'),
        ]
    )
}

function paymentFailed(): HogFlow {
    const trigger = {
        type: 'webhook',
        template_id: 'template-source-stripe',
        inputs: {},
    } as unknown as HogFlow['trigger']
    return flow(
        'prototype-tile-payment-failed',
        'Payment failed alert',
        'Tells the customer and the billing team when a payment fails, then follows up.',
        trigger,
        [
            step('trigger_node', 'trigger', 'Stripe: invoice.payment_failed', trigger as AnyConfig),
            fn('mark_past_due', 'Mark past due', 'template-posthog-update-person-properties', {
                properties: { billing_status: 'past_due' },
            }),
            email(
                'payment_email',
                'Payment failed',
                QUILLMATE,
                'Your payment didn’t go through',
                'Update your card to keep your plan',
                ['We could not charge your card. Update it in billing settings to keep your plan.'],
                'Update my card',
                'transactional'
            ),
            slack(
                'billing_slack',
                'Tell billing',
                '#billing',
                'Payment failed for {person.properties.company}: {event.properties.amount}'
            ),
            delay('wait_three_days', '3d'),
            split('still_past_due', 'Still past due?', 'billing_status', 'person', [['Past due', 'past_due']]),
            email(
                'last_reminder',
                'Last reminder',
                QUILLMATE,
                'Last reminder: update your card',
                'Your plan pauses in 4 days',
                ['We still could not charge your card. Your plan pauses in four days.'],
                'Update my card',
                'transactional'
            ),
            exit('exit_node', 'Payment handled'),
        ],
        [
            next('trigger_node', 'mark_past_due'),
            next('mark_past_due', 'payment_email'),
            next('payment_email', 'billing_slack'),
            next('billing_slack', 'wait_three_days'),
            next('wait_three_days', 'still_past_due'),
            branch('still_past_due', 'last_reminder', 0),
            next('still_past_due', 'exit_node'),
            next('last_reminder', 'exit_node'),
        ]
    )
}

function sreInvestigator(): HogFlow {
    const trigger = eventTrigger('$error_tracking_issue_spiking')
    return flow(
        'prototype-tile-sre-investigator',
        'AI incident investigator',
        'When an error spikes, an AI scout investigates and pages the right people.',
        trigger,
        [
            triggerStep('Error spike', trigger),
            fn('investigate', 'Investigate', 'template-posthog-run-scout', {
                skill_name: 'incident-investigator',
                outputs: ['severity', 'root_cause', 'suspect_deploy'],
            }),
            split('by_severity', 'By severity', 'severity', 'workflow_variable', [
                ['Sev 1', 'sev1'],
                ['Sev 2', 'sev2'],
            ]),
            fn('page_oncall', 'Page on-call', 'template-webhook', {
                url: 'https://events.example.com/v2/enqueue',
                method: 'POST',
                body: { severity: '{variables.severity}' },
            }),
            slack(
                'incident_slack',
                'Open incident',
                '#incidents',
                '🔥 {variables.severity}: {variables.root_cause}\nSuspect deploy: {variables.suspect_deploy}'
            ),
            slack('eng_slack', 'Tell engineering', '#eng-alerts', '{variables.severity}: {variables.root_cause}'),
            exit('exit_node', 'Investigation shared'),
        ],
        [
            next('trigger_node', 'investigate'),
            next('investigate', 'by_severity'),
            branch('by_severity', 'page_oncall', 0),
            next('page_oncall', 'incident_slack'),
            branch('by_severity', 'eng_slack', 1),
            next('by_severity', 'exit_node'),
            next('incident_slack', 'exit_node'),
            next('eng_slack', 'exit_node'),
        ]
    )
}

function weeklyReport(): HogFlow {
    const trigger = {
        type: 'schedule',
        schedule: { rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9', timezone: 'UTC' },
    } as unknown as HogFlow['trigger']
    return flow(
        'prototype-tile-weekly-report',
        'Weekly growth report',
        'Every Monday, runs the growth insights, writes a summary, and posts it.',
        trigger,
        [
            step('trigger_node', 'trigger', 'Every Monday', trigger as AnyConfig),
            fn('run_insights', 'Run insights', 'prototype-run-insight', {
                insights: ['Weekly signups', 'Activation rate', 'Revenue by plan'],
                range: 'Last 7 days',
                output: 'report',
            }),
            aiPrompt(
                'write_summary',
                'Write summary',
                'Write five bullets about what changed in {variables.report} compared to last week. Lead with the biggest change.',
                ['summary']
            ),
            slack('report_slack', 'Post report', '#growth', '*Weekly growth*\n{variables.summary}'),
            exit('exit_node', 'Report posted'),
        ],
        [
            next('trigger_node', 'run_insights'),
            next('run_insights', 'write_summary'),
            next('write_summary', 'report_slack'),
            next('report_slack', 'exit_node'),
        ]
    )
}

function aiTriage(): HogFlow {
    const trigger = eventTrigger('Ticket created')
    return flow(
        'prototype-tile-ai-triage',
        'AI support triage',
        'An AI step sorts every new ticket, answers how-to questions, and routes the rest.',
        trigger,
        [
            triggerStep('Ticket created', trigger),
            aiPrompt(
                'classify',
                'Classify ticket',
                'Read the ticket. Pick a category (how_to, bug, billing), an urgency from 1 to 3, and the customer’s mood.',
                ['category', 'urgency', 'mood'],
                ['Search docs', 'Read past tickets']
            ),
            split('by_category', 'By category', 'category', 'workflow_variable', [
                ['How-to', 'how_to'],
                ['Bug', 'bug'],
                ['Billing', 'billing'],
            ]),
            fn('draft_reply', 'Draft reply', 'template-posthog-create-task', {
                title: 'Answer the question',
                instructions: 'Answer the question with links to the docs. Say how sure you are from 0 to 1.',
                outputs: ['reply', 'confidence'],
            }),
            split('by_confidence', 'Sure enough?', 'confidence', 'workflow_variable', [['Sure', '0.8', 'gte']]),
            fn('send_reply', 'Send reply', 'template-posthog-send-ticket-message', {
                ticket_id: '{event.properties.ticket_id}',
                message: '{variables.reply}',
                is_private: false,
            }),
            fn('save_note', 'Save as note', 'template-posthog-send-ticket-message', {
                ticket_id: '{event.properties.ticket_id}',
                message: '{variables.reply}',
                is_private: true,
            }),
            fn('tag_bug', 'Route to engineering', 'template-posthog-update-ticket', {
                ticket_id: '{event.properties.ticket_id}',
                tags: ['bug'],
                assignee: 'Engineering',
            }),
            slack('bug_slack', 'Tell engineering', '#bugs', 'New bug ticket: {event.properties.subject}'),
            fn('tag_billing', 'Route to billing', 'template-posthog-update-ticket', {
                ticket_id: '{event.properties.ticket_id}',
                tags: ['billing'],
                assignee: 'Billing',
            }),
            exit('exit_node', 'Ticket triaged'),
        ],
        [
            next('trigger_node', 'classify'),
            next('classify', 'by_category'),
            branch('by_category', 'draft_reply', 0),
            next('draft_reply', 'by_confidence'),
            branch('by_confidence', 'send_reply', 0),
            next('by_confidence', 'save_note'),
            branch('by_category', 'tag_bug', 1),
            next('tag_bug', 'bug_slack'),
            branch('by_category', 'tag_billing', 2),
            next('by_category', 'exit_node'),
            next('send_reply', 'exit_node'),
            next('save_note', 'exit_node'),
            next('bug_slack', 'exit_node'),
            next('tag_billing', 'exit_node'),
        ]
    )
}

export const TILE_WORKFLOWS: HogFlow[] = [
    welcomeSequence(),
    supportTicketToSlack(),
    negativeSurvey(),
    trialToPaid(),
    abandonedCheckout(),
    paymentFailed(),
    sreInvestigator(),
    weeklyReport(),
    aiTriage(),
]
