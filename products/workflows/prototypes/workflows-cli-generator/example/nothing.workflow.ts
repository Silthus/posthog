// A file with a workflow the author never exported. The most likely way to write a file
// the CLI finds nothing in.

import { onEvent, workflow } from '../sdk'

const draftedButNotExported = workflow({ name: 'Nobody can see me' })
    .on(onEvent({ event: 'user signed up' }))
    .exit('done')

void draftedButNotExported
