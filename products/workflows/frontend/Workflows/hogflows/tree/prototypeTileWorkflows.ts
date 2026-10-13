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

function springDrip(): HogFlow {
    const trigger = {
        type: 'batch',
        filters: { properties: [{ key: 'orders_count', type: 'person', value: '0', operator: 'exact' }] },
    } as unknown as HogFlow['trigger']
    return flow(
        'prototype-tile-spring-drip',
        'Spring trails drip campaign',
        'A three-email drip for subscribers who have not bought yet. Readers who click get the gear list and an offer.',
        trigger,
        [
            step('trigger_node', 'trigger', 'Audience: subscribers with no orders', trigger as AnyConfig),
            email(
                'trails',
                'Trails',
                FERNWOOD,
                'Five trails to walk this spring',
                'Short, steep, and very green',
                ['Our team picked five spring trails, from a one-hour loop to a full day out.'],
                'See the trails'
            ),
            waitFor('wait_click', 'Clicked email link', '3d'),
            email(
                'gear_list',
                'Gear list',
                FERNWOOD,
                'The gear list for those trails',
                'What we pack for a spring day out',
                ['Here is what our guides pack for a spring walk, from layers to snacks.'],
                'Shop the list'
            ),
            delay('wait_four_days', '4d'),
            email(
                'offer',
                'Offer',
                FERNWOOD,
                '20% off trail packs this week',
                'Ends Sunday at midnight',
                ['Your spring pack is 20% off until Sunday.'],
                'Get 20% off'
            ),
            email(
                'nudge',
                'Nudge',
                FERNWOOD,
                'Still planning your spring walks?',
                'The five trails are still here',
                ['Spring is short. Here are the five trails again, in case you missed them.'],
                'See the trails'
            ),
            exit('exit_node', 'Drip finished'),
        ],
        [
            next('trigger_node', 'trails'),
            next('trails', 'wait_click'),
            branch('wait_click', 'gear_list', 0),
            next('gear_list', 'wait_four_days'),
            next('wait_four_days', 'offer'),
            next('offer', 'exit_node'),
            next('wait_click', 'nudge'),
            next('nudge', 'exit_node'),
        ],
        { conversion: { window: '21d', filters: [] } } as Partial<HogFlow>
    )
}

function blackFriday(): HogFlow {
    const trigger = {
        type: 'batch',
        filters: { properties: [{ key: 'last_order_days', type: 'person', value: '365', operator: 'lt' }] },
    } as unknown as HogFlow['trigger']
    return flow(
        'prototype-tile-black-friday',
        'Black Friday',
        'VIPs get early access a day before everyone else. Buyers get a thank-you, everyone else a Cyber Monday reminder.',
        trigger,
        [
            step('trigger_node', 'trigger', 'Audience: bought in the last year', trigger as AnyConfig),
            split('by_tier', 'By tier', 'tier', 'person', [['VIP', 'vip']]),
            email(
                'vip_early',
                'VIP early access',
                FERNWOOD,
                'Your Black Friday starts a day early',
                'VIP early access, 30% off everything',
                ['As a VIP you get Black Friday a day early. 30% off everything, starting now.'],
                'Shop early'
            ),
            delay('wait_one_day', '1d'),
            email(
                'bf_email',
                'Black Friday',
                FERNWOOD,
                'Black Friday: 30% off everything',
                'Today only, while stock lasts',
                ['Black Friday is here. Everything is 30% off, today only.'],
                'Shop the sale'
            ),
            waitFor('wait_order', 'Order completed', '3d'),
            fn('tag_buyer', 'Tag buyer', 'template-posthog-update-person-properties', {
                properties: { bf_2026: 'buyer' },
            }),
            email(
                'thanks',
                'Thank you',
                FERNWOOD,
                'Thanks for your order',
                'Your gear is on its way',
                ['Thank you. Your order is packed and leaves the warehouse tomorrow.'],
                'Track my order',
                'transactional'
            ),
            email(
                'cyber_monday',
                'Cyber Monday',
                FERNWOOD,
                'Last chance: Cyber Monday deals end tonight',
                'Free shipping on every order',
                ['Cyber Monday ends tonight. Free shipping on everything, no minimum.'],
                'Shop Cyber Monday'
            ),
            slack(
                'marketing_slack',
                'Tell marketing',
                '#marketing',
                'Black Friday flow finished for {person.properties.email}'
            ),
            exit('exit_node', 'Campaign finished'),
        ],
        [
            next('trigger_node', 'by_tier'),
            branch('by_tier', 'vip_early', 0),
            next('vip_early', 'wait_one_day'),
            next('by_tier', 'wait_one_day'),
            next('wait_one_day', 'bf_email'),
            next('bf_email', 'wait_order'),
            branch('wait_order', 'tag_buyer', 0),
            next('tag_buyer', 'thanks'),
            next('thanks', 'marketing_slack'),
            next('wait_order', 'cyber_monday'),
            next('cyber_monday', 'marketing_slack'),
            next('marketing_slack', 'exit_node'),
        ]
    )
}

function ciAutoFix(): HogFlow {
    const trigger = {
        type: 'webhook',
        template_id: 'template-source-github',
        inputs: {},
    } as unknown as HogFlow['trigger']
    return flow(
        'prototype-tile-ci-autofix',
        'Auto-fix CI failures',
        'Listens for failed GitHub checks. Flaky tests get a re-run, real failures get an AI fix PR, and main going red pages the team.',
        trigger,
        [
            step('trigger_node', 'trigger', 'GitHub: check run failed', trigger as AnyConfig),
            split('by_branch', 'By branch', 'branch', 'event', [['Main', 'main']]),
            slack(
                'main_red',
                'Main is red',
                '#eng-alerts',
                ':red_circle: Main is red: {event.properties.check_name} failed on {event.properties.sha}'
            ),
            fn('main_fix', 'Fix main', 'template-posthog-create-task', {
                title: 'Fix the failing check on main',
                instructions: 'Find the commit that broke the check and open a revert or a fix PR.',
                outputs: ['pr_url'],
            }),
            aiPrompt(
                'classify_failure',
                'Classify failure',
                'Read the failed check log. Say if the failure is flaky, a real bug, or an infrastructure problem.',
                ['failure_kind'],
                ['Read CI logs', 'Read the diff']
            ),
            split('by_kind', 'By failure kind', 'failure_kind', 'workflow_variable', [
                ['Flaky', 'flaky'],
                ['Real bug', 'bug'],
                ['Infrastructure', 'infra'],
            ]),
            fn('rerun', 'Re-run the check', 'template-webhook', {
                url: 'https://github.example.com/repos/acme/app/check-runs/rerun',
                method: 'POST',
                body: { check_run_id: '{event.properties.check_run_id}' },
            }),
            fn('fix_pr', 'Open a fix PR', 'template-posthog-create-task', {
                title: 'Fix the failing check',
                instructions: 'Reproduce the failure, fix it, and open a PR against the branch.',
                outputs: ['pr_url'],
            }),
            waitFor('wait_merged', 'Fix PR merged', '1d'),
            slack(
                'author_slack',
                'Tell the author',
                '#eng-prs',
                'An AI fix for your failing check is waiting: {variables.pr_url}'
            ),
            slack('infra_slack', 'Tell infra', '#infra', 'CI infrastructure problem on {event.properties.check_name}'),
            exit('exit_node', 'Failure handled'),
        ],
        [
            next('trigger_node', 'by_branch'),
            branch('by_branch', 'main_red', 0),
            next('main_red', 'main_fix'),
            next('main_fix', 'exit_node'),
            next('by_branch', 'classify_failure'),
            next('classify_failure', 'by_kind'),
            branch('by_kind', 'rerun', 0),
            next('rerun', 'exit_node'),
            branch('by_kind', 'fix_pr', 1),
            next('fix_pr', 'wait_merged'),
            branch('wait_merged', 'exit_node', 0),
            next('wait_merged', 'author_slack'),
            next('author_slack', 'exit_node'),
            branch('by_kind', 'infra_slack', 2),
            next('infra_slack', 'exit_node'),
            next('by_kind', 'exit_node'),
        ]
    )
}

const flagStep = (id: string, rollout: number): HogFlowAction =>
    fn(id, `Roll out to ${rollout}%`, 'prototype-update-flag', { flag: 'new-checkout', rollout })

const errorCheck = (id: string): HogFlowAction =>
    fn(id, 'Check error rate', 'prototype-run-insight', {
        insights: ['Checkout error rate'],
        range: 'Last 7 days',
        output: 'error_rate',
    })

const errorSplit = (id: string): HogFlowAction =>
    split(id, 'Error rate', 'error_rate', 'workflow_variable', [['Too many errors', '2', 'gte']])

function flagRollout(): HogFlow {
    const trigger = { type: 'manual' } as unknown as HogFlow['trigger']
    return flow(
        'prototype-tile-flag-rollout',
        'Gradual rollout of new checkout',
        'Rolls the new-checkout flag out from 10% to 100% over three weeks. Each week it checks the error rate, rolls back if it is too high, and keeps Slack informed.',
        trigger,
        [
            step('trigger_node', 'trigger', 'Start rollout', trigger as AnyConfig),
            flagStep('flag_10', 10),
            slack('slack_10', 'Announce 10%', '#releases', 'new-checkout is live for 10% of people'),
            delay('week_1', '7d'),
            errorCheck('check_1'),
            errorSplit('split_1'),
            flagStep('rollback_1', 0),
            slack(
                'slack_rollback_1',
                'Announce rollback',
                '#releases',
                ':rewind: new-checkout rolled back at 10%: error rate {variables.error_rate}%'
            ),
            flagStep('flag_50', 50),
            slack('slack_50', 'Announce 50%', '#releases', 'new-checkout is live for 50% of people'),
            delay('week_2', '7d'),
            errorCheck('check_2'),
            errorSplit('split_2'),
            flagStep('rollback_2', 0),
            slack(
                'slack_rollback_2',
                'Announce rollback',
                '#releases',
                ':rewind: new-checkout rolled back at 50%: error rate {variables.error_rate}%'
            ),
            flagStep('flag_100', 100),
            slack('slack_100', 'Announce 100%', '#releases', ':rocket: new-checkout is live for everyone'),
            exit('exit_rolled_back', 'Rolled back'),
            exit('exit_node', 'Fully rolled out'),
        ],
        [
            next('trigger_node', 'flag_10'),
            next('flag_10', 'slack_10'),
            next('slack_10', 'week_1'),
            next('week_1', 'check_1'),
            next('check_1', 'split_1'),
            branch('split_1', 'rollback_1', 0),
            next('rollback_1', 'slack_rollback_1'),
            next('slack_rollback_1', 'exit_rolled_back'),
            next('split_1', 'flag_50'),
            next('flag_50', 'slack_50'),
            next('slack_50', 'week_2'),
            next('week_2', 'check_2'),
            next('check_2', 'split_2'),
            branch('split_2', 'rollback_2', 0),
            next('rollback_2', 'slack_rollback_2'),
            next('slack_rollback_2', 'exit_rolled_back'),
            next('split_2', 'flag_100'),
            next('flag_100', 'slack_100'),
            next('slack_100', 'exit_node'),
        ]
    )
}

/**
 * What an AI author would write about each path, so a collapsed workflow reads like a summary.
 * Keyed by `<split step id>:<edge type>:<edge index>`.
 */
export const PATH_SUMMARIES: Record<string, Record<string, string>> = {
    'prototype-tile-ai-triage': {
        'by_category:branch:0':
            'An AI agent drafts an answer from the docs. Sure answers go to the customer, unsure ones become a note for an agent.',
        'by_confidence:branch:0': 'Sends the AI answer to the customer right away.',
        'by_confidence:continue:': 'Saves the AI answer as a private note so an agent can check it first.',
        'by_category:branch:1': 'Assigns the ticket to engineering and posts it in #bugs.',
        'by_category:branch:2': 'Assigns the ticket to the billing team.',
    },
    'prototype-tile-trial-to-paid': {
        'by_activation:branch:0': 'Active trials get an upgrade email.',
        'by_activation:continue:': 'Stuck trials get help: big teams go to sales, small teams get a call offer.',
        'by_seats:branch:0': 'Tells sales in Slack so someone reaches out.',
        'by_seats:continue:': 'Offers a 15-minute call to get started.',
        'wait_upgrade:continue:': 'Nobody upgraded in 4 days: a last-day reminder.',
    },
    'prototype-tile-ticket-to-slack': {
        'by_priority:branch:0': 'Urgent tickets go to #support-urgent right away, with @here.',
        'by_priority:continue:': 'Other tickets wait for business hours, then go to #support.',
    },
    'prototype-tile-abandoned-checkout': {
        'wait_order:continue:': 'No order within an hour: a reminder, then a 10% discount a day later.',
        'wait_order_again:continue:': 'Still no order a day later: a 10% discount.',
    },
    'prototype-tile-payment-failed': {
        'still_past_due:branch:0': 'Still not paid after 3 days: a last reminder before the plan pauses.',
    },
    'prototype-tile-sre-investigator': {
        'by_severity:branch:0': 'Sev 1 pages on-call and opens an incident in #incidents.',
        'by_severity:branch:1': 'Sev 2 posts the root cause in #eng-alerts.',
    },
    'prototype-tile-welcome-sequence': {
        'wait_first_doc:branch:0': 'Wrote a first doc within 2 days: three tips for the next one.',
        'wait_first_doc:continue:': 'No doc after 2 days: a nudge to start from a template.',
    },
    'prototype-tile-spring-drip': {
        'wait_click:branch:0': 'Clicked a link: the gear list, then a 20% offer 4 days later.',
        'wait_click:continue:': 'No click in 3 days: one gentle nudge, then the drip ends.',
    },
    'prototype-tile-black-friday': {
        'by_tier:branch:0': 'VIPs get early access a day before the sale.',
        'wait_order:branch:0': 'Bought within 3 days: tagged as a buyer and thanked.',
        'wait_order:continue:': 'No order: a Cyber Monday last-chance email.',
    },
    'prototype-tile-ci-autofix': {
        'by_branch:branch:0': 'Main is red: alerts #eng-alerts and an AI agent opens a revert or fix PR.',
        'by_branch:continue:': 'Pull request checks: an AI step decides if it is flaky, a bug, or infrastructure.',
        'by_kind:branch:0': 'Flaky: re-runs the check.',
        'by_kind:branch:1':
            'Real bug: an AI agent opens a fix PR. If it is not merged in a day, the author hears about it.',
        'by_kind:branch:2': 'Infrastructure: tells #infra.',
        'wait_merged:continue:': 'Fix not merged in a day: pings the PR author.',
    },
    'prototype-tile-flag-rollout': {
        'split_1:branch:0': 'Error rate at 2% or more after week 1: rolls back to 0% and tells #releases.',
        'split_1:continue:': 'Healthy after week 1: goes to 50%, checks again a week later, then 100% or rolls back.',
        'split_2:branch:0': 'Error rate too high at 50%: rolls back and tells #releases.',
        'split_2:continue:': 'Healthy at 50%: goes to 100% and announces it.',
    },
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
    springDrip(),
    blackFriday(),
    ciAutoFix(),
    flagRollout(),
]
