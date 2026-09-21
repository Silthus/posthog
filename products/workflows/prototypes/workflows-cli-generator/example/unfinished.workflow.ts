// A chain the author exported before closing it with .exit(). Without the draft brand the
// CLI would report this file as exporting no workflow, which sends the reader looking for
// a missing export instead of a missing exit.

import { onEvent, workflow } from '../sdk'

export const halfBuilt = workflow({ name: 'Half built' })
    .on(onEvent({ event: 'user signed up' }))
    .delay('1d', { name: 'Wait a day' })
