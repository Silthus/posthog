import type { EmailTemplateFrom } from 'scenes/hog-functions/email-templater/types'
import { urls } from 'scenes/urls'

import type { IntegrationType } from '~/types'

import { isEmailAction } from './hogflows/steps/types'
import type { HogFlow } from './hogflows/types'

export type SenderDomainNotice =
    | { stage: 'no_domain'; url: string }
    | { stage: 'unverified' | 'waiting'; domains: string[]; url: string }

function chosenSenderIds(sender: EmailTemplateFrom | undefined): number[] {
    return sender?.integrationIds?.length ? sender.integrationIds : sender?.integrationId ? [sender.integrationId] : []
}

function hasEmailStepWithoutSender(workflow: HogFlow, emailSenders: IntegrationType[]): boolean {
    const existingSenderIds = new Set(emailSenders.map(({ id }) => id))
    return workflow.actions.filter(isEmailAction).some((action) => {
        const senderIds = chosenSenderIds(action.config.inputs.email?.value?.from)
        return !senderIds.some((senderId) => existingSenderIds.has(senderId))
    })
}

function domainStatus(senders: { id: number; domain: string }[]): { domains: string[]; url: string } {
    const domains = [...new Set(senders.map(({ domain }) => domain))]
    const url = domains.length === 1 ? urls.workflowsEmailDomain(senders[0].id) : urls.workflows('channels')
    return { domains, url }
}

function projectDomainNotice(workflow: HogFlow, emailSenders: IntegrationType[]): SenderDomainNotice | null {
    const hasVerifiedSender = emailSenders.some(({ config }) => config.verified === true)
    if (hasVerifiedSender || !hasEmailStepWithoutSender(workflow, emailSenders)) {
        return null
    }
    const pendingSenders = emailSenders.map(({ id, config }) => ({ id, domain: config.domain as string }))
    return pendingSenders.length > 0
        ? { stage: 'unverified', ...domainStatus(pendingSenders) }
        : { stage: 'no_domain', url: urls.workflowsEmailDomain('new') }
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
