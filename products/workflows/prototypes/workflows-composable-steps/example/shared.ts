// The step values the onboarding workflow reuses. A step defined here is a value:
// it has a name and a config, but no id and no position.

import { email, path, person, secret, webhook, delay, type Conditions, type Path, type Step } from '../sdk'

/** Placed twice in the graph, once per branch. The signing secret sits on the value. */
export const notifyCrm: Step = webhook({
    name: 'Tell the CRM to follow up',
    url: 'https://example.com/hooks/onboarding',
    body: { distinct_id: '{event.distinct_id}', plan: '{person.properties.plan}' },
    signingSecret: secret('CRM_TOKEN'),
})

export const welcomeEmail: Step = email({
    name: 'Welcome the paid customer',
    to: '{person.properties.email}',
    subject: 'Welcome aboard',
    text: 'Thanks for upgrading. Here is how to get started.',
    html: '<p>Thanks for upgrading. Here is how to get started.</p>',
})

/** A sub-path defined once and placed inside a branch: a delay, then the reused webhook. */
export const waitThenNotify: Path = path(delay('2d', { name: 'Give the free plan two days' }), notifyCrm)

export const onPaidPlan: Conditions = [person('plan', 'exact', ['pro', 'enterprise'])]
export const onFreePlan: Conditions = [person('plan', 'exact', ['free'])]

export const head = {
    name: 'Onboarding nudge (composable steps)',
    description: 'Prototype workflow. One step value placed twice.',
} as const

export const exitReason = 'Onboarding nudge finished'
