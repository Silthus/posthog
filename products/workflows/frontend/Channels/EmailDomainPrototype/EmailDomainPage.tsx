import { useMemo, useState } from 'react'

import { IconRefresh } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonCollapse, LemonTag, Spinner, lemonToast } from '@posthog/lemon-ui'

import { buildSetupPrompt } from './buildSetupPrompt'
import { DnsRecordsTable } from './DnsRecordsTable'
import { DomainStatusTimeline } from './DomainStatusTimeline'
import { FirstSenderCard } from './FirstSenderCard'
import {
    DnsHost,
    DnsRecordStatus,
    DomainStatus,
    PROTOTYPE_PROJECT_ID,
    PROTOTYPE_SENDER_ID,
    PrototypeDnsRecord,
    buildRecords,
} from './prototypeData'
import { SetupPromptMenu } from './SetupPromptMenu'
import { SpottedEmailToolCard } from './SpottedEmailToolCard'

export interface EmailDomainPageProps {
    domain: string
    status: DomainStatus
    dnsHost: DnsHost | null
    pollingStopped?: boolean
    spottedTool?: string | null
    showAgentMenu?: boolean
}

const STATUS_TAG: Record<DomainStatus, { label: string; type: 'success' | 'warning' | 'danger' | 'default' }> = {
    not_started: { label: 'Not started', type: 'default' },
    pending: { label: 'Waiting on DNS', type: 'warning' },
    records_found: { label: 'Confirming', type: 'warning' },
    verified: { label: 'Verified', type: 'success' },
    temporary_failure: { label: 'Record missing', type: 'danger' },
    failed: { label: 'Verification failed', type: 'danger' },
}

const recordStatusFor = (status: DomainStatus): DnsRecordStatus => {
    switch (status) {
        case 'verified':
            return 'verified'
        case 'records_found':
            return 'found'
        default:
            return 'pending'
    }
}

const withOneMissingRecord = (records: PrototypeDnsRecord[]): PrototypeDnsRecord[] =>
    records.map((record, index) => (index === 2 ? { ...record, status: 'missing' } : record))

function StatusMessage({
    status,
    pollingStopped,
    checking,
    onCheckAgain,
}: {
    status: DomainStatus
    pollingStopped: boolean
    checking: boolean
    onCheckAgain: () => void
}): JSX.Element | null {
    const checkAgain = (
        <LemonButton
            type="secondary"
            size="small"
            icon={checking ? <Spinner /> : <IconRefresh />}
            loading={checking}
            onClick={onCheckAgain}
            data-attr="email-domain-check-again"
        >
            Check again
        </LemonButton>
    )

    switch (status) {
        case 'not_started':
        case 'pending':
            return pollingStopped ? (
                <LemonBanner type="warning" action={{ children: 'Check again', onClick: onCheckAgain }}>
                    Still waiting on DNS. We stopped checking automatically. DNS changes can take up to 72 hours, so
                    come back later or check now.
                </LemonBanner>
            ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded border bg-fill-primary px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                        <Spinner className="text-base" />
                        Looking for your DNS records. This usually takes a few minutes.
                    </span>
                    {checkAgain}
                </div>
            )
        case 'records_found':
            return (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded border bg-fill-primary px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                        <Spinner className="text-base" />
                        Records look right, waiting for confirmation. No need to change anything.
                    </span>
                    {checkAgain}
                </div>
            )
        case 'verified':
            return <LemonBanner type="success">Verified. You can send emails from this domain.</LemonBanner>
        case 'temporary_failure':
            return (
                <LemonBanner type="error" action={{ children: 'Check again', onClick: onCheckAgain }}>
                    A DNS record went missing. Sending still works for now, but it stops if the record stays gone for 72
                    hours. Restore the record shown below.
                </LemonBanner>
            )
        case 'failed':
            return (
                <LemonBanner
                    type="error"
                    action={{
                        children: 'Restart verification',
                        onClick: () => lemonToast.info('Verification restarted'),
                    }}
                >
                    We couldn't find the records within 72 hours, so verification stopped. Add the records below and
                    restart.
                </LemonBanner>
            )
    }
}

export function EmailDomainPage({
    domain,
    status,
    dnsHost,
    pollingStopped = false,
    spottedTool = null,
    showAgentMenu = true,
}: EmailDomainPageProps): JSX.Element {
    const [checking, setChecking] = useState(false)
    const [spottedDismissed, setSpottedDismissed] = useState(false)
    const pageUrl = `https://us.posthog.com/project/${PROTOTYPE_PROJECT_ID}/workflows/channels/email/${PROTOTYPE_SENDER_ID}`

    const records = useMemo(() => {
        const base = buildRecords(domain, 'feedback', recordStatusFor(status))
        return status === 'temporary_failure'
            ? withOneMissingRecord(base.map((record) => ({ ...record, status: 'verified' })))
            : base
    }, [domain, status])

    const setupPrompt = useMemo(
        () =>
            buildSetupPrompt({
                domain,
                mailFromSubdomain: 'feedback',
                projectId: PROTOTYPE_PROJECT_ID,
                senderId: PROTOTYPE_SENDER_ID,
                dnsHost,
                records,
            }),
        [domain, dnsHost, records]
    )

    const checkAgain = (): void => {
        setChecking(true)
        window.setTimeout(() => {
            setChecking(false)
            lemonToast.info('Checked. Nothing changed yet.')
        }, 1200)
    }

    const needsRecords = status !== 'verified'
    const problemRecords = status === 'temporary_failure' ? records.filter((record) => record.status === 'missing') : []

    return (
        <div className="flex flex-col gap-6 @container">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-xs text-secondary uppercase tracking-wide">Email domain</span>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="m-0 text-xl font-semibold truncate">{domain}</h1>
                        <LemonTag type={STATUS_TAG[status].type}>{STATUS_TAG[status].label}</LemonTag>
                    </div>
                    <span className="text-sm text-secondary">
                        DNS at {dnsHost?.name ?? 'an unknown host'}. Bounce subdomain feedback.{domain}.
                    </span>
                </div>
                {showAgentMenu && (
                    <SetupPromptMenu
                        prompt={setupPrompt}
                        records={records.map((record) => `${record.type}\t${record.name}\t${record.value}`).join('\n')}
                        pageUrl={pageUrl}
                    />
                )}
            </header>

            <div className="rounded border bg-surface-primary p-4 @container">
                <DomainStatusTimeline
                    status={status}
                    addedAt="Today, 09:12"
                    recordsFoundAt={status === 'pending' || status === 'failed' ? null : 'Today, 09:14'}
                    verifiedAt={status === 'verified' || status === 'temporary_failure' ? 'Today, 09:21' : null}
                />
            </div>

            <StatusMessage
                status={status}
                pollingStopped={pollingStopped}
                checking={checking}
                onCheckAgain={checkAgain}
            />

            {spottedTool && !spottedDismissed && (
                <SpottedEmailToolCard
                    toolName={spottedTool}
                    domain={domain}
                    onImportUnsubscribes={() => lemonToast.info(`Opens the ${spottedTool} import`)}
                    onDismiss={() => setSpottedDismissed(true)}
                />
            )}

            {status === 'verified' && (
                <FirstSenderCard
                    domain={domain}
                    initialLocalPart="hello"
                    initialName="Acme"
                    currentUserEmail="michael@posthog.com"
                />
            )}

            {problemRecords.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="m-0 text-base font-semibold">Restore this record</h3>
                    <DnsRecordsTable records={problemRecords} />
                </div>
            )}

            <LemonCollapse
                defaultActiveKey={
                    needsRecords && status !== 'temporary_failure' && dnsHost?.supportsDomainConnect !== true
                        ? 'records'
                        : undefined
                }
                panels={[
                    {
                        key: 'records',
                        header: `DNS records (${records.filter((record) => record.status === 'verified' || record.status === 'found').length} of ${records.length} found)`,
                        content: (
                            <div className="flex flex-col gap-3">
                                {dnsHost && needsRecords && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <LemonButton
                                            type="secondary"
                                            size="small"
                                            to={dnsHost.dnsSettingsUrl}
                                            targetBlank
                                        >
                                            Open {dnsHost.name} DNS settings
                                        </LemonButton>
                                        {dnsHost.gotcha && (
                                            <span className="text-xs text-secondary">{dnsHost.gotcha}</span>
                                        )}
                                    </div>
                                )}
                                <DnsRecordsTable records={records} />
                            </div>
                        ),
                    },
                ]}
            />
        </div>
    )
}
