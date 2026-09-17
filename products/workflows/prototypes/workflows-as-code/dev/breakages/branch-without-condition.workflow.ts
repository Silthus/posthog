// Deliberate breakage 1: a branch path with no condition behind it.
// The builder derives the branch edge index from the position in `branches`, so an
// edge without a condition can only be authored by omitting `when`. tsc rejects it.
import { onEvent, workflow } from '../../sdk'

export const broken = workflow({ name: 'Branch without a condition' })
    .on(onEvent({ event: 'user signed up' }))
    .branch({
        name: 'On a paid plan?',
        branches: [
            {
                name: 'Paid plan',
                then: (path) => path.webhook({ name: 'Notify', url: 'https://example.com/hook' }),
            },
        ],
    })
    .exit('Done')
