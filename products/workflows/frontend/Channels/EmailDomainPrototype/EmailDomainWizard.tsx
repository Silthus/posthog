import clsx from 'clsx'
import { useMemo, useState } from 'react'

import { IconCheck } from '@posthog/icons'

import { buildSetupPrompt } from './buildSetupPrompt'
import { EmailDomainWizardDnsStep } from './EmailDomainWizardDnsStep'
import { DomainStepResult, EmailDomainWizardDomainStep } from './EmailDomainWizardDomainStep'
import { DnsHost, PROTOTYPE_PROJECT_ID, PROTOTYPE_SENDER_ID, buildRecords } from './prototypeData'
import { WizardTip, WizardTipsPanel } from './WizardTipsPanel'

export type WizardStep = 'domain' | 'dns'

export interface EmailDomainWizardProps {
    initialStep?: WizardStep
    initialDomainValue?: string
    initialResult?: DomainStepResult
    existingDomains?: string[]
    detectedHost: DnsHost | null
    showAgentMenu?: boolean
    onAutoConfigure?: (domain: string) => void
    onFinished?: (result: DomainStepResult) => void
}

const STEPS: { key: WizardStep | 'verify'; label: string }[] = [
    { key: 'domain', label: 'Domain' },
    { key: 'dns', label: 'DNS records' },
    { key: 'verify', label: 'Verified' },
]

function StepIndicator({ current }: { current: WizardStep }): JSX.Element {
    const currentIndex = STEPS.findIndex((step) => step.key === current)
    return (
        <ol className="m-0 p-0 list-none flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {STEPS.map((step, index) => {
                const done = index < currentIndex
                const active = index === currentIndex
                return (
                    <li key={step.key} className="flex items-center gap-2">
                        <span
                            className={clsx(
                                'flex items-center justify-center size-5 rounded-full text-xs border',
                                done && 'bg-success text-primary-inverse border-success',
                                active && 'bg-primary-highlight border-primary font-semibold',
                                !done && !active && 'text-muted border-primary'
                            )}
                        >
                            {done ? <IconCheck /> : index + 1}
                        </span>
                        <span className={clsx(!active && !done && 'text-muted', active && 'font-medium')}>
                            {step.label}
                        </span>
                        {index < STEPS.length - 1 && <span className="text-muted">/</span>}
                    </li>
                )
            })}
        </ol>
    )
}

export function EmailDomainWizard({
    initialStep = 'domain',
    initialDomainValue,
    initialResult,
    existingDomains,
    detectedHost,
    showAgentMenu = true,
    onAutoConfigure,
    onFinished,
}: EmailDomainWizardProps): JSX.Element {
    const [step, setStep] = useState<WizardStep>(initialStep)
    const [result, setResult] = useState<DomainStepResult | null>(initialResult ?? null)
    const [tip, setTip] = useState<WizardTip>(initialStep === 'dns' ? 'dns_timing' : 'subdomain')

    const domain = result?.domain ?? 'acme.com'
    const mailFrom = result?.mailFromSubdomain ?? 'feedback'
    const pageUrl = `https://us.posthog.com/project/${PROTOTYPE_PROJECT_ID}/workflows/channels/email/${PROTOTYPE_SENDER_ID}`
    const records = useMemo(() => buildRecords(domain, mailFrom, 'pending'), [domain, mailFrom])
    const setupPrompt = useMemo(
        () =>
            buildSetupPrompt({
                domain,
                mailFromSubdomain: mailFrom,
                projectId: PROTOTYPE_PROJECT_ID,
                senderId: PROTOTYPE_SENDER_ID,
                dnsHost: detectedHost,
                records,
            }),
        [domain, mailFrom, detectedHost, records]
    )

    return (
        <div className="flex flex-col gap-6 @container">
            <header className="flex flex-col gap-2">
                <h1 className="m-0 text-xl font-semibold">Set up an email domain</h1>
                <StepIndicator current={step} />
            </header>
            <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_18rem] items-start">
                <main className="min-w-0">
                    {step === 'domain' ? (
                        <EmailDomainWizardDomainStep
                            initialValue={initialDomainValue}
                            existingDomains={existingDomains}
                            onTipChange={setTip}
                            onContinue={(nextResult) => {
                                setResult(nextResult)
                                setTip('dns_timing')
                                setStep('dns')
                            }}
                        />
                    ) : (
                        <EmailDomainWizardDnsStep
                            domain={domain}
                            dnsHost={detectedHost}
                            records={records}
                            setupPrompt={setupPrompt}
                            pageUrl={pageUrl}
                            showAgentMenu={showAgentMenu}
                            onAutoConfigure={() => onAutoConfigure?.(domain)}
                            onContinue={() => result && onFinished?.(result)}
                        />
                    )}
                </main>
                <WizardTipsPanel tip={tip} domain={domain === 'acme.com' && !result ? '' : domain} pageUrl={pageUrl} />
            </div>
        </div>
    )
}
