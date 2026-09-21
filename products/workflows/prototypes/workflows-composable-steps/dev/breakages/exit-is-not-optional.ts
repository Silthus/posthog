// Shape A: only `.exit()` returns a Workflow, so a chain left open has no `emit`.
// Shape B: `exit` is a required field rather than a terminator.

import { chained, declarative, delay, onEvent, path } from '../../sdk'

export const openChain = chained({ name: 'Open' })
    .on(onEvent({ event: 'user signed up' }))
    .delay('1d')
    .emit()

export const noExit = declarative({
    name: 'No exit',
    on: onEvent({ event: 'user signed up' }),
    steps: path(delay('1d')),
})
