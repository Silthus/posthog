// PROTOTYPE (throwaway): the always-visible records list of the Board variant, with live status dots.
import clsx from 'clsx'

import { IconCopy } from '@posthog/icons'
import { LemonButton, LemonTag, Spinner, Tooltip, lemonToast } from '@posthog/lemon-ui'

import { copyToClipboard } from 'lib/utils/copyToClipboard'

import { DnsRecordStatus, PrototypeDnsRecord, RECORD_KIND_LABEL } from '../../prototypeData'

const DOT: Record<DnsRecordStatus, { className: string; label: string }> = {
    pending: { className: 'bg-fill-primary border-primary', label: 'Not found yet' },
    found: { className: 'bg-success border-success', label: 'Found' },
    verified: { className: 'bg-success border-success', label: 'Verified' },
    missing: { className: 'bg-danger border-danger', label: 'Missing' },
    unknown: { className: 'bg-fill-primary border-primary', label: 'Unknown' },
}

function StatusDot({ status }: { status: DnsRecordStatus }): JSX.Element {
    const dot = DOT[status]
    return (
        <Tooltip title={dot.label}>
            <span
                className={clsx('size-3 rounded-full border shrink-0', dot.className)}
                role="img"
                aria-label={dot.label}
            />
        </Tooltip>
    )
}

const copy = async (value: string, description: string): Promise<void> => {
    if (await copyToClipboard(value, description, { silent: true })) {
        lemonToast.success(`Copied the ${description}`)
    }
}

function CopyField({ label, value, description }: { label: string; value: string; description: string }): JSX.Element {
    return (
        <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs text-secondary">{label}</span>
            <div className="flex items-start gap-1 min-w-0">
                <code className="font-mono text-xs break-all bg-fill-primary border rounded px-1.5 py-1 flex-1 min-w-0">
                    {value}
                </code>
                <LemonButton
                    size="xsmall"
                    icon={<IconCopy />}
                    tooltip={`Copy ${description}`}
                    onClick={() => void copy(value, description)}
                    data-attr="email-domain-board-copy"
                />
            </div>
        </div>
    )
}

export function RecordRows({ records, checking }: { records: PrototypeDnsRecord[]; checking: boolean }): JSX.Element {
    const found = records.filter((r) => r.status === 'found' || r.status === 'verified').length
    return (
        <div className="flex flex-col rounded border bg-surface-primary">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b bg-surface-secondary text-xs text-secondary">
                <span>{records.length} settings. Each one is a name and a value you paste in at your DNS host.</span>
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {checking && <Spinner className="text-sm" />}
                    {checking ? `Checking, ${found} of ${records.length} found` : 'Not checked yet'}
                </span>
            </div>
            <ol className="m-0 p-0 list-none divide-y">
                {records.map((record, index) => (
                    <li key={index} className="flex flex-col gap-2 p-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <StatusDot status={record.status} />
                            <span className="text-sm font-medium min-w-0 break-words">
                                {RECORD_KIND_LABEL[record.kind]}
                            </span>
                            <LemonTag type="default" className="font-mono ml-auto shrink-0">
                                {record.type}
                            </LemonTag>
                        </div>
                        <div className="grid gap-2 @xl:grid-cols-2">
                            <CopyField label="Name" value={record.name} description="record name" />
                            <CopyField
                                label={record.priority != null ? `Value (priority ${record.priority})` : 'Value'}
                                value={record.value}
                                description="record value"
                            />
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    )
}
