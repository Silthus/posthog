// PROTOTYPE ONLY (silthus/posthog#212). Says plainly that the welcome email sends from a shared PostHog
// address, and leads to the team's own domain without blocking anything.
import { useActions, useValues } from 'kea'

import { LemonBanner } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { OWN_SENDER, SHARED_SENDER, TEAM_BRAND } from './firstRunScenario'

export function SharedSenderBanner(): JSX.Element | null {
    const { ownDomain, workflowStatus, senderIntegrationId, workflowCreated } = useValues(firstRunPrototypeLogic)
    const { switchToOwnSender } = useActions(firstRunPrototypeLogic)

    if (!workflowCreated || senderIntegrationId === OWN_SENDER.integrationId) {
        return null
    }

    if (ownDomain === 'verified') {
        return (
            <LemonBanner
                type="success"
                className="mb-2"
                action={{ children: `Send from ${OWN_SENDER.address}`, onClick: switchToOwnSender }}
            >
                {TEAM_BRAND.domain} is verified. Switch this email to your own address.
            </LemonBanner>
        )
    }

    if (ownDomain === 'verifying') {
        return (
            <LemonBanner type="info" className="mb-2">
                {TEAM_BRAND.domain} is verifying, which can take up to 48 hours. This email keeps sending from{' '}
                {SHARED_SENDER.address} until then.
            </LemonBanner>
        )
    }

    const useOwnDomain = { children: 'Use my own domain', to: urls.workflows('channels') }
    return workflowStatus === 'active' ? (
        <LemonBanner type="warning" className="mb-2" action={useOwnDomain}>
            This email is live from {SHARED_SENDER.address}, a shared PostHog address. Send from your own domain so
            replies reach you and your emails build your own reputation.
        </LemonBanner>
    ) : (
        <LemonBanner type="info" className="mb-2" action={useOwnDomain}>
            This sends from {SHARED_SENDER.address}, a shared PostHog address with your name on it, until you add your
            own domain. Shared sending has a lower daily limit. Check the email, then click Enable.
        </LemonBanner>
    )
}
