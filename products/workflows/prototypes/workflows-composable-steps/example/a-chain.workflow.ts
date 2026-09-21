// Shape A. The chain stays for the linear spine. A step defined elsewhere is
// placed with `.add()`, and a branch path is a value rather than a callback.

import { chained, onEvent, path } from '../sdk'
import { exitReason, head, notifyCrm, onFreePlan, onPaidPlan, waitThenNotify, welcomeEmail } from './shared'

export const onboarding = chained(head)
    .on(onEvent({ event: 'user signed up' }))
    .delay('1d', { name: 'Wait a day' })
    .branch({
        name: 'Which plan?',
        branches: [
            { name: 'Paid plan', when: onPaidPlan, then: path(welcomeEmail, notifyCrm) },
            { name: 'Free plan', when: onFreePlan, then: waitThenNotify },
        ],
    })
    .exit(exitReason)
