// PROTOTYPE ONLY (silthus/posthog#212). Tells the team what happens next with its first workflow: enable it
// while it is a draft, then go and see what it sent. The team's own domain comes after, as a quieter line.
import { useActions, useValues } from 'kea'
import { router } from 'kea-router'
import { useEffect, useState } from 'react'

import { LemonBanner, Link } from '@posthog/lemon-ui'

import { globalSetupLogic } from 'lib/components/ProductSetup'
import { urls } from 'scenes/urls'

import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { OWN_SENDER, SHARED_SENDER, TEAM_BRAND, WORKFLOW_ID } from './firstRunScenario'
import { sendsFor } from './realTemplates'
import { CurlyArrow } from './shared/CurlyArrow'

const ENABLE_BUTTON = '[data-attr="workflow-launch"]'

function lowerFirst(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1)
}

export function WorkflowNextStep({ inEditor }: { inEditor?: boolean }): JSX.Element | null {
    const { template, workflowStatus } = useValues(firstRunPrototypeLogic)
    const [arrowAnchor, setArrowAnchor] = useState<HTMLElement | null>(null)

    useEffect(() => {
        if (inEditor && workflowStatus === 'draft') {
            globalSetupLogic.findMounted()?.actions.setHighlight(ENABLE_BUTTON, router.values.location.pathname)
        }
    }, [inEditor, workflowStatus])

    if (!template) {
        return null
    }
    const sends = lowerFirst(sendsFor(template))

    if (workflowStatus === 'draft') {
        return (
            <LemonBanner type="warning" className="mb-2 shrink-0">
                <div className="flex items-start justify-between gap-6">
                    <div className="flex flex-col gap-1">
                        <strong>This workflow is not sending yet.</strong>
                        <span>
                            Enable it, and it {sends}, from {SHARED_SENDER.address} with your name on it.
                        </span>
                        <DomainLine />
                    </div>
                    {inEditor && (
                        <span ref={setArrowAnchor} className="shrink-0 self-start text-sm font-semibold mr-48">
                            Enable it up here
                        </span>
                    )}
                </div>
                {inEditor && <CurlyArrow anchor={arrowAnchor} targetSelector={ENABLE_BUTTON} />}
            </LemonBanner>
        )
    }

    return (
        <LemonBanner
            type="success"
            className="mb-2 shrink-0"
            action={{
                children: 'View metrics',
                onClick: () => router.actions.push(urls.workflow(WORKFLOW_ID, 'metrics')),
            }}
        >
            <div className="flex flex-col gap-1">
                <strong>Your workflow is sending.</strong>
                <span>It {sends}. See who got it, who opened it and who clicked.</span>
                <DomainLine />
            </div>
        </LemonBanner>
    )
}

function DomainLine(): JSX.Element | null {
    const { ownDomain, senderIntegrationId } = useValues(firstRunPrototypeLogic)
    const { switchToOwnSender } = useActions(firstRunPrototypeLogic)

    if (senderIntegrationId === OWN_SENDER.integrationId) {
        return <span className="text-xs">Sending from {OWN_SENDER.address}.</span>
    }
    if (ownDomain === 'verified') {
        return (
            <span className="text-xs">
                {TEAM_BRAND.domain} is verified. <Link onClick={switchToOwnSender}>Send from {OWN_SENDER.address}</Link>
            </span>
        )
    }
    if (ownDomain === 'verifying') {
        return (
            <span className="text-xs">
                {TEAM_BRAND.domain} is verifying, which can take up to 48 hours. Until then it sends from the shared
                address.
            </span>
        )
    }
    return (
        <span className="text-xs">
            Shared sending has a lower daily limit.{' '}
            <Link to={urls.workflows('channels')}>Send from your own domain</Link> so replies reach you and your emails
            build your own reputation.
        </span>
    )
}
