// A branch path is a non-empty tuple, so an empty sub-path is a compile error
// rather than the runtime error the first prototype raised.

import { branch, person, type Path } from '../../sdk'

export const emptyPath: Path = []

export const nothingHappens = branch({
    name: 'Which plan?',
    branches: [{ name: 'Paid plan', when: [person('plan', 'exact', ['pro'])], then: [] }],
})
