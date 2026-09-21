// Two rules at once. `when` needs at least one condition, and there is no place to
// write a branch index: the authoring surface has no `index` field, so a condition
// and the edge that runs it cannot disagree.

import { branch, delay, person } from '../../sdk'

export const noConditions = branch({
    name: 'Which plan?',
    branches: [{ name: 'Paid plan', when: [], then: [delay('1d')] }],
})

export const authoredIndex = branch({
    name: 'Which plan?',
    branches: [{ name: 'Paid plan', when: [person('plan', 'exact', ['pro'])], then: [delay('1d')], index: 0 }],
})
