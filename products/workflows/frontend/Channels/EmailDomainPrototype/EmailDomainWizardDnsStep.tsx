import { useState } from 'react'

import { IconArrowRight, IconExternal, IconLock } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonCollapse } from '@posthog/lemon-ui'

import cloudflareLogo from 'lib/components/DomainConnect/assets/cloudflare.svg'

import { DnsRecordsTable } from './DnsRecordsTable'
import { DnsHost, PrototypeDnsRecord } from './prototypeData'
import { SetupPromptMenu } from './SetupPromptMenu'

export interface EmailDomainWizardDnsStepProps {
    domain: string
    dnsHost: DnsHost | null
    records: PrototypeDnsRecord[]
    setupPrompt: string
    pageUrl: string
    showAgentMenu?: boolean
    onAutoConfigure: () => void
    onContinue: () => void
}

const recordsAsText = (records: PrototypeDnsRecord[]): string =>
    records
        .map(
            (record) =>
                `${record.type}\t${record.name}\t${record.value}${record.priority != null ? `\t${record.priority}` : ''}`
        )
        .join('\n')

function ManualRecords({ dnsHost, records }: { dnsHost: DnsHost | null; records: PrototypeDnsRecord[] }): JSX.Element {
    return (
        <div className="flex flex-col gap-3">
            {dnsHost?.gotcha && (
                <LemonBanner type="warning" hideIcon={false}>
                    {dnsHost.gotcha}
                </LemonBanner>
            )}
            <DnsRecordsTable records={records} showStatus={false} />
        </div>
    )
}

export function EmailDomainWizardDnsStep({
    domain,
    dnsHost,
    records,
    setupPrompt,
    pageUrl,
    showAgentMenu = true,
    onAutoConfigure,
    onContinue,
}: EmailDomainWizardDnsStepProps): JSX.Element {
    const [manualOpen, setManualOpen] = useState<'manual' | null>(dnsHost?.supportsDomainConnect ? null : 'manual')
    const canAutoConfigure = Boolean(dnsHost?.supportsDomainConnect)

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                    <h2 className="m-0 text-lg font-semibold">Add the DNS records for {domain}</h2>
                    <p className="m-0 text-sm text-secondary">
                        {canAutoConfigure && dnsHost
                            ? `Your DNS is managed by ${dnsHost.name}. You can let it add the records for you.`
                            : dnsHost
                              ? `Your DNS is managed by ${dnsHost.name}. Add these records there.`
                              : 'Add these records wherever your DNS is managed. Not sure where? Your domain registrar is a good first place to look.'}
                    </p>
                </div>
                {showAgentMenu && (
                    <SetupPromptMenu prompt={setupPrompt} records={recordsAsText(records)} pageUrl={pageUrl} />
                )}
            </div>

            {canAutoConfigure && dnsHost && (
                <div className="rounded border bg-surface-primary p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <img src={cloudflareLogo} alt="" className="size-5 rounded-sm" />
                        <span className="font-medium">Let {dnsHost.name} add the records</span>
                    </div>
                    <p className="m-0 text-sm text-secondary">
                        You sign in to {dnsHost.name} and approve the records once. We never see your {dnsHost.name}{' '}
                        login and can't make changes later.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <LemonButton
                            type="primary"
                            icon={<IconExternal />}
                            onClick={onAutoConfigure}
                            data-attr="email-domain-auto-configure"
                        >
                            Sign in to {dnsHost.name}
                        </LemonButton>
                        <LemonButton
                            type="tertiary"
                            onClick={() => setManualOpen(manualOpen ? null : 'manual')}
                            data-attr="email-domain-toggle-manual"
                        >
                            {manualOpen ? 'Hide records' : 'Add them myself instead'}
                        </LemonButton>
                        <span className="flex items-center gap-1 text-xs text-secondary ml-auto">
                            <IconLock />
                            One-time approval
                        </span>
                    </div>
                </div>
            )}

            {!canAutoConfigure && dnsHost && (
                <div className="flex flex-wrap items-center gap-2">
                    <LemonButton
                        type="secondary"
                        icon={<IconExternal />}
                        to={dnsHost.dnsSettingsUrl}
                        targetBlank
                        data-attr="email-domain-open-host"
                    >
                        Open {dnsHost.name} DNS settings
                    </LemonButton>
                    <span className="text-xs text-secondary">
                        Opens in a new tab. Keep this page open to copy from.
                    </span>
                </div>
            )}

            {canAutoConfigure ? (
                <LemonCollapse
                    activeKey={manualOpen}
                    onChange={setManualOpen}
                    panels={[
                        {
                            key: 'manual',
                            header: 'DNS records to add manually',
                            content: <ManualRecords dnsHost={dnsHost} records={records} />,
                        },
                    ]}
                />
            ) : (
                <ManualRecords dnsHost={dnsHost} records={records} />
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-secondary">
                    Added them? We check every few seconds and show the result on the domain page.
                </span>
                <LemonButton
                    type={canAutoConfigure ? 'secondary' : 'primary'}
                    sideIcon={<IconArrowRight />}
                    onClick={onContinue}
                    data-attr="email-domain-records-added"
                >
                    I've added the records
                </LemonButton>
            </div>
        </div>
    )
}
