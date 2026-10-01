// PROTOTYPE (throwaway): Focus phase 1, which domain the emails come from.
import clsx from 'clsx'
import { useState } from 'react'

import { IconArrowRight, IconCheck } from '@posthog/icons'
import { LemonButton, LemonInput, LemonSegmentedButton, LemonTag } from '@posthog/lemon-ui'

import { HedgehogMailbox } from '../shared/hoggies'
import { DomainProblem, INFERRED_DOMAINS, SEND_PREFIX_OPTIONS, SetupSimulation } from '../simulation'
import { BigAction, QuestionHeading } from './pieces'

const CUSTOM_PREFIX = '__custom__'

const PROBLEM_COPY: Record<Exclude<DomainProblem, null>, string> = {
    free_mailbox: 'That is a free mailbox provider. Use a domain you own, like yourcompany.com.',
    taken_by_other_org:
        'Another PostHog organization already sends from this domain. Ask them to share it, or pick another.',
    invalid: 'That does not look like a domain. Try something like yourcompany.com.',
}

function DomainCard({
    domain,
    reasons,
    recommended,
    selected,
    onSelect,
}: {
    domain: string
    reasons: string[]
    recommended: boolean
    selected: boolean
    onSelect: () => void
}): JSX.Element {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={clsx(
                'w-full text-left rounded-lg border-2 p-4 flex items-start gap-3 transition-colors motion-reduce:transition-none cursor-pointer',
                selected
                    ? 'border-accent bg-accent-highlight-secondary'
                    : 'border-primary bg-surface-primary hover:border-accent/60'
            )}
        >
            <span className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-lg @md:text-xl font-semibold break-all">{domain}</span>
                    {recommended && <LemonTag type="highlight">Recommended</LemonTag>}
                </span>
                {reasons.map((reason) => (
                    <span key={reason} className="text-xs text-secondary">
                        {reason}
                    </span>
                ))}
            </span>
            <span
                className={clsx(
                    'shrink-0 w-6 h-6 rounded-full border-2 inline-flex items-center justify-center',
                    selected ? 'bg-accent border-accent text-white' : 'border-primary'
                )}
            >
                {selected && <IconCheck />}
            </span>
        </button>
    )
}

function AnotherDomain({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const problem = derived.customDomainProblem
    const canUse = Boolean(derived.customDomainNormalized) && !problem
    const use = (): void => {
        if (canUse) {
            actions.chooseDomain(derived.customDomainNormalized)
        }
    }
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary" htmlFor="focus-another-domain">
                Another domain
            </label>
            <div className="flex gap-2">
                <LemonInput
                    id="focus-another-domain"
                    className="flex-1 font-mono"
                    placeholder="yourcompany.com"
                    value={state.customDomainInput}
                    onChange={actions.setCustomDomainInput}
                    onPressEnter={use}
                    status={problem ? 'danger' : undefined}
                />
                <LemonButton
                    type="secondary"
                    onClick={use}
                    disabledReason={canUse ? undefined : 'Type a domain you own'}
                    icon={<IconArrowRight />}
                >
                    Use
                </LemonButton>
            </div>
            {problem && <span className="text-xs text-danger">{PROBLEM_COPY[problem]}</span>}
        </div>
    )
}

function Outcome({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const [customOpen, setCustomOpen] = useState(false)
    const preset = SEND_PREFIX_OPTIONS.find((option) => option.prefix === state.sendPrefix)
    const custom = customOpen || !preset
    const segmentValue = custom ? CUSTOM_PREFIX : state.sendPrefix
    const why = custom ? 'Any name works, as long as nothing else uses it yet.' : preset!.why
    return (
        <section className="rounded-lg border bg-gradient-to-br from-accent-highlight-secondary to-surface-primary p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <span className="text-sm text-secondary">Emails will come from</span>
                <span className="font-mono text-xl @md:text-2xl font-semibold break-all">{derived.fromAddress}</span>
            </div>
            <div className="flex flex-col gap-2">
                <span className="text-sm">Sending subdomain</span>
                <LemonSegmentedButton
                    size="small"
                    value={segmentValue}
                    onChange={(value) => {
                        if (value === CUSTOM_PREFIX) {
                            setCustomOpen(true)
                            actions.setSendPrefix('news')
                        } else {
                            setCustomOpen(false)
                            actions.setSendPrefix(value)
                        }
                    }}
                    options={[
                        ...SEND_PREFIX_OPTIONS.map((option) => ({ value: option.prefix, label: option.label })),
                        { value: CUSTOM_PREFIX, label: 'Custom' },
                    ]}
                />
                {custom && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <LemonInput
                            id="focus-send-prefix"
                            className="w-40 font-mono"
                            value={state.sendPrefix}
                            onChange={(value) => actions.setSendPrefix(value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                            placeholder="news"
                            autoFocus
                        />
                        <span className="font-mono text-secondary break-all">.{state.rootDomain}</span>
                    </div>
                )}
                <span className="text-sm text-secondary">{why}</span>
            </div>
            {advancedOpen ? (
                <div className="flex flex-col gap-1.5 text-sm">
                    <label htmlFor="focus-bounce-prefix">Bounce subdomain</label>
                    <div className="flex items-center gap-2 flex-wrap">
                        <LemonInput
                            id="focus-bounce-prefix"
                            className="w-40 font-mono"
                            value={state.bouncePrefix}
                            onChange={actions.setBouncePrefix}
                            placeholder="feedback"
                        />
                        <span className="font-mono text-secondary break-all">.{derived.sendingDomain}</span>
                    </div>
                    <span className="text-xs text-secondary">
                        Where bounced emails return to. Almost nobody changes this.
                    </span>
                </div>
            ) : (
                <button
                    type="button"
                    className="self-start text-xs text-secondary underline cursor-pointer"
                    onClick={() => setAdvancedOpen(true)}
                >
                    Advanced
                </button>
            )}
        </section>
    )
}

export function DomainQuestion({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, actions } = sim
    const inferred = INFERRED_DOMAINS.some((candidate) => candidate.domain === state.rootDomain)
    return (
        <div className="flex flex-col gap-8">
            <QuestionHeading
                Hoggie={HedgehogMailbox}
                title="Which domain should your emails come from?"
                lead="We looked at your project and found these. Pick one or type your own."
            />
            <div className="flex flex-col gap-3">
                {INFERRED_DOMAINS.map((candidate) => (
                    <DomainCard
                        key={candidate.domain}
                        {...candidate}
                        selected={state.rootDomain === candidate.domain}
                        onSelect={() => actions.chooseDomain(candidate.domain)}
                    />
                ))}
                {state.rootDomain && !inferred && (
                    <DomainCard
                        domain={state.rootDomain}
                        reasons={['You typed this one']}
                        recommended={false}
                        selected
                        onSelect={actions.clearDomain}
                    />
                )}
            </div>
            {state.rootDomain ? (
                <>
                    <Outcome sim={sim} />
                    <div className="flex flex-col items-center gap-2">
                        <BigAction onClick={actions.continueToRecords} sideIcon={<IconArrowRight />}>
                            Continue
                        </BigAction>
                        <LemonButton type="tertiary" size="small" onClick={actions.clearDomain}>
                            Another domain
                        </LemonButton>
                    </div>
                </>
            ) : (
                <AnotherDomain sim={sim} />
            )}
        </div>
    )
}
