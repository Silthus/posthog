import { useActions, useValues } from 'kea'
import { ReactNode } from 'react'

import { IconExternal, IconPlus, IconX } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonInputSelect, LemonLabel, LemonSelect, LemonTag } from '@posthog/lemon-ui'

import { useFeatureFlag } from 'lib/hooks/useFeatureFlag'
import { SANDBOX_EMAIL_SENDER_NOTE } from 'lib/integrations/utils'
import { urls } from 'scenes/urls'

import { IntegrationType } from '~/types'

import { emailTemplaterLogic } from './emailTemplaterLogic'
import { LiquidSupportedText } from './LiquidSupportedText'
import { selectedSenderIds } from './selectSenders'
import { EmailTemplateFrom, MAX_WORKFLOW_EMAIL_SENDERS } from './types'

function rotationSenderHint({
    sandboxSenderAvailable,
    hasCustomSenderDetails,
    selectedSenderCount,
}: {
    sandboxSenderAvailable: boolean
    hasCustomSenderDetails: boolean
    selectedSenderCount: number
}): string {
    const hints = [`Choose up to ${MAX_WORKFLOW_EMAIL_SENDERS} senders. Each workflow run uses one sender.`]
    if (sandboxSenderAvailable && (hasCustomSenderDetails || selectedSenderCount > 1)) {
        hints.push('Choosing the sandbox sender replaces the selection.')
        if (hasCustomSenderDetails) {
            hints.push('It also removes custom sender and Reply-To.')
        }
    }
    return hints.join(' ')
}

export function NativeEmailIntegrationChoice({
    label,
    onChange,
    value,
}: {
    /** Rendered inside the sender row so it aligns with the select rather than spanning the override rows. */
    label: ReactNode
    onChange: (value: EmailTemplateFrom) => void
    value?: EmailTemplateFrom
}): JSX.Element {
    const {
        logicProps,
        senderIntegrations,
        sandboxSenderId,
        isSandboxSenderSelected,
        senderIntegrationsLoading,
        senderIntegrationsError,
        hasCustomSenderDetails,
    } = useValues(emailTemplaterLogic)
    const { chooseSenders, retrySenderIntegrations } = useActions(emailTemplaterLogic)
    const senderRotationEnabled = useFeatureFlag('WORKFLOWS_EMAIL_SENDER_ROTATION')

    // Presence of the override keys is what reveals the inputs, so a saved override is
    // visible again on reopen without any separate reveal state.
    const overridesVisible = !isSandboxSenderSelected && (value?.email !== undefined || value?.name !== undefined)

    const onChangeIntegration = (integrationId: number): void => {
        if (integrationId === -1) {
            window.open(urls.workflows('channels'), '_blank')
            return
        }
        chooseSenders([integrationId])
    }

    const senderLabel = (integration: IntegrationType): JSX.Element => (
        <>
            <span translate="no">{integration.display_name}</span>
            {integration.id === sandboxSenderId && (
                <LemonTag type="highlight" className="ml-2 align-middle">
                    Sandbox
                </LemonTag>
            )}
        </>
    )

    const errorBanner = senderIntegrationsError ? (
        <LemonBanner
            type="error"
            className="break-words"
            action={{ children: 'Try again', onClick: retrySenderIntegrations, loading: senderIntegrationsLoading }}
        >
            {senderIntegrationsError}
        </LemonBanner>
    ) : null

    const connectSender = (
        <LemonButton
            size="small"
            type="tertiary"
            to={urls.workflows('channels')}
            targetBlank
            className="m-1 self-start"
            icon={<IconExternal />}
        >
            Connect email sender
        </LemonButton>
    )

    if (!senderIntegrationsLoading && senderIntegrations.length === 0 && errorBanner) {
        return (
            <div className="flex flex-col gap-2">
                {label}
                {errorBanner}
                {connectSender}
            </div>
        )
    }
    if (!senderIntegrationsLoading && senderIntegrations.length === 0) {
        return (
            <div className="flex gap-2 justify-between items-center">
                {label}
                <div className="flex gap-2 items-center">
                    <span className="text-muted">No email senders configured yet</span>
                    {connectSender}
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col">
            {errorBanner}
            <div className="flex gap-2 items-center">
                {label}
                {senderRotationEnabled ? (
                    <div className="flex flex-col flex-1 min-w-0">
                        <LemonInputSelect<number>
                            className="m-1 flex-1"
                            mode="multiple"
                            placeholder="Choose email senders"
                            loading={senderIntegrationsLoading}
                            options={senderIntegrations.map((integration) => ({
                                key: String(integration.id),
                                label: integration.display_name,
                                labelComponent: senderLabel(integration),
                                value: integration.id,
                            }))}
                            value={selectedSenderIds(value)}
                            size="small"
                            fullWidth
                            autoWidth={false}
                            onChange={chooseSenders}
                            data-attr="workflow-email-sender-select"
                            action={{
                                children: 'Add new email sender',
                                icon: <IconExternal />,
                                onClick: () => window.open(urls.workflows('channels'), '_blank'),
                            }}
                        />
                        <span className="px-2 pb-1 text-xs text-muted">
                            {isSandboxSenderSelected
                                ? SANDBOX_EMAIL_SENDER_NOTE
                                : rotationSenderHint({
                                      sandboxSenderAvailable: sandboxSenderId !== undefined,
                                      hasCustomSenderDetails,
                                      selectedSenderCount: selectedSenderIds(value).length,
                                  })}
                        </span>
                    </div>
                ) : (
                    <div className="flex flex-col flex-1 min-w-0">
                        <LemonSelect
                            className="m-1 flex-1"
                            type="tertiary"
                            placeholder="Choose email sender"
                            loading={senderIntegrationsLoading}
                            options={[
                                {
                                    title: 'Email senders',
                                    options: senderIntegrations.map((integration) => ({
                                        label: integration.display_name,
                                        labelInMenu: senderLabel(integration),
                                        value: integration.id,
                                    })),
                                },
                                {
                                    options: [
                                        {
                                            label: 'Add new email sender',
                                            icon: <IconExternal />,
                                            value: -1,
                                        },
                                    ],
                                },
                            ]}
                            value={value?.integrationId}
                            size="small"
                            fullWidth
                            onChange={onChangeIntegration}
                            data-attr="workflow-email-sender-select"
                        />
                        {isSandboxSenderSelected && (
                            <span className="px-2 pb-1 text-xs text-muted">{SANDBOX_EMAIL_SENDER_NOTE}</span>
                        )}
                        {!isSandboxSenderSelected && sandboxSenderId !== undefined && hasCustomSenderDetails && (
                            <span className="px-2 pb-1 text-xs text-muted">
                                Choosing the sandbox sender removes custom sender and Reply-To.
                            </span>
                        )}
                    </div>
                )}
                {!overridesVisible && !isSandboxSenderSelected && (
                    <LemonButton
                        size="xsmall"
                        type="secondary"
                        icon={<IconPlus />}
                        className="mr-2 shrink-0"
                        data-attr="email-from-custom-sender"
                        onClick={() => onChange({ ...value, email: '', name: '' })}
                        tooltip="Set a custom sender address or name, with template support"
                    >
                        Custom sender
                    </LemonButton>
                )}
            </div>
            {overridesVisible && (
                <>
                    <div className="flex gap-2 items-center border-t">
                        <LemonLabel
                            className="min-w-30 shrink-0"
                            info="The address to send from. Templates are supported, so the address can come from the triggering event. It must be on every selected sender's verified domain. Leave empty to use the sender's address."
                        >
                            Custom address
                        </LemonLabel>
                        <LiquidSupportedText
                            value={value?.email ?? ''}
                            onChange={(email) => onChange({ ...value, email })}
                            globals={logicProps.variables}
                        />
                        <LemonButton
                            size="xsmall"
                            type="tertiary"
                            icon={<IconX />}
                            className="mr-2"
                            data-attr="email-from-custom-sender-remove"
                            onClick={() => onChange({ ...value, email: undefined, name: undefined })}
                            tooltip="Remove custom sender"
                        />
                    </div>
                    <div className="flex gap-2 items-center border-t">
                        <LemonLabel
                            className="min-w-30 shrink-0"
                            info="The sender name shown in the recipient's inbox. Templates are supported. Leave empty to use the sender's name."
                        >
                            Custom name
                        </LemonLabel>
                        <LiquidSupportedText
                            value={value?.name ?? ''}
                            onChange={(name) => onChange({ ...value, name })}
                            globals={logicProps.variables}
                        />
                    </div>
                </>
            )}
        </div>
    )
}
