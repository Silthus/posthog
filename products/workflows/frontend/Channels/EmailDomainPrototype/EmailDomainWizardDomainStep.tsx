import { useMemo, useState } from 'react'

import { IconArrowRight, IconChevronDown, IconChevronRight } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonInput, LemonLabel, Link } from '@posthog/lemon-ui'

import {
    FREE_MAILBOX_DOMAINS,
    TAKEN_BY_OTHER_ORG,
    isRootDomain,
    nameFromDomain,
    normalizeDomainInput,
} from './prototypeData'
import { WizardTip } from './WizardTipsPanel'

export interface DomainStepResult {
    domain: string
    localPart: string
    senderName: string
    mailFromSubdomain: string
}

export interface EmailDomainWizardDomainStepProps {
    initialValue?: string
    existingDomains?: string[]
    onTipChange: (tip: WizardTip) => void
    onContinue: (result: DomainStepResult) => void
}

type DomainProblem = 'free_mailbox' | 'taken_by_other_org' | 'invalid' | null

const DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

const detectProblem = (domain: string): DomainProblem => {
    if (!domain) {
        return null
    }
    if (FREE_MAILBOX_DOMAINS.has(domain)) {
        return 'free_mailbox'
    }
    if (TAKEN_BY_OTHER_ORG.has(domain)) {
        return 'taken_by_other_org'
    }
    if (!DOMAIN_PATTERN.test(domain)) {
        return 'invalid'
    }
    return null
}

export function EmailDomainWizardDomainStep({
    initialValue = '',
    existingDomains = [],
    onTipChange,
    onContinue,
}: EmailDomainWizardDomainStepProps): JSX.Element {
    const [rawValue, setRawValue] = useState(initialValue)
    const [mailFromSubdomain, setMailFromSubdomain] = useState('feedback')
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const { domain, localPart } = useMemo(() => normalizeDomainInput(rawValue), [rawValue])
    const problem = detectProblem(domain)
    const existingDomain = existingDomains.includes(domain)
    const typedEmail = rawValue.includes('@')
    const showSubdomainNudge = Boolean(domain) && !problem && isRootDomain(domain)

    const submit = (): void => {
        if (!domain || problem) {
            return
        }
        setSubmitting(true)
        window.setTimeout(() => {
            setSubmitting(false)
            onContinue({
                domain,
                localPart: localPart ?? 'hello',
                senderName: nameFromDomain(domain),
                mailFromSubdomain: mailFromSubdomain || 'feedback',
            })
        }, 600)
    }

    const problemMessage: Record<Exclude<DomainProblem, null>, JSX.Element> = {
        free_mailbox: <>You can't send from {domain}. Use a domain your company owns, like acme.com.</>,
        taken_by_other_org: (
            <>
                {domain} is already set up in another PostHog organization. A domain can only send from one.{' '}
                <Link to="https://posthog.com/support" target="_blank">
                    Contact support
                </Link>{' '}
                if that's unexpected.
            </>
        ),
        invalid: <>Enter a domain like acme.com or mail.acme.com.</>,
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <h2 className="m-0 text-lg font-semibold">Which domain do you send from?</h2>
                <p className="m-0 text-sm text-secondary">
                    We create your first sender from it. You add the DNS records in the next step.
                </p>
            </div>

            <div className="flex flex-col gap-1.5">
                <LemonLabel htmlFor="email-domain-input">Domain</LemonLabel>
                <LemonInput
                    id="email-domain-input"
                    value={rawValue}
                    onChange={setRawValue}
                    onFocus={() => onTipChange('subdomain')}
                    onBlur={() => onTipChange('records')}
                    onPressEnter={submit}
                    placeholder="mail.acme.com"
                    status={problem ? 'danger' : 'default'}
                    autoFocus
                    fullWidth
                    data-attr="email-domain-input"
                />
                {problem ? (
                    <p className="m-0 text-sm text-danger">{problemMessage[problem]}</p>
                ) : typedEmail && domain ? (
                    <p className="m-0 text-sm text-secondary">
                        We'll use the domain {domain}. Your first sender will be {localPart ?? 'hello'}@{domain}.
                    </p>
                ) : domain && !existingDomain ? (
                    <p className="m-0 text-sm text-secondary">
                        Your first sender will be hello@{domain} from "{nameFromDomain(domain)}".
                    </p>
                ) : null}
                {showSubdomainNudge && !typedEmail && (
                    <p className="m-0 text-xs text-secondary">
                        Tip: a subdomain like mail.{domain} keeps workflow emails separate from your team's inbox.
                    </p>
                )}
            </div>

            {existingDomain && !problem && (
                <LemonBanner
                    type="info"
                    action={{
                        children: 'Open domain',
                        onClick: () => undefined,
                        'data-attr': 'email-domain-open-existing',
                    }}
                >
                    {domain} is already set up in this project. Open it to add a sender.
                </LemonBanner>
            )}

            <div className="flex flex-col gap-2">
                <LemonButton
                    size="small"
                    icon={advancedOpen ? <IconChevronDown /> : <IconChevronRight />}
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    className="self-start"
                    data-attr="email-domain-toggle-advanced"
                >
                    Advanced
                </LemonButton>
                {advancedOpen && (
                    <div className="flex flex-col gap-1.5 pl-2 border-l ml-2">
                        <LemonLabel
                            htmlFor="email-mail-from-input"
                            info="Bounces and the hidden sender address use this subdomain. Changing it later means new DNS records."
                        >
                            Bounce subdomain
                        </LemonLabel>
                        <LemonInput
                            id="email-mail-from-input"
                            value={mailFromSubdomain}
                            onChange={setMailFromSubdomain}
                            onFocus={() => onTipChange('mail_from')}
                            onBlur={() => onTipChange('records')}
                            suffix={<span className="text-secondary">.{domain || 'acme.com'}</span>}
                            className="w-fit"
                            data-attr="email-domain-mail-from-input"
                        />
                    </div>
                )}
            </div>

            <div className="flex justify-end">
                <LemonButton
                    type="primary"
                    sideIcon={<IconArrowRight />}
                    loading={submitting}
                    disabledReason={
                        !domain
                            ? 'Enter your domain first'
                            : problem
                              ? 'Fix the domain first'
                              : existingDomain
                                ? 'Open the existing domain instead'
                                : undefined
                    }
                    onClick={submit}
                    data-attr="email-domain-continue"
                >
                    Continue
                </LemonButton>
            </div>
        </div>
    )
}
