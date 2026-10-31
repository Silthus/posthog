import { z } from 'zod'

import { HogFlow } from '~/cdp/schema/hogflow'

import { AcceptedSend } from '../hogflows/transactional-email'
import { IntegrationManagerService } from '../managers/integration-manager.service'
import { OrganizationMembersService } from '../managers/organization-members.service'
import { selectEmailSenderIntegrationId } from './email-sender-selection'
import { SandboxEmailSender } from './sandbox-email-sender'
import { sandboxEnvelope, sandboxEnvelopeRecipients } from './sandbox-envelope'

export type SandboxSendRefusal =
    | 'sandbox_recipient_not_allowed'
    | 'sandbox_limit_reached'
    | 'sending_suspended'
    | 'sandbox_check_failed'

export type DeliveryMode = 'own' | 'sandbox'

export type SandboxSendAdmission =
    | { deliveryMode: 'own' }
    | { deliveryMode: 'sandbox'; refusal: SandboxSendRefusal | null }

export type SandboxSendRequest = {
    teamId: number
    invocationId: string
    hogFlow: HogFlow
    send: AcceptedSend | undefined
    to: string
}

const StoredSenderSchema = z.object({
    from: z.object({ integrationId: z.number().int(), integrationIds: z.array(z.number().int()).optional() }),
})

const StoredCopiesSchema = z.object({
    cc: z.string().optional(),
    bcc: z.string().optional(),
})

type StoredSender = z.infer<typeof StoredSenderSchema>['from']
type StoredCopies = z.infer<typeof StoredCopiesSchema>

const isTemplated = (copies: string): boolean => /[{}]/.test(copies)

export class SandboxSendGate {
    constructor(
        private sandboxSender: SandboxEmailSender,
        private organizationMembers: OrganizationMembersService,
        private integrationManager: IntegrationManagerService
    ) {}

    public async admit(request: SandboxSendRequest): Promise<SandboxSendAdmission> {
        const step = storedEmailStep(request.hogFlow)
        if (!(await this.sendsThroughSandbox(request, storedSender(step)))) {
            return { deliveryMode: 'own' }
        }
        return { deliveryMode: 'sandbox', refusal: await this.refusal(request, storedCopies(step)) }
    }

    private async refusal(
        request: SandboxSendRequest,
        copies: StoredCopies | null
    ): Promise<SandboxSendRefusal | null> {
        const suspension = await this.suspensionRefusal(request.teamId)
        if (suspension) {
            return suspension
        }
        if (!copies || isTemplated(copies.cc ?? '') || isTemplated(copies.bcc ?? '')) {
            return await this.refuse(request.teamId, 'sandbox_recipient_not_allowed', 'recipient_not_member', 1)
        }
        const recipients = sandboxEnvelopeRecipients(sandboxEnvelope(request.to, copies.cc, copies.bcc))
        return (
            (await this.recipientRefusal(request.teamId, recipients)) ??
            (await this.dailyCapRefusal(request.teamId, recipients))
        )
    }

    private async suspensionRefusal(teamId: number): Promise<SandboxSendRefusal | null> {
        if (!this.sandboxSender.canSend) {
            return await this.refuse(teamId, 'sending_suspended', 'switch_off', 0)
        }
        const gate = await this.sandboxSender.pauseGate()
        switch (gate) {
            case 'open':
                return null
            case 'paused':
                return await this.refuse(teamId, 'sending_suspended', 'paused', 0)
            case 'check_failed':
                return await this.refuse(teamId, 'sandbox_check_failed', 'check_failed', 0)
        }
    }

    private async dailyCapRefusal(teamId: number, recipients: string[]): Promise<SandboxSendRefusal | null> {
        const peek = await this.sandboxSender.peekDailyCaps(teamId, recipients)
        switch (peek.type) {
            case 'available':
                return null
            case 'check_failed':
                return await this.refuse(teamId, 'sandbox_check_failed', 'check_failed', recipients.length)
            case 'project_cap_reached':
                return await this.refuse(teamId, 'sandbox_limit_reached', 'cap_reached', recipients.length)
            case 'recipient_cap_reached':
                return await this.refuse(teamId, 'sandbox_limit_reached', 'cap_reached', peek.addresses.length)
        }
    }

    private async sendsThroughSandbox(request: SandboxSendRequest, stored: StoredSender | null): Promise<boolean> {
        const sender = request.send?.from ?? stored
        if (!sender) {
            return false
        }
        const integration = await this.integrationManager.get(
            selectEmailSenderIntegrationId(request.invocationId, sender)
        )
        return (
            integration?.team_id === request.teamId &&
            integration.kind === 'email' &&
            integration.config.provider === 'sandbox'
        )
    }

    private async recipientRefusal(teamId: number, recipients: string[]): Promise<SandboxSendRefusal | null> {
        let check
        try {
            check = await this.organizationMembers.checkRecipients(teamId, recipients)
        } catch {
            return await this.refuse(teamId, 'sandbox_check_failed', 'check_failed', recipients.length)
        }
        if (check.organizationBlocked) {
            return await this.refuse(teamId, 'sending_suspended', 'organization_blocked', 0)
        }
        if (check.blockedRecipients.length) {
            return await this.refuse(
                teamId,
                'sandbox_recipient_not_allowed',
                check.blockedRecipients.every(({ unverifiedMember }) => unverifiedMember)
                    ? 'recipient_unverified'
                    : 'recipient_not_member',
                check.blockedRecipients.length
            )
        }
        return null
    }

    private async refuse(
        teamId: number,
        refusal: SandboxSendRefusal,
        reason: Parameters<SandboxEmailSender['captureBlocked']>[2],
        blockedRecipientCount: number
    ): Promise<SandboxSendRefusal> {
        await this.sandboxSender.captureBlocked(teamId, 'api', reason, blockedRecipientCount)
        return refusal
    }
}

function storedSender(step: unknown): StoredSender | null {
    const parsed = StoredSenderSchema.safeParse(step)
    return parsed.success ? parsed.data.from : null
}

function storedCopies(step: unknown): StoredCopies | null {
    const parsed = StoredCopiesSchema.safeParse(step)
    return parsed.success ? parsed.data : null
}

function storedEmailStep(hogFlow: HogFlow): unknown {
    const action = hogFlow.actions.find((candidate) => candidate.type === 'function_email')
    return (action?.type === 'function_email' ? action.config.inputs?.email?.value : undefined) ?? {}
}
