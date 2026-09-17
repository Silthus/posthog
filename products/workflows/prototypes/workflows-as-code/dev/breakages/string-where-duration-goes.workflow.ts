// Deliberate breakage 2: a string where a duration goes.
// Duration is a template literal type, so only `<number>d|h|m` type-checks.
import { onEvent, workflow } from '../../sdk'

export const broken = workflow({ name: 'String where a duration goes' })
    .on(onEvent({ event: 'user signed up' }))
    .delay('tomorrow')
    .exit('Done')
