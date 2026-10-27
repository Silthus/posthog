import type { EmailTemplateFrom } from 'scenes/hog-functions/email-templater/types'

import type { IntegrationType } from '~/types'

import { isEmailAction } from './hogflows/steps/types'
import type { HogFlow } from './hogflows/types'

/** `integrationId` names the first pending domain's sender, whose setup the notice opens. */
export type SenderDomainNotice =
    | { stage: 'no_domain' }
    | { stage: 'unverified' | 'waiting'; domains: string[]; integrationId: number }

function chosenSenderIds(sender: EmailTemplateFrom | undefined): number[] {
    return sender?.integrationIds?.length ? sender.integrationIds : sender?.integrationId ? [sender.integrationId] : []
}

export function hasEmailStepWithoutSender(workflow: HogFlow, emailSenders: IntegrationType[]): boolean {
    const existingSenderIds = new Set(emailSenders.map(({ id }) => id))
    return workflow.actions.filter(isEmailAction).some((action) => {
        const senderIds = chosenSenderIds(action.config.inputs.email?.value?.from)
        return !senderIds.some((senderId) => existingSenderIds.has(senderId))
    })
}

function domainStatus(senders: { id: number; domain: string }[]): { domains: string[]; integrationId: number } {
    return { domains: [...new Set(senders.map(({ domain }) => domain))], integrationId: senders[0].id }
}

function projectDomainNotice(workflow: HogFlow, emailSenders: IntegrationType[]): SenderDomainNotice | null {
    const hasVerifiedSender = emailSenders.some(({ config }) => config.verified === true)
    if (hasVerifiedSender || !hasEmailStepWithoutSender(workflow, emailSenders)) {
        return null
    }
    const pendingSenders = emailSenders.map(({ id, config }) => ({ id, domain: config.domain as string }))
    return pendingSenders.length > 0 ? { stage: 'unverified', ...domainStatus(pendingSenders) } : { stage: 'no_domain' }
}

export function senderDomainNotice(
    workflow: HogFlow,
    savedWorkflow: HogFlow,
    emailSenders: IntegrationType[] | null
): SenderDomainNotice | null {
    const unverifiedSenders = savedWorkflow.unverified_email_senders ?? []
    if (unverifiedSenders.length > 0) {
        const stage = savedWorkflow.status === 'waiting_for_domain' ? 'waiting' : 'unverified'
        return { stage, ...domainStatus(unverifiedSenders) }
    }
    return emailSenders ? projectDomainNotice(workflow, emailSenders) : null
}
