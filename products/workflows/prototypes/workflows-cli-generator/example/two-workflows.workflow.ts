// A file with two workflows in it. The CLI handles both.

import { onEvent, workflow } from '../sdk'

export const trialNudge = workflow({ name: 'Trial nudge' })
    .on(onEvent({ event: 'trial started' }))
    .delay('3d', { name: 'Wait three days' })
    .exit('Trial nudge finished')

export const winback = workflow({ name: 'Winback' })
    .on(onEvent({ event: 'subscription cancelled' }))
    .delay('7d', { name: 'Wait a week' })
    .exit('Winback finished')
