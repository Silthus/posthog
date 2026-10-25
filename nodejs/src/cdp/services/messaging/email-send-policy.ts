import { HogFunctionType, IntegrationType } from '~/cdp/types'

import { EmailSendingSuspensionCause, TeamWorkflowsConfigService } from '../managers/team-workflows-config.service'
import { EmailSuppressionService } from './email-suppression.service'

export type PolicyCode = 'sending_suspended' | 'template_paused' | 'sender_not_verified' | 'recipient_suppressed'

type Rejection = {
    ok: false
    detail: string
    why: string
    fix: string
}

export type PolicyRejection =
    | (Rejection & { code: Exclude<PolicyCode, 'sending_suspended' | 'recipient_suppressed'> })
    | (Rejection & { code: 'sending_suspended'; cause: EmailSendingSuspensionCause })
    | (Rejection & { code: 'recipient_suppressed'; suppressed: string[] })

export type PolicyDecision = { ok: true; sender: IntegrationType } | PolicyRejection

export type SendCandidate = {
    teamId: number
    workflowMetadata: HogFunctionType['metadata']
    sender: IntegrationType | null
    recipients: string[]
}

const CONTACT_SUPPORT = 'Contact support to get sending re-enabled.'

export class EmailSendPolicy {
    constructor(
        private teamWorkflowsConfigService: Pick<TeamWorkflowsConfigService, 'getEmailSendingSuspension'>,
        private emailSuppressionService: Pick<EmailSuppressionService, 'findSuppressed'>
    ) {}

    public async check(send: SendCandidate): Promise<PolicyDecision> {
        const suspension = await this.teamWorkflowsConfigService.getEmailSendingSuspension(send.teamId)
        if (suspension) {
            return sendingSuspended(suspension)
        }
        const paused = workflowPaused(send.workflowMetadata)
        if (paused) {
            return paused
        }
        const sender = usableSender(send.sender, send.teamId)
        if ('code' in sender) {
            return sender
        }
        return (await this.recipientsSuppressed(send.teamId, send.recipients)) ?? { ok: true, sender }
    }

    private async recipientsSuppressed(teamId: number, recipients: string[]): Promise<PolicyRejection | null> {
        const suppressed = await this.emailSuppressionService.findSuppressed(teamId, recipients)
        if (suppressed.length === 0) {
            return null
        }
        return {
            ok: false,
            code: 'recipient_suppressed',
            suppressed,
            detail: `Recipient(s) on the suppression list: ${suppressed.join(', ')}`,
            why: `An earlier email to ${suppressed.join(', ')} bounced or was marked as spam, so PostHog no longer sends to it.`,
            fix: 'Send to another address, or remove the address from the suppression list once it can receive email again.',
        }
    }
}

function sendingSuspended(cause: EmailSendingSuspensionCause): PolicyRejection {
    if (cause === 'staff') {
        return {
            ok: false,
            code: 'sending_suspended',
            cause,
            detail: `Email sending is suspended for this project. ${CONTACT_SUPPORT}`,
            why: 'Email sending is suspended for this project.',
            fix: CONTACT_SUPPORT,
        }
    }
    return {
        ok: false,
        code: 'sending_suspended',
        cause,
        detail: 'Our email provider paused sending for this project. Check the Reputation tab to see what to fix.',
        why: 'Our email provider paused sending for this project.',
        fix: 'Check the Reputation tab to see what to fix.',
    }
}

function workflowPaused(metadata: HogFunctionType['metadata']): PolicyRejection | null {
    if (!metadata?.email_sending_paused_at) {
        return null
    }
    const reason = typeof metadata.email_sending_paused_reason === 'string' ? metadata.email_sending_paused_reason : ''
    const pauseDetail = reason ? ` ${reason}` : ''
    if (metadata.email_sending_paused_by === 'staff') {
        return {
            ok: false,
            code: 'template_paused',
            detail: `PostHog staff paused email sending for this workflow.${pauseDetail} ${CONTACT_SUPPORT}`,
            why: `PostHog staff paused email sending for this email's workflow.${pauseDetail}`,
            fix: CONTACT_SUPPORT,
        }
    }
    const fix = 'Resume it from the workflow page once the audience is cleaned up.'
    return {
        ok: false,
        code: 'template_paused',
        detail: `Email sending is paused for this workflow.${pauseDetail} ${fix}`,
        why: `Email sending is paused for this email's workflow.${pauseDetail}`,
        fix,
    }
}

function usableSender(sender: IntegrationType | null, teamId: number): IntegrationType | PolicyRejection {
    if (!sender || sender.team_id !== teamId) {
        return senderNotVerified(
            "Email integration not found. The sender configured for this step no longer exists — select a new sender in the workflow's email step.",
            'The sender configured for this email no longer exists.',
            'Select a new sender for the email.'
        )
    }
    if (sender.kind !== 'email') {
        return senderNotVerified(
            "The integration configured for this step is not an email channel — select an email sender in the workflow's email step.",
            'The sender configured for this email is not an email channel.',
            'Select an email sender for the email.'
        )
    }
    if (!sender.config.verified) {
        return senderNotVerified(
            'The selected email integration domain is not verified',
            "The sender's domain is not verified.",
            'Verify the domain in the email channel settings, then send again.'
        )
    }
    if (!sender.config.email || !sender.config.name) {
        return senderNotVerified(
            'The selected email integration is not configured correctly',
            'The sender has no address or no name.',
            'Set the address and name of the sender in the email channel settings.'
        )
    }
    return sender
}

function senderNotVerified(detail: string, why: string, fix: string): PolicyRejection {
    return { ok: false, code: 'sender_not_verified', detail, why, fix }
}
