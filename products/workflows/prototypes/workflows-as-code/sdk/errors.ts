/**
 * Every failure the SDK produces is one of these. `fix` is the field that decides
 * whether the agent reading the output recovers, so it names an action, not a cause.
 */
export interface WorkflowErrorDetail {
    /** HTTP status for an API failure, or a local code when the SDK failed before the request. */
    readonly status: number | LocalErrorStatus
    readonly message: string
    readonly why: string
    readonly fix: string
}

export type LocalErrorStatus = 'invalid_definition' | 'missing_config' | 'ambiguous_name' | 'network_error'

export class WorkflowError extends Error {
    readonly detail: WorkflowErrorDetail

    constructor(detail: WorkflowErrorDetail) {
        super(detail.message)
        this.name = 'WorkflowError'
        this.detail = detail
    }

    /** Multi-line, because a one-line throw hides `why` and `fix` behind a stack trace. */
    format(): string {
        return [
            `status: ${this.detail.status}`,
            `message: ${this.detail.message}`,
            `why: ${this.detail.why}`,
            `fix: ${this.detail.fix}`,
        ].join('\n')
    }
}
