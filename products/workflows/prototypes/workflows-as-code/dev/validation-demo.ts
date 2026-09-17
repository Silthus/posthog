// The builder makes a bad branch index unwritable, so this feeds validate() a
// hand-written definition instead: what the SDK says when a definition reaches it
// from somewhere other than the builder.

import { validate, WorkflowError } from '../sdk'
import type { WorkflowDefinition } from '../sdk'

const handWritten = {
    name: 'Hand-written definition',
    description: '',
    status: 'draft',
    exit_condition: 'exit_only_at_end',
    actions: [
        {
            id: 'trigger_node',
            name: 'Trigger',
            type: 'trigger',
            config: { type: 'event', filters: { events: [{ id: 'x', name: 'x', type: 'events', order: 0 }] } },
        },
        {
            id: 'branch_1',
            name: 'On a paid plan?',
            type: 'conditional_branch',
            config: { conditions: [{ filters: { properties: [] } }] },
        },
        { id: 'delay_1', name: 'Wait', type: 'delay', config: { delay_duration: '90 seconds' } },
        { id: 'exit_node', name: 'Exit', type: 'exit', config: {} },
    ],
    edges: [
        { from: 'trigger_node', to: 'branch_1', type: 'continue' },
        { from: 'branch_1', to: 'exit_node', type: 'continue' },
        { from: 'branch_1', to: 'delay_1', type: 'branch', index: 1 },
    ],
} as unknown as WorkflowDefinition

const result = validate(handWritten)
for (const error of result.errors) {
    console.log(new WorkflowError(error).format())
    console.log('')
}
for (const warning of result.warnings) {
    console.log(`warning: ${warning}`)
}
