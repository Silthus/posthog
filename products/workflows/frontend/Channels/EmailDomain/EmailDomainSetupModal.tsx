import { useValues } from 'kea'
import posthog from 'posthog-js'
import { ReactNode, useEffect, useState } from 'react'

import { IconExternal } from '@posthog/icons'
import { LemonButton, LemonModal, LemonSkeleton } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { BindEmailDomainLogics } from './BindEmailDomainLogics'
import { AgentHandoffModal } from './components/AgentHandoffModal'
import { emailDomainLogic } from './emailDomainLogic'
import { DomainStep } from './steps/DomainStep'
import { ReadyStep } from './steps/ReadyStep'
import { SettingsStep } from './steps/SettingsStep'
import { UnavailableStep } from './steps/UnavailableStep'
import { VerifyingStep } from './steps/VerifyingStep'

export interface EmailDomainSetupModalProps {
    /** The sender to verify. Without it the setup starts at the domain step. */
    integrationId?: number | null
    entry: 'channels' | 'broadcast' | 'configure' | 'workflow'
    description?: ReactNode
    /** Shown after the wait for DNS and in place of the workflow suggestions on the last step. */
    next?: ReactNode
    onComplete: (integrationId?: number) => void
    onClose: (savedIntegrationId?: number) => void
}

function ModalStep({ next }: { next?: ReactNode }): JSX.Element {
    const { phase } = useValues(emailDomainLogic)
    switch (phase) {
        case 'unavailable':
            return <UnavailableStep />
        case 'settings':
            return <SettingsStep />
        case 'verifying':
            return (
                <>
                    <VerifyingStep />
                    {next}
                </>
            )
        case 'ready':
            return <ReadyStep next={next} />
        default:
            return <LemonSkeleton className="h-40" />
    }
}

function ModalSettings({
    integrationId,
    next,
    onLeave,
}: {
    integrationId: number
    next?: ReactNode
    onLeave: () => void
}): JSX.Element {
    return (
        <BindEmailDomainLogics id={String(integrationId)}>
            <div className="@container flex flex-col gap-6">
                <ModalStep next={next} />
                <LemonButton
                    type="tertiary"
                    className="self-center"
                    to={urls.workflowsEmailDomain(integrationId)}
                    onClick={onLeave}
                    sideIcon={<IconExternal />}
                >
                    Open full page
                </LemonButton>
                <AgentHandoffModal />
            </div>
        </BindEmailDomainLogics>
    )
}

export function EmailDomainSetupModal({
    integrationId: initialIntegrationId,
    entry,
    description,
    next,
    onComplete,
    onClose,
}: EmailDomainSetupModalProps): JSX.Element {
    const [integrationId, setIntegrationId] = useState<number | null>(initialIntegrationId ?? null)

    useEffect(() => {
        // pinned: analytics event name
        posthog.capture('email domain setup started', { entry })
    }, [entry])

    return (
        <LemonModal
            title={integrationId ? 'Verify your sending domain' : 'Set up a sending domain'}
            description={description}
            width={720}
            onClose={() => (integrationId ? onComplete(integrationId) : onClose())}
        >
            {integrationId ? (
                <ModalSettings integrationId={integrationId} next={next} onLeave={() => onComplete(integrationId)} />
            ) : (
                <div className="@container">
                    <DomainStep logicKey="modal" onCreated={(created) => setIntegrationId(created.id)} />
                </div>
            )}
        </LemonModal>
    )
}
