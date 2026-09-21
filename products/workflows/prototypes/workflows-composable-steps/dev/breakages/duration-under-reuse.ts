// The Duration template literal still rejects a loose string when the delay is a
// value held in a `const` rather than a chain call.

import { delay } from '../../sdk'

export const nudgeDelay = delay('soon', { name: 'Wait a bit' })
