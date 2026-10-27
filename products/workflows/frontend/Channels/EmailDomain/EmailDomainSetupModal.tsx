import { useValues } from 'kea'
import posthog from 'posthog-js'
import { useEffect, useRef, useState } from 'react'

import { IconExternal } from '@posthog/icons'
import { LemonButton, LemonModal, LemonSkeleton } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { IntegrationType } from '~/types'

import { EmailSetupSurface, captureEmailDomainSetupClosed } from '../EmailSetup/emailSetupModalLogic'
import { BindEmailDomainLogics } from './BindEmailDomainLogics'
import { AgentHandoffModal } from './components/AgentHandoffModal'
import { emailDomainLogic } from './emailDomainLogic'
import { DomainStep } from './steps/DomainStep'
import { ReadyStep } from './steps/ReadyStep'
import { SettingsStep } from './steps/SettingsStep'
import { UnavailableStep } from './steps/UnavailableStep'
import { VerifyingStep } from './steps/VerifyingStep'

export interface EmailDomainSetupModalProps {
    integration?: IntegrationType | null
    entry: 'channels' | 'broadcast' | 'configure'
    surface: EmailSetupSurface
    onComplete: (integrationId?: number) => void
    onClose: (savedIntegrationId?: number) => void
    onSenderCreated?: (integrationId: number) => void
}

function ModalStep(): JSX.Element {
    const { phase } = useValues(emailDomainLogic)
    switch (phase) {
        case 'unavailable':
            return <UnavailableStep />
        case 'settings':
            return <SettingsStep />
        case 'verifying':
            return <VerifyingStep />
        case 'ready':
            return <ReadyStep />
        default:
            return <LemonSkeleton className="h-40" />
    }
}

function ModalSettings({
    integrationId,
    openInNewTab,
    onLeave,
}: {
    integrationId: number
    openInNewTab: boolean
    onLeave: () => void
}): JSX.Element {
    return (
        <BindEmailDomainLogics id={String(integrationId)}>
            <div className="@container flex flex-col gap-6">
                <ModalStep />
                <LemonButton
                    type="tertiary"
                    className="self-center"
                    to={urls.workflowsEmailDomain(integrationId)}
                    targetBlank={openInNewTab}
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

function useReportSetupClosedOnUnmount(integrationId: number | null, surface: EmailSetupSurface): void {
    const { furthestStep } = useValues(emailDomainLogic({ id: integrationId ? String(integrationId) : 'new' }))
    const furthestStepRef = useRef(furthestStep)
    furthestStepRef.current = furthestStep

    useEffect(
        () => () =>
            captureEmailDomainSetupClosed({
                furthestStep: furthestStepRef.current,
                surface,
                completed: furthestStepRef.current === 'ready',
            }),
        [surface]
    )
}

export function EmailDomainSetupModal({
    integration,
    entry,
    surface,
    onComplete,
    onClose,
    onSenderCreated,
}: EmailDomainSetupModalProps): JSX.Element {
    const [integrationId, setIntegrationId] = useState<number | null>(integration?.id ?? null)
    useReportSetupClosedOnUnmount(integrationId, surface)

    useEffect(() => {
        // pinned: analytics event name
        posthog.capture('email domain setup started', { entry })
    }, [entry])

    return (
        <LemonModal
            title={integrationId ? 'Verify your sending domain' : 'Set up a sending domain'}
            width={720}
            onClose={() => (integrationId ? onComplete(integrationId) : onClose())}
        >
            {integrationId ? (
                // A broadcast saves its new sender a moment after the modal hands it over, so leaving the
                // page right away would drop it. The full page opens next to the broadcast instead.
                <ModalSettings
                    integrationId={integrationId}
                    openInNewTab={entry === 'broadcast'}
                    onLeave={() => onComplete(integrationId)}
                />
            ) : (
                <div className="@container">
                    <DomainStep
                        logicKey="modal"
                        onCreated={(created) => {
                            setIntegrationId(created.id)
                            onSenderCreated?.(created.id)
                        }}
                    />
                </div>
            )}
        </LemonModal>
    )
}
