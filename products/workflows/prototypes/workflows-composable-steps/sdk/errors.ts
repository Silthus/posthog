// Every error path carries status, message, why, fix. Lifted from
// prototype/workflows-as-code sdk/errors.ts by reading.

export interface WorkflowErrorFields {
    readonly status: string
    readonly message: string
    readonly why: string
    readonly fix: string
}

export class WorkflowError extends Error {
    readonly fields: WorkflowErrorFields

    constructor(fields: WorkflowErrorFields) {
        super(fields.message)
        this.name = 'WorkflowError'
        this.fields = fields
    }

    print(): string {
        return [
            `status: ${this.fields.status}`,
            `message: ${this.fields.message}`,
            `why: ${this.fields.why}`,
            `fix: ${this.fields.fix}`,
        ].join('\n')
    }
}
