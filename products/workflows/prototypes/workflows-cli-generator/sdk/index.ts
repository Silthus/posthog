// What a workflow file imports. Authoring surface only: there is no run(), no push(),
// and nothing here opens a socket. A file that imports this module cannot do anything
// when executed, which is the property that makes it a definition rather than a program.

export { eventProperty, onEvent, person, workflow } from './builder'
export type { BranchSpec, Chain, WebhookOptions, Workflow, WorkflowChain } from './builder'
export { secret } from './secret'
export type { Duration, SecretRef, WorkflowStatus } from './types'
