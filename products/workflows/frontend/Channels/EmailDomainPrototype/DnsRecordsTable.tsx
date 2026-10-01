import { IconCheckCircle, IconCopy, IconHourglass, IconQuestion, IconWarning } from '@posthog/icons'
import { LemonButton, LemonTag, Tooltip } from '@posthog/lemon-ui'

import { copyToClipboard } from 'lib/utils/copyToClipboard'

import { DnsRecordStatus, PrototypeDnsRecord, RECORD_KIND_LABEL } from './prototypeData'

const STATUS_PRESENTATION: Record<DnsRecordStatus, { label: string; icon: JSX.Element; tooltip: string }> = {
    verified: {
        label: 'Verified',
        icon: <IconCheckCircle className="text-success" />,
        tooltip: 'Amazon SES confirmed this record.',
    },
    found: {
        label: 'Found',
        icon: <IconCheckCircle className="text-success" />,
        tooltip: 'We found this record at your nameservers. Waiting for Amazon SES to confirm it.',
    },
    pending: {
        label: 'Not found yet',
        icon: <IconHourglass className="text-warning" />,
        tooltip: 'We have not seen this record yet.',
    },
    missing: {
        label: 'Missing',
        icon: <IconWarning className="text-danger" />,
        tooltip: 'This record was present before and is gone now.',
    },
    unknown: {
        label: 'Unknown',
        icon: <IconQuestion className="text-muted" />,
        tooltip: 'We could not check this record right now.',
    },
}

function RecordStatus({ status }: { status: DnsRecordStatus }): JSX.Element {
    const presentation = STATUS_PRESENTATION[status]
    return (
        <Tooltip title={presentation.tooltip}>
            <span className="inline-flex items-center gap-1 text-sm whitespace-nowrap">
                {presentation.icon}
                {presentation.label}
            </span>
        </Tooltip>
    )
}

function CopyableValue({ value, description }: { value: string; description: string }): JSX.Element {
    return (
        <div className="flex items-start gap-1 min-w-0">
            <code className="font-mono text-xs break-all bg-fill-primary border rounded px-1.5 py-1 flex-1 min-w-0">
                {value}
            </code>
            <LemonButton
                size="xsmall"
                icon={<IconCopy />}
                tooltip={`Copy ${description}`}
                onClick={() => void copyToClipboard(value, description)}
                data-attr="email-domain-record-copy"
            />
        </div>
    )
}

export interface DnsRecordsTableProps {
    records: PrototypeDnsRecord[]
    showStatus?: boolean
}

export function DnsRecordsTable({ records, showStatus = true }: DnsRecordsTableProps): JSX.Element {
    return (
        <div className="flex flex-col divide-y border rounded bg-surface-primary">
            {records.map((record, index) => (
                <div key={index} className="flex flex-col gap-2 p-3 @container">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <LemonTag type="default" className="font-mono">
                                {record.type}
                            </LemonTag>
                            <span className="text-sm text-secondary truncate">{RECORD_KIND_LABEL[record.kind]}</span>
                        </div>
                        {showStatus && <RecordStatus status={record.status} />}
                    </div>
                    <div className="grid gap-2 @md:grid-cols-2">
                        <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-xs text-secondary">Name</span>
                            <CopyableValue value={record.name} description="record name" />
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-xs text-secondary">
                                Value{record.priority != null ? ` (priority ${record.priority})` : ''}
                            </span>
                            <CopyableValue value={record.value} description="record value" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
