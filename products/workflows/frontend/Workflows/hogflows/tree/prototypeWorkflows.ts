import type { HogFlow, HogFlowAction } from '../types'

type Edge = HogFlow['edges'][number]

const BASE: Omit<HogFlow, 'id' | 'name' | 'description' | 'trigger' | 'actions' | 'edges' | 'variables'> = {
    team_id: 1,
    version: 3,
    status: 'draft',
    exit_condition: 'exit_only_at_end',
    created_at: '2026-09-01T09:00:00.000Z',
    updated_at: '2026-09-04T12:00:00.000Z',
}

const EXIT_ID = 'exit_node'

const eventTrigger = (id: string, name: string): HogFlow['trigger'] => ({
    type: 'event',
    filters: { events: [{ id, name, type: 'events' }], properties: [], actions: [] },
})

const emailHtml = (heading: string, paragraphs: string[], cta: string): string =>
    [
        '<html><body style="margin:0;background:#f4f1ea;font-family:Georgia,serif;color:#2b2b2b">',
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">',
        '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px">',
        '<tr><td style="padding:32px 40px 8px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#6b7d5c">Fernwood Outfitters</td></tr>',
        `<tr><td style="padding:8px 40px"><h1 style="margin:0;font-size:26px;line-height:1.3">${heading}</h1></td></tr>`,
        ...paragraphs.map((p) => `<tr><td style="padding:8px 40px;font-size:16px;line-height:1.6">${p}</td></tr>`),
        `<tr><td style="padding:24px 40px 40px"><a href="https://example.com/shop" style="background:#3f5a2e;color:#ffffff;padding:12px 24px;border-radius:4px;text-decoration:none;font-family:Arial,sans-serif">${cta}</a></td></tr>`,
        '</table></td></tr></table></body></html>',
    ].join('')

const emailAction = (
    id: string,
    name: string,
    subject: string,
    preheader: string,
    paragraphs: string[],
    cta: string
): HogFlowAction =>
    ({
        id,
        type: 'function_email',
        name,
        description: '',
        config: {
            template_id: 'template-email',
            message_category_id: '019a0000-0000-0000-0000-000000000001',
            message_category_type: 'marketing',
            inputs: {
                email: {
                    order: 0,
                    templating: 'liquid',
                    value: {
                        to: { name: '', email: '{{ person.properties.email }}' },
                        from: { integrationId: 1 },
                        subject,
                        preheader,
                        html: emailHtml(subject, paragraphs, cta),
                        text: paragraphs.join('\n\n'),
                    },
                },
            },
        },
    }) as HogFlowAction

const delayAction = (id: string, name: string, duration: string): HogFlowAction =>
    ({ id, type: 'delay', name, description: '', config: { delay_duration: duration } }) as HogFlowAction

const timeWindowAction = (id: string, name: string, time: [string, string]): HogFlowAction =>
    ({
        id,
        type: 'wait_until_time_window',
        name,
        description: '',
        config: { timezone: 'UTC', day: 'weekday', time },
    }) as HogFlowAction

const waitForEventAction = (
    id: string,
    name: string,
    eventId: string,
    eventName: string,
    maxWait: string
): HogFlowAction =>
    ({
        id,
        type: 'wait_until_condition',
        name,
        description: '',
        config: {
            condition: {
                name: eventName,
                filters: { events: [{ id: eventId, name: eventName, type: 'events' }] },
            },
            max_wait_duration: maxWait,
        },
    }) as HogFlowAction

const labelFor = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

const variableBranchAction = (
    id: string,
    name: string,
    key: string,
    values: string[],
    labels: string[] = values.map(labelFor)
): HogFlowAction =>
    ({
        id,
        type: 'conditional_branch',
        name,
        description: '',
        config: {
            conditions: values.map((value, index) => ({
                name: labels[index],
                filters: { properties: [{ key, type: 'workflow_variable', value: [value], operator: 'exact' }] },
            })),
        },
    }) as HogFlowAction

const personPropertyBranchAction = (id: string, name: string, key: string, values: string[]): HogFlowAction =>
    ({
        id,
        type: 'conditional_branch',
        name,
        description: '',
        config: {
            conditions: values.map((value) => ({
                name: labelFor(value),
                filters: { properties: [{ key, type: 'person', value: [value], operator: 'exact' }] },
            })),
        },
    }) as HogFlowAction

const triggerAction = (trigger: NonNullable<HogFlow['trigger']>, name: string): HogFlowAction =>
    ({ id: 'trigger_node', type: 'trigger', name, description: '', config: trigger }) as HogFlowAction

const exitAction = (reason: string): HogFlowAction =>
    ({ id: EXIT_ID, type: 'exit', name: 'Exit', description: '', config: { reason } }) as HogFlowAction

const chain = (...ids: string[]): Edge[] => ids.slice(1).map((to, i): Edge => ({ from: ids[i], to, type: 'continue' }))

const VARIANTS = [
    {
        key: 'story',
        label: 'Story-led',
        subject: 'The ridge we built the Larkspur boot for',
        preheader: 'A short story from the trail that started it all.',
        paragraphs: [
            'Two winters ago our founder got caught above the treeline in a whiteout, wearing boots that gave up halfway home.',
            'The Larkspur boot is what we made after that walk: a waterproof leather upper, a grippy outsole, and a fit that works from the first mile.',
        ],
        cta: 'Read the story',
        followUpSubject: 'Still thinking about the Larkspur?',
        followUpParagraphs: [
            'No pressure. If you have questions about sizing or break-in, reply to this email and a real person will answer.',
        ],
    },
    {
        key: 'offer',
        label: 'Offer-led',
        subject: 'Take 15% off your first pair of Larkspur boots',
        preheader: 'Your code is good for the next five days.',
        paragraphs: [
            'Welcome to the trail. Use code <strong>FIRSTSTEP15</strong> at checkout to take 15% off any pair of Larkspur boots.',
            'The code works on one order and expires in five days, so pick your size while it lasts.',
        ],
        cta: 'Use my code',
        followUpSubject: 'Your 15% code ends tomorrow',
        followUpParagraphs: ['A quick reminder that FIRSTSTEP15 stops working tomorrow evening.'],
    },
    {
        key: 'proof',
        label: 'Social-proof',
        subject: 'What 2,000 hikers say about the Larkspur boot',
        preheader: 'Real reviews, including the honest ones.',
        paragraphs: [
            '"Broke in over one weekend and kept my feet dry through a week of rain." Marguerite, Cascade Loop.',
            'Over the last year hikers rated the Larkspur 4.8 out of 5. Read what they liked and what they would change.',
        ],
        cta: 'Read the reviews',
        followUpSubject: 'Hikers ask us about fit. Here is what we tell them',
        followUpParagraphs: ['Most reviewers say to order your usual size and wear thick socks on the first walk.'],
    },
]

const larkspurLaunchAbTest = (): HogFlow => {
    const actions: HogFlowAction[] = [
        triggerAction(
            { type: 'batch', filters: { properties: [] } } as NonNullable<HogFlow['trigger']>,
            'Audience: boot browsers'
        ),
        variableBranchAction(
            'route_variant',
            'Route by email variant',
            'variant',
            VARIANTS.map((v) => v.key),
            VARIANTS.map((v) => v.label)
        ),
    ]
    const edges: Edge[] = [{ from: 'trigger_node', to: 'route_variant', type: 'continue' }]

    VARIANTS.forEach((variant, index) => {
        const id = (suffix: string): string => `${variant.key}_${suffix}`
        actions.push(
            timeWindowAction(id('window'), `${variant.label}: wait for send window`, ['09:00', '11:00']),
            emailAction(
                id('email'),
                `${variant.label}: launch email`,
                variant.subject,
                variant.preheader,
                variant.paragraphs,
                variant.cta
            ),
            waitForEventAction(
                id('wait'),
                `${variant.label}: wait for purchase`,
                'order_completed',
                'Order completed',
                '5d'
            ),
            emailAction(
                id('follow_up'),
                `${variant.label}: follow-up email`,
                variant.followUpSubject,
                variant.preheader,
                variant.followUpParagraphs,
                'Back to the boots'
            )
        )
        edges.push(
            { from: 'route_variant', to: id('window'), type: 'branch', index },
            ...chain(id('window'), id('email'), id('wait')),
            { from: id('wait'), to: EXIT_ID, type: 'branch', index: 0 },
            { from: id('wait'), to: id('follow_up'), type: 'continue' },
            { from: id('follow_up'), to: EXIT_ID, type: 'continue' }
        )
    })

    actions.push(exitAction('Purchased, or follow-up sent'))
    edges.push({ from: 'route_variant', to: EXIT_ID, type: 'continue' })

    return {
        ...BASE,
        id: 'prototype-larkspur-launch-ab-test',
        name: 'Larkspur boot launch: three email variants',
        description:
            'Sends one of three launch emails to the audience, waits five days for a purchase, and follows up with people who have not bought.',
        trigger: { type: 'batch', filters: { properties: [] } } as HogFlow['trigger'],
        variables: [{ key: 'variant', type: 'string', label: 'Email variant', default: '' }],
        actions,
        edges,
    }
}

const welcomeToFernwood = (): HogFlow => {
    const trigger = eventTrigger('newsletter_signup', 'Newsletter signup')
    return {
        ...BASE,
        id: 'prototype-fernwood-welcome',
        name: 'Welcome new newsletter readers',
        description: 'Greets new subscribers, waits two days, and sends a short guide to getting started.',
        trigger,
        variables: [],
        actions: [
            triggerAction(trigger!, 'Newsletter signup'),
            emailAction(
                'welcome_email',
                'Welcome email',
                'Welcome to Fernwood Outfitters',
                'Here is what to expect from us.',
                ['Thanks for joining. Once a week we share a trail worth walking and one piece of gear we trust.'],
                'Browse trails'
            ),
            delayAction('wait_two_days', 'Wait two days', '2d'),
            emailAction(
                'guide_email',
                'Getting started guide',
                'Three habits of hikers who stay comfortable',
                'Short, practical, and free.',
                ['Pack layers, break in new boots on short walks, and carry one more snack than you think you need.'],
                'Read the full guide'
            ),
            exitAction('Welcome series finished'),
        ],
        edges: chain('trigger_node', 'welcome_email', 'wait_two_days', 'guide_email', EXIT_ID),
    }
}

const REGIONS = ['north', 'south', 'east', 'west']
const TIERS = ['member', 'guest']
const INTERESTS = ['hiking', 'camping']

/**
 * Region -> membership tier -> interest, each leaf running delay, time window, email, wait for an event and a
 * follow-up. Every path ends in the same exit node.
 */
const regionalSeasonOpener = (): HogFlow => {
    const trigger = eventTrigger('season_opened', 'Season opened')
    const actions: HogFlowAction[] = [
        triggerAction(trigger!, 'Season opened'),
        personPropertyBranchAction('by_region', 'Route by region', 'region', REGIONS),
    ]
    const edges: Edge[] = [{ from: 'trigger_node', to: 'by_region', type: 'continue' }]

    REGIONS.forEach((region, regionIndex) => {
        const tierBranchId = `${region}_by_tier`
        actions.push(personPropertyBranchAction(tierBranchId, `${region}: route by tier`, 'tier', TIERS))
        edges.push(
            { from: 'by_region', to: tierBranchId, type: 'branch', index: regionIndex },
            { from: tierBranchId, to: EXIT_ID, type: 'continue' }
        )

        TIERS.forEach((tier, tierIndex) => {
            const interestBranchId = `${region}_${tier}_by_interest`
            actions.push(
                personPropertyBranchAction(
                    interestBranchId,
                    `${region} ${tier}: route by interest`,
                    'interest',
                    INTERESTS
                )
            )
            edges.push(
                { from: tierBranchId, to: interestBranchId, type: 'branch', index: tierIndex },
                { from: interestBranchId, to: EXIT_ID, type: 'continue' }
            )

            INTERESTS.forEach((interest, interestIndex) => {
                const leaf = (suffix: string): string => `${region}_${tier}_${interest}_${suffix}`
                const label = `${region} ${tier} ${interest}`
                actions.push(
                    delayAction(leaf('delay'), `${label}: stagger send`, `${regionIndex + 1}h`),
                    timeWindowAction(leaf('window'), `${label}: wait for window`, ['08:00', '12:00']),
                    emailAction(
                        leaf('email'),
                        `${label}: season email`,
                        `The ${interest} season opens in the ${region}`,
                        'Trail status and gear picks.',
                        [
                            `Trails in the ${region} are open for ${interest}. Here are the routes our ${tier}s are walking first.`,
                        ],
                        "See this week's picks"
                    ),
                    waitForEventAction(
                        leaf('wait'),
                        `${label}: wait for visit`,
                        'trail_guide_viewed',
                        'Trail guide viewed',
                        '3d'
                    ),
                    emailAction(
                        leaf('nudge'),
                        `${label}: nudge email`,
                        `Missed the ${region} trail guide?`,
                        'It takes two minutes to read.',
                        ['We put together a short guide for your region. Here it is again.'],
                        'Open the guide'
                    )
                )
                edges.push(
                    { from: interestBranchId, to: leaf('delay'), type: 'branch', index: interestIndex },
                    ...chain(leaf('delay'), leaf('window'), leaf('email'), leaf('wait')),
                    { from: leaf('wait'), to: EXIT_ID, type: 'branch', index: 0 },
                    { from: leaf('wait'), to: leaf('nudge'), type: 'continue' },
                    { from: leaf('nudge'), to: EXIT_ID, type: 'continue' }
                )
            })
        })
    })

    actions.push(exitAction('Season opener finished'))
    edges.push({ from: 'by_region', to: EXIT_ID, type: 'continue' })

    return {
        ...BASE,
        id: 'prototype-regional-season-opener',
        name: 'Regional season opener',
        description:
            'Routes every subscriber by region, membership tier, and interest before sending the season email.',
        trigger,
        variables: [],
        actions,
        edges,
    }
}

export const PROTOTYPE_WORKFLOWS: Record<string, HogFlow> = Object.fromEntries(
    [larkspurLaunchAbTest(), welcomeToFernwood(), regionalSeasonOpener()].map((flow) => [flow.id, flow])
)
