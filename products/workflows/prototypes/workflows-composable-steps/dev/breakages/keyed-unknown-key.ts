// Shape C places steps by key. A key that is not in the registry is a compile error
// inside a branch path as well as in the flow.

import { delay, keyed, onEvent, person } from '../../sdk'

const steps = { wait_a_day: delay('1d'), notify_crm: delay('2d') }

export const typo = keyed(steps).workflow({
    name: 'Typo',
    on: onEvent({ event: 'user signed up' }),
    flow: [
        'wait_a_day',
        {
            branch: {
                name: 'Which plan?',
                branches: [{ name: 'Paid plan', when: [person('plan', 'exact', ['pro'])], then: ['notifyCrm'] }],
            },
        },
    ],
    exit: { reason: 'done' },
})
