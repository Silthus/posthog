// Shape B. No chain. The graph is one record: the trigger, an ordered array of
// step values, and the exit. Order is array order.

import { branch, declarative, delay, onEvent, path } from '../sdk'
import { exitReason, head, notifyCrm, onFreePlan, onPaidPlan, waitThenNotify, welcomeEmail } from './shared'

export const onboarding = declarative({
    ...head,
    on: onEvent({ event: 'user signed up' }),
    steps: path(
        delay('1d', { name: 'Wait a day' }),
        branch({
            name: 'Which plan?',
            branches: [
                { name: 'Paid plan', when: onPaidPlan, then: path(welcomeEmail, notifyCrm) },
                { name: 'Free plan', when: onFreePlan, then: waitThenNotify },
            ],
        })
    ),
    exit: { reason: exitReason },
})
