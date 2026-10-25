import { Counter } from 'prom-client'
import { z } from 'zod'

import { BareEmailAddressSchema } from '~/cdp/schema/emailFields'
import { HogFlow, HogFlowAction } from '~/cdp/schema/hogflow'
import {
    CyclotronJobInvocationHogFlow,
    HogFunctionInvocationGlobals,
    HogFunctionInvocationGlobalsWithInputs,
} from '~/cdp/types'

import { formatInput } from '../hog-inputs.service'
import { IntegrationManagerService } from '../managers/integration-manager.service'
import { PolicyCode, PolicyRejection, SendCandidate } from '../messaging/email-send-policy'
import { EmailSenderConfiguration, selectEmailSenderIntegrationId } from '../messaging/email-sender-selection'
import { EmailValidationService, Undeliverable } from '../messaging/email-validation.service'
import { recipientsUnlessToIsMissing } from '../messaging/email.service'
import { emailPauseMetadata } from './hogflow-functions.service'

export const AcceptedSendSchema = z
    .object({
        content: z
            .object({
                subject: z.string().min(1),
                html: z.string().optional(),
                text: z.string().optional(),
            })
            .readonly()
            .refine((content) => !!content.html || !!content.text, { message: 'content needs html or text' })
            .optional(),
        from: z
            .object({
                integrationId: z.number().int(),
                email: z.string().optional(),
                name: z.string().optional(),
            })
            .readonly()
            .optional(),
        replyTo: z.array(z.string()).readonly().optional(),
        tracking: z.object({ captureEngagement: z.boolean() }).readonly(),
    })
    .readonly()

export type AcceptedSend = z.infer<typeof AcceptedSendSchema>

// What Django sends to run a transactional email's workflow once.
export const TransactionalEmailRequestSchema = z.object({
    to: BareEmailAddressSchema,
    // The person the send is tracked against. Django falls back to the recipient's address.
    distinct_id: z.string().min(1),
    // The caller's `message_data`, available to the template as `variables`.
    variables: z.record(z.string(), z.any()).default({}),
    // The caller's `Idempotency-Key`. A repeat with the same key and request returns the first send.
    idempotency_key: z.string().min(1).max(255).optional(),
})

export const AcceptedSendRequestSchema = TransactionalEmailRequestSchema.extend({ send: AcceptedSendSchema })

export type TransactionalEmailRequest = z.infer<typeof TransactionalEmailRequestSchema> & { send?: AcceptedSend }

export type AdmissionRefusal = Pick<PolicyRejection, 'detail' | 'why' | 'fix'> & {
    code: PolicyCode | 'invalid_recipient'
    attr: 'to' | 'from' | null
}

export type TransactionalEmailOutcome =
    | 'queued'
    | 'replayed'
    | 'idempotency_key_in_flight'
    | 'idempotency_key_reused'
    | 'idempotency_unavailable'
    | 'not_configured'
    | 'unauthorized'
    | 'invalid_request'
    | 'not_found'
    | 'not_sendable'
    | 'quota_limited'
    | AdmissionRefusal['code']
    | 'error'

export const transactionalEmailRequestsTotal = new Counter({
    name: 'cdp_transactional_email_requests_total',
    help: 'Requests from Django to run a transactional email, by outcome. Every outcome except `queued` means this request queued no email.',
    labelNames: ['outcome'],
})

export async function transactionalSendCandidate(
    invocation: CyclotronJobInvocationHogFlow,
    triggerGlobals: HogFunctionInvocationGlobals,
    to: string,
    send: AcceptedSend | undefined,
    integrationManager: Pick<IntegrationManagerService, 'get'>
): Promise<SendCandidate> {
    const { hogFlow } = invocation
    const step = emailStep(hogFlow)
    const from = send?.from ?? emailStepSender(step)
    const stepGlobals = { ...triggerGlobals, variables: invocation.state.variables, inputs: {} }
    return {
        teamId: hogFlow.team_id,
        workflowMetadata: emailPauseMetadata(hogFlow),
        sender: from ? await integrationManager.get(selectEmailSenderIntegrationId(invocation.id, from)) : null,
        recipients: recipientsUnlessToIsMissing({
            to: { email: to },
            ...(await renderedCopiesOrNone(step, stepGlobals)),
        }),
    }
}

export function policyRefusal(rejection: PolicyRejection, to: string, send: AcceptedSend): AdmissionRefusal {
    switch (rejection.code) {
        case 'recipient_suppressed':
            return rejection.suppressed.includes(to)
                ? refusalOf(rejection, 'to')
                : storedCopySuppressed(rejection.detail, rejection.suppressed)
        case 'sender_not_verified':
            return refusalOf(rejection, send.from ? 'from' : null)
        default:
            return refusalOf(rejection, null)
    }
}

function refusalOf({ code, detail, why, fix }: PolicyRejection, attr: AdmissionRefusal['attr']): AdmissionRefusal {
    return { code, detail, attr, why, fix }
}

function storedCopySuppressed(detail: string, copies: string[]): AdmissionRefusal {
    return {
        code: 'recipient_suppressed',
        detail,
        attr: null,
        why: `The workflow's email step sends a cc or bcc to ${copies.join(', ')}. An earlier email to it bounced or was marked as spam, so PostHog sent nothing.`,
        fix: "Remove the address from the cc or bcc of the workflow's email step, or remove it from the suppression list once it can receive email again.",
    }
}

export async function undeliverableRecipient(
    to: string,
    teamId: number,
    addressCheck: Pick<EmailValidationService, 'findUndeliverable'>
): Promise<AdmissionRefusal | null> {
    const undeliverable = await addressCheck.findUndeliverable(to, teamId)
    return undeliverable ? invalidRecipient(undeliverable) : null
}

function invalidRecipient(undeliverable: Undeliverable): AdmissionRefusal {
    const why =
        undeliverable.reason === 'invalid_syntax'
            ? `\`${undeliverable.address}\` is not a valid email address.`
            : `The domain \`${undeliverable.domain}\` has no mail servers, so an email to \`${undeliverable.address}\` would bounce.`
    return {
        code: 'invalid_recipient',
        detail: undeliverable.message,
        attr: 'to',
        why,
        fix: 'Check the address for a typo. If it is right, the recipient cannot receive email, so skip them.',
    }
}

type EmailStep = Extract<HogFlowAction, { type: 'function_email' }>
type Copies = { cc?: string; bcc?: string }

function emailStep(hogFlow: HogFlow): EmailStep | undefined {
    return hogFlow.actions.find((action): action is EmailStep => action.type === 'function_email')
}

function emailStepSender(step: EmailStep | undefined): EmailSenderConfiguration | null {
    const from = step?.config.inputs?.email?.value?.from
    return typeof from?.integrationId === 'number' ? from : null
}

async function renderedCopiesOrNone(
    step: EmailStep | undefined,
    globals: HogFunctionInvocationGlobalsWithInputs
): Promise<Copies> {
    const email = step?.config.inputs?.email
    if (!email) {
        return {}
    }
    const copiesOnly = { ...email, value: copyFieldsOf(email.value), bytecode: copyFieldsOf(email.bytecode) }
    try {
        return (await formatInput(copiesOnly, globals, 'email', { isEmailInput: true })) ?? {}
    } catch {
        return {}
    }
}

function copyFieldsOf(field: unknown): Record<keyof Copies, unknown> | undefined {
    if (!field || typeof field !== 'object') {
        return undefined
    }
    const { cc, bcc } = field as Record<string, unknown>
    return { cc, bcc }
}
