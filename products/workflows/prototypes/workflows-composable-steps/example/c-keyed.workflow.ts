// Shape C. Every step is named once in a registry, and the flow places steps by
// key. The key is the action id, so an id does not move when the graph does.
//
// A sub-path cannot be a single value here: a branch path is a list of keys, so
// `waitThenNotify` has to be spelled as its two keys again.

import { delay, keyed, onEvent } from '../sdk'
import { exitReason, head, notifyCrm, onFreePlan, onPaidPlan, welcomeEmail } from './shared'

const steps = {
    wait_a_day: delay('1d', { name: 'Wait a day' }),
    welcome_email: welcomeEmail,
    notify_crm: notifyCrm,
    free_plan_delay: delay('2d', { name: 'Give the free plan two days' }),
}

export const onboarding = keyed(steps).workflow({
    ...head,
    on: onEvent({ event: 'user signed up' }),
    flow: [
        'wait_a_day',
        {
            branch: {
                name: 'Which plan?',
                branches: [
                    { name: 'Paid plan', when: onPaidPlan, then: ['welcome_email', 'notify_crm'] },
                    { name: 'Free plan', when: onFreePlan, then: ['free_plan_delay', 'notify_crm'] },
                ],
            },
        },
    ],
    exit: { reason: exitReason },
})
