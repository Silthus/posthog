import { IconGear, IconLetter, IconPlus } from '@posthog/icons'
import { LemonButton, LemonTable, LemonTag, Link } from '@posthog/lemon-ui'

import { DomainStatus } from './prototypeData'

export interface EmailDomainRow {
    domain: string
    status: DomainStatus
    senderCount: number
    dnsHost: string | null
}

export interface EmailDomainsSectionProps {
    domains: EmailDomainRow[]
    onAddDomain: () => void
    onOpenDomain: (domain: string) => void
}

const STATUS_TAG: Record<DomainStatus, { label: string; type: 'success' | 'warning' | 'danger' | 'default' }> = {
    not_started: { label: 'Not started', type: 'default' },
    pending: { label: 'Waiting on DNS', type: 'warning' },
    records_found: { label: 'Confirming', type: 'warning' },
    verified: { label: 'Verified', type: 'success' },
    temporary_failure: { label: 'Record missing', type: 'danger' },
    failed: { label: 'Failed', type: 'danger' },
}

export function EmailDomainsSection({ domains, onAddDomain, onOpenDomain }: EmailDomainsSectionProps): JSX.Element {
    return (
        <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                    <h3 className="m-0 text-base font-semibold">Domains</h3>
                    <p className="m-0 text-sm text-secondary">Domains you send workflow and broadcast emails from.</p>
                </div>
                <LemonButton
                    type="primary"
                    size="small"
                    icon={<IconPlus />}
                    onClick={onAddDomain}
                    data-attr="email-domain-add"
                >
                    Add domain
                </LemonButton>
            </div>
            <LemonTable
                dataSource={domains}
                rowKey="domain"
                size="small"
                emptyState="No domains yet. Add one to start sending email."
                columns={[
                    {
                        title: 'Domain',
                        key: 'domain',
                        render: (_, row) => (
                            <span className="flex items-center gap-2 min-w-0">
                                <IconLetter className="text-lg text-secondary shrink-0" />
                                <Link onClick={() => onOpenDomain(row.domain)} className="font-medium truncate">
                                    {row.domain}
                                </Link>
                            </span>
                        ),
                    },
                    {
                        title: 'Status',
                        key: 'status',
                        render: (_, row) => (
                            <LemonTag type={STATUS_TAG[row.status].type}>{STATUS_TAG[row.status].label}</LemonTag>
                        ),
                    },
                    {
                        title: 'Senders',
                        key: 'senders',
                        render: (_, row) => <span>{row.senderCount}</span>,
                    },
                    {
                        title: 'DNS host',
                        key: 'host',
                        render: (_, row) => <span className="text-secondary">{row.dnsHost ?? 'Unknown'}</span>,
                    },
                    {
                        key: 'actions',
                        width: 0,
                        render: (_, row) => (
                            <LemonButton
                                size="small"
                                icon={<IconGear />}
                                onClick={() => onOpenDomain(row.domain)}
                                tooltip="Open domain"
                                data-attr="email-domain-open"
                            />
                        ),
                    },
                ]}
            />
        </section>
    )
}
