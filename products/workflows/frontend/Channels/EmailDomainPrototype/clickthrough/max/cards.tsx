// PROTOTYPE (throwaway): the cards that sit inside Max's messages: domain input, subdomain picker, records, sender.
import clsx from 'clsx'
import { useState } from 'react'

import { IconCopy } from '@posthog/icons'
import { LemonButton, LemonInput, LemonSegmentedButton, LemonTag, Link } from '@posthog/lemon-ui'

import { copyToClipboard } from 'lib/utils/copyToClipboard'

import { PrototypeDnsRecord, RECORD_KIND_LABEL } from '../../prototypeData'
import { DomainProblem, SEND_PREFIX_OPTIONS, SetupSimulation } from '../simulation'

const PROBLEM_TEXT: Record<Exclude<DomainProblem, null>, string> = {
    free_mailbox: 'That is a free mailbox provider. You need a domain you own, like yourcompany.com.',
    taken_by_other_org: 'Another organization already sends from this domain. Pick one you own.',
    invalid: 'That does not look like a domain. Try something like yourcompany.com.',
}

export function CustomDomainRow({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const problem = derived.customDomainProblem
    const disabledReason = !derived.customDomainNormalized
        ? 'Type a domain first'
        : problem
          ? PROBLEM_TEXT[problem]
          : null
    const submit = (): void => {
        if (!disabledReason) {
            actions.chooseDomain(derived.customDomainNormalized)
        }
    }
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-2">
                <LemonInput
                    className="grow min-w-48"
                    size="small"
                    placeholder="yourcompany.com"
                    value={state.customDomainInput}
                    onChange={actions.setCustomDomainInput}
                    onPressEnter={submit}
                    autoFocus
                    data-attr="email-domain-max-custom-domain"
                />
                <LemonButton type="primary" size="small" onClick={submit} disabledReason={disabledReason}>
                    Use this domain
                </LemonButton>
            </div>
            {problem && <span className="text-xs text-danger">{PROBLEM_TEXT[problem]}</span>}
        </div>
    )
}

export function SubdomainPicker({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const option = SEND_PREFIX_OPTIONS.find((candidate) => candidate.prefix === state.sendPrefix)
    return (
        <div className="flex flex-col gap-2">
            <LemonSegmentedButton
                size="small"
                value={state.sendPrefix}
                onChange={actions.setSendPrefix}
                options={SEND_PREFIX_OPTIONS.map((candidate) => ({
                    value: candidate.prefix,
                    label: candidate.recommended ? `${candidate.label} (recommended)` : candidate.label,
                }))}
            />
            {option && <span className="text-xs text-secondary">{option.why}</span>}
            {advancedOpen ? (
                <label className="flex flex-col gap-1 text-xs text-secondary">
                    Bounce subdomain
                    <LemonInput
                        size="small"
                        value={state.bouncePrefix}
                        onChange={actions.setBouncePrefix}
                        suffix={<span className="text-secondary">.{derived.sendingDomain}</span>}
                    />
                </label>
            ) : (
                <Link className="text-xs" onClick={() => setAdvancedOpen(true)}>
                    Advanced
                </Link>
            )}
        </div>
    )
}

const STATUS_DOT: Record<PrototypeDnsRecord['status'], { label: string; className: string }> = {
    pending: { label: 'Not found yet', className: 'bg-border-bold motion-safe:animate-pulse' },
    found: { label: 'Found', className: 'bg-success' },
    verified: { label: 'Verified', className: 'bg-success' },
    missing: { label: 'Missing', className: 'bg-danger' },
    unknown: { label: 'Unknown', className: 'bg-border-bold' },
}

function CopyRow({ label, value, description }: { label: string; value: string; description: string }): JSX.Element {
    return (
        <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs text-secondary w-10 shrink-0">{label}</span>
            <code className="font-mono text-xs break-all flex-1 min-w-0 bg-surface-primary border rounded px-1.5 py-0.5">
                {value}
            </code>
            <LemonButton
                size="xsmall"
                icon={<IconCopy />}
                tooltip={`Copy ${description}`}
                onClick={() => void copyToClipboard(value, description)}
                data-attr="email-domain-max-copy"
            />
        </div>
    )
}

export function RecordsCard({ records, live }: { records: PrototypeDnsRecord[]; live: boolean }): JSX.Element {
    return (
        <ol className="m-0 p-0 list-none flex flex-col divide-y border rounded-lg bg-fill-primary">
            {records.map((record, index) => {
                const status = STATUS_DOT[record.status]
                return (
                    <li key={index} className="p-3 flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <LemonTag type="default" className="font-mono">
                                {record.type}
                            </LemonTag>
                            <span className="text-sm font-medium">{RECORD_KIND_LABEL[record.kind]}</span>
                            {record.priority != null && (
                                <span className="text-xs text-secondary">priority {record.priority}</span>
                            )}
                            {live && (
                                <span
                                    className={clsx(
                                        'ml-auto inline-flex items-center gap-1.5 text-xs whitespace-nowrap',
                                        record.status === 'missing' ? 'text-danger' : 'text-secondary'
                                    )}
                                >
                                    <span className={clsx('w-2 h-2 rounded-full', status.className)} />
                                    {status.label}
                                </span>
                            )}
                        </div>
                        <CopyRow label="Name" value={record.name} description="record name" />
                        <CopyRow label="Value" value={record.value} description="record value" />
                    </li>
                )
            })}
        </ol>
    )
}

export function SenderCard({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    return (
        <div className="flex flex-col gap-3">
            <div className="grid gap-2 @md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-secondary">
                    Name people see
                    <LemonInput
                        size="small"
                        value={state.senderName}
                        onChange={actions.setSenderName}
                        placeholder="Acme"
                        data-attr="email-domain-max-sender-name"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-secondary">
                    Address
                    <LemonInput
                        size="small"
                        value={state.senderLocalPart}
                        onChange={actions.setSenderLocalPart}
                        placeholder="hello"
                        suffix={<span className="text-secondary">@{derived.sendingDomain}</span>}
                        data-attr="email-domain-max-sender-local-part"
                    />
                </label>
            </div>
            <div className="rounded-lg bg-fill-primary border px-3 py-2 text-sm break-words">
                <span className="text-xs text-secondary block">Shows in the inbox as</span>
                <span className="font-medium">{state.senderName || 'Your name'}</span>{' '}
                <span className="text-secondary">&lt;{derived.fromAddress}&gt;</span>
            </div>
        </div>
    )
}
