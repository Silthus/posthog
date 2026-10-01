// PROTOTYPE (throwaway): the four section bodies of the Board variant.
import clsx from 'clsx'
import { useEffect, useState } from 'react'

import {
    IconArrowRight,
    IconCheck,
    IconExternal,
    IconInfo,
    IconRefresh,
    IconSparkles,
    IconWarning,
} from '@posthog/icons'
import {
    LemonBanner,
    LemonButton,
    LemonInput,
    LemonSegmentedButton,
    LemonTag,
    Spinner,
    lemonToast,
} from '@posthog/lemon-ui'

import cloudflareLogo from 'lib/components/DomainConnect/assets/cloudflare.svg'
import { LemonProgress } from 'lib/lemon-ui/LemonProgress'

import { RECORD_KIND_LABEL } from '../../prototypeData'
import { HedgehogMagnifyingGlass, HedgehogPanic, HedgehogSuccess, HedgehogWizard } from '../shared/hoggies'
import { DomainProblem, INFERRED_DOMAINS, SEND_PREFIX_OPTIONS, SetupSimulation, SetupStep } from '../simulation'
import { RecordRows } from './RecordRows'

const PROBLEM_COPY: Record<Exclude<DomainProblem, null>, string> = {
    free_mailbox: 'That is a free mailbox provider. You need a domain you own.',
    taken_by_other_org: 'Another PostHog organization already sends from this domain.',
    invalid: 'That does not look like a domain. Try something like acme.com.',
}

function Radio({ checked }: { checked: boolean }): JSX.Element {
    return (
        <span
            className={clsx(
                'size-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                checked ? 'border-accent' : 'border-primary'
            )}
            aria-hidden
        >
            {checked && <span className="size-2 rounded-full bg-accent" />}
        </span>
    )
}

function DomainRow({
    domain,
    reasons,
    recommended,
    checked,
    onPick,
}: {
    domain: string
    reasons: string[]
    recommended: boolean
    checked: boolean
    onPick: () => void
}): JSX.Element {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={onPick}
            className={clsx(
                'flex items-start gap-3 w-full text-left rounded border p-3 transition-colors motion-reduce:transition-none',
                checked
                    ? 'border-accent bg-accent-highlight-secondary'
                    : 'bg-surface-primary hover:bg-surface-secondary'
            )}
            data-attr="email-domain-board-pick-domain"
        >
            <span className="pt-0.5">
                <Radio checked={checked} />
            </span>
            <span className="flex flex-col gap-0.5 min-w-0 grow">
                <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold break-all">{domain}</span>
                    {recommended && (
                        <LemonTag type="success" size="small">
                            Recommended
                        </LemonTag>
                    )}
                </span>
                {reasons.map((reason) => (
                    <span key={reason} className="text-xs text-secondary">
                        {reason}
                    </span>
                ))}
            </span>
        </button>
    )
}

function CustomDomainRow({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const inferred = INFERRED_DOMAINS.some((d) => d.domain === state.rootDomain)
    const checked = !!state.rootDomain && !inferred
    const canUse = !!derived.customDomainNormalized && !derived.customDomainProblem
    return (
        <div
            className={clsx(
                'flex flex-col gap-2 rounded border p-3',
                checked ? 'border-accent bg-accent-highlight-secondary' : 'bg-surface-primary'
            )}
        >
            <div className="flex items-center gap-3">
                <Radio checked={checked} />
                <span className="font-medium shrink-0">Another domain</span>
                <LemonInput
                    size="small"
                    className="grow"
                    placeholder="yourcompany.com"
                    value={state.customDomainInput}
                    onChange={actions.setCustomDomainInput}
                    onPressEnter={() => canUse && actions.chooseDomain(derived.customDomainNormalized)}
                    status={derived.customDomainProblem ? 'danger' : 'default'}
                    data-attr="email-domain-board-custom-domain"
                />
                <LemonButton
                    size="small"
                    type="secondary"
                    onClick={() => actions.chooseDomain(derived.customDomainNormalized)}
                    disabledReason={canUse ? undefined : 'Type a domain you own'}
                >
                    Use it
                </LemonButton>
            </div>
            {derived.customDomainProblem && (
                <span className="text-xs text-danger pl-7">{PROBLEM_COPY[derived.customDomainProblem]}</span>
            )}
        </div>
    )
}

function SubdomainChoice({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const current = SEND_PREFIX_OPTIONS.find((o) => o.prefix === state.sendPrefix) ?? SEND_PREFIX_OPTIONS[0]
    return (
        <div className="flex flex-col gap-3 rounded border bg-surface-secondary p-3">
            <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Send from a subdomain of {state.rootDomain}</span>
                <span className="text-xs text-secondary">
                    A subdomain keeps your main domain's reputation separate from your campaigns.
                </span>
            </div>
            <LemonSegmentedButton
                size="small"
                value={state.sendPrefix}
                onChange={actions.setSendPrefix}
                options={SEND_PREFIX_OPTIONS.map((o) => ({
                    value: o.prefix,
                    label: o.recommended ? `${o.label} (recommended)` : o.label,
                    tooltip: o.why,
                }))}
            />
            <p className="m-0 text-sm">
                Emails will come from <strong className="break-all">{derived.fromAddress}</strong>. {current.why}
            </p>
            <div className="flex flex-col gap-2">
                <LemonButton
                    size="xsmall"
                    type="tertiary"
                    className="self-start"
                    onClick={() => setAdvancedOpen((open) => !open)}
                >
                    {advancedOpen ? 'Hide advanced' : 'Advanced'}
                </LemonButton>
                {advancedOpen && (
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-secondary">Bounce subdomain</span>
                        <div className="flex items-center gap-2 flex-wrap">
                            <LemonInput
                                size="small"
                                className="w-36"
                                value={state.bouncePrefix}
                                onChange={actions.setBouncePrefix}
                                data-attr="email-domain-board-bounce-prefix"
                            />
                            <code className="text-xs text-secondary break-all">.{derived.sendingDomain}</code>
                        </div>
                        <span className="text-xs text-secondary">
                            Bounces come back through {derived.mailFromDomain}. Leave it unless your host already uses
                            this name.
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

export function DomainSection({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, actions } = sim
    return (
        <div className="flex flex-col gap-4">
            <p className="m-0 text-sm text-secondary">
                We looked at where your events come from. Pick the domain your emails should come from.
            </p>
            <div role="radiogroup" aria-label="Domain" className="flex flex-col gap-2">
                {INFERRED_DOMAINS.map((candidate) => (
                    <DomainRow
                        key={candidate.domain}
                        {...candidate}
                        checked={state.rootDomain === candidate.domain}
                        onPick={() => actions.chooseDomain(candidate.domain)}
                    />
                ))}
                <CustomDomainRow sim={sim} />
            </div>
            {state.rootDomain && <SubdomainChoice sim={sim} />}
            <LemonButton
                type="primary"
                className="self-end"
                sideIcon={<IconArrowRight />}
                onClick={actions.continueToRecords}
                disabledReason={state.rootDomain ? undefined : 'Pick a domain first'}
                data-attr="email-domain-board-continue"
            >
                Continue
            </LemonButton>
        </div>
    )
}

function HostBadge({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state } = sim
    if (!state.hostDetected) {
        return (
            <span className="flex items-center gap-2 text-sm text-secondary">
                <Spinner /> Looking up where {state.rootDomain}'s DNS lives…
            </span>
        )
    }
    if (!state.host) {
        return (
            <span className="text-sm text-secondary">
                We could not tell who hosts your DNS. Any DNS provider works.
            </span>
        )
    }
    return (
        <span className="flex items-center gap-2 text-sm">
            Your DNS lives at
            <span className="inline-flex items-center gap-1.5 rounded border bg-surface-primary px-2 py-0.5 font-semibold">
                {state.host.supportsDomainConnect ? <img src={cloudflareLogo} alt="" className="h-4" /> : null}
                {state.host.name}
            </span>
        </span>
    )
}

export function RecordsSection({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const host = state.host
    const cloudflare = !!host?.supportsDomainConnect
    const ready = state.hostDetected
    useEffect(() => {
        if (ready && !cloudflare && !state.recordsRevealed) {
            actions.revealRecords()
        }
    }, [ready, cloudflare, state.recordsRevealed, actions])
    const waiting = ready ? undefined : 'Still looking up your DNS host'

    return (
        <div className="flex flex-col gap-4">
            <HostBadge sim={sim} />
            {cloudflare && (
                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-accent bg-gradient-to-br from-accent-highlight-secondary to-surface-primary p-4">
                    <HedgehogWizard className="w-16 shrink-0" />
                    <div className="flex flex-col gap-1 min-w-0 grow">
                        <span className="font-semibold">Cloudflare can add all 7 for you</span>
                        <span className="text-sm text-secondary">
                            You approve once in Cloudflare. Nothing else on your domain changes.
                        </span>
                    </div>
                    <div className="flex flex-col gap-1 items-stretch @lg:items-end w-full @lg:w-auto">
                        <LemonButton
                            type="primary"
                            onClick={actions.openCloudflareApproval}
                            data-attr="email-domain-board-cloudflare"
                        >
                            Add all 7 to Cloudflare for me
                        </LemonButton>
                        {!state.recordsRevealed && (
                            <LemonButton
                                size="xsmall"
                                type="tertiary"
                                onClick={actions.revealRecords}
                                data-attr="email-domain-board-reveal"
                            >
                                I'll paste them in myself
                            </LemonButton>
                        )}
                    </div>
                </div>
            )}
            <RecordRows records={derived.records} checking={state.checking} />
            {host?.gotcha && (
                <p className="m-0 text-xs text-secondary flex items-start gap-1.5">
                    <IconInfo className="shrink-0 text-sm mt-0.5" />
                    <span>{host.gotcha}</span>
                </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
                {host && !cloudflare && (
                    <LemonButton
                        type="primary"
                        to={host.dnsSettingsUrl}
                        targetBlank
                        sideIcon={<IconExternal />}
                        disabledReason={waiting}
                    >
                        Open {host.name}
                    </LemonButton>
                )}
                <LemonButton
                    type={host && !cloudflare ? 'secondary' : cloudflare ? 'secondary' : 'primary'}
                    icon={<IconCheck />}
                    onClick={actions.markRecordsAdded}
                    disabledReason={waiting}
                    data-attr="email-domain-board-added"
                >
                    I've added them
                </LemonButton>
                <LemonButton
                    type="secondary"
                    icon={<IconSparkles />}
                    onClick={actions.openAgentModal}
                    disabledReason={waiting}
                    data-attr="email-domain-board-agent"
                >
                    Let an agent do it
                </LemonButton>
            </div>
        </div>
    )
}

function TimelineStep({ step, last }: { step: SetupStep; last: boolean }): JSX.Element {
    const icon =
        step.state === 'done' ? (
            <span className="size-6 rounded-full bg-success-highlight border border-success text-success flex items-center justify-center">
                <IconCheck />
            </span>
        ) : step.state === 'active' ? (
            <span className="size-6 rounded-full bg-accent-highlight-secondary border border-accent flex items-center justify-center">
                <Spinner className="text-sm" />
            </span>
        ) : step.state === 'stuck' ? (
            <span className="size-6 rounded-full bg-danger-highlight border border-danger text-danger flex items-center justify-center">
                <IconWarning />
            </span>
        ) : (
            <span className="size-6 rounded-full bg-fill-primary border" />
        )
    return (
        <li className="flex gap-3">
            <div className="flex flex-col items-center">
                {icon}
                {!last && (
                    <span
                        className={clsx('w-px grow my-1', step.state === 'done' ? 'bg-success' : 'bg-border-primary')}
                    />
                )}
            </div>
            <div className={clsx('flex flex-col pb-4 min-w-0', step.state === 'todo' && 'text-secondary')}>
                <span className="font-medium">{step.label}</span>
                <span className="text-sm text-secondary break-words">{step.detail}</span>
            </div>
        </li>
    )
}

export function VerificationSection({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const stuck = state.pollingStopped
    const Hoggie = stuck ? HedgehogPanic : HedgehogMagnifyingGlass
    const missingLabels = derived.missingRecords.map((r) => RECORD_KIND_LABEL[r.kind]).join(', ')
    return (
        <div className="flex flex-col gap-4 @xl:flex-row @xl:items-start @xl:gap-6">
            <ol className="m-0 p-0 list-none flex flex-col grow min-w-0">
                {derived.steps.map((step, index) => (
                    <TimelineStep key={step.key} step={step} last={index === derived.steps.length - 1} />
                ))}
            </ol>
            <div className="flex flex-col gap-3 @xl:w-72 shrink-0">
                <div className="flex items-center gap-3">
                    <Hoggie className="w-16 shrink-0" />
                    <div className="flex flex-col gap-1 grow min-w-0">
                        <span className="text-sm font-medium">
                            {derived.foundCount} of {derived.records.length} found
                        </span>
                        <LemonProgress percent={(derived.foundCount / Math.max(1, derived.records.length)) * 100} />
                        <span className="text-xs text-secondary">
                            {stuck ? 'Checking stopped.' : 'Checking every few seconds. You can come back later.'}
                        </span>
                    </div>
                </div>
                {stuck && (
                    <LemonBanner type="warning">
                        <span className="text-sm">
                            Still missing: {missingLabels}. Most hosts publish within minutes. Check again, or let an
                            agent fix it.
                        </span>
                    </LemonBanner>
                )}
                {stuck && (
                    <div className="flex flex-wrap gap-2">
                        <LemonButton
                            type="primary"
                            icon={<IconRefresh />}
                            onClick={actions.checkAgain}
                            loading={state.checking}
                            data-attr="email-domain-board-check-again"
                        >
                            Check again
                        </LemonButton>
                        <LemonButton type="secondary" icon={<IconSparkles />} onClick={actions.openAgentModal}>
                            Let an agent do it
                        </LemonButton>
                        {state.host && (
                            <LemonButton
                                type="secondary"
                                to={state.host.dnsSettingsUrl}
                                targetBlank
                                sideIcon={<IconExternal />}
                            >
                                Open {state.host.name}
                            </LemonButton>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export function SenderSection({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const sending = state.testEmailState === 'sending'
    const sent = state.testEmailState === 'sent'
    useEffect(() => {
        if (sent) {
            lemonToast.success(`Test email sent from ${derived.fromAddress}. Check your inbox.`)
        }
    }, [sent, derived.fromAddress])
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 rounded-lg border border-success bg-success-highlight p-4">
                <HedgehogSuccess className="w-20 shrink-0" />
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-semibold">Inboxes trust {derived.sendingDomain}</span>
                    <span className="text-sm text-secondary">
                        All 7 settings verified. Name your first sender and try it out.
                    </span>
                </div>
            </div>
            <div className="grid gap-3 @lg:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Sender name</span>
                    <LemonInput
                        value={state.senderName}
                        onChange={actions.setSenderName}
                        placeholder="Acme"
                        data-attr="email-domain-board-sender-name"
                    />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Email address</span>
                    <LemonInput
                        value={state.senderLocalPart}
                        onChange={actions.setSenderLocalPart}
                        placeholder="hello"
                        suffix={<span className="text-secondary whitespace-nowrap">@{derived.sendingDomain}</span>}
                        data-attr="email-domain-board-sender-local"
                    />
                </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-secondary break-all">
                    Recipients see <strong className="text-primary">{state.senderName || 'Your name'}</strong> &lt;
                    {derived.fromAddress}&gt;
                </span>
                <LemonButton
                    type={sent ? 'secondary' : 'primary'}
                    icon={sent ? <IconCheck /> : undefined}
                    onClick={actions.sendTestEmail}
                    loading={sending}
                    disabledReason={sending ? 'Sending…' : undefined}
                    data-attr="email-domain-board-test-email"
                >
                    {sent ? 'Send another test email' : 'Send me a test email'}
                </LemonButton>
            </div>
        </div>
    )
}
