import { IconCopy, IconLightBulb } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { copyToClipboard } from 'lib/utils/copyToClipboard'

export type WizardTip = 'subdomain' | 'records' | 'mail_from' | 'dns_timing'

export interface WizardTipsPanelProps {
    tip: WizardTip
    domain: string
    pageUrl: string
}

const exampleSubdomain = (domain: string): string => {
    const base = domain || 'acme.com'
    return base.split('.').length > 2 ? base : `mail.${base}`
}

export function WizardTipsPanel({ tip, domain, pageUrl }: WizardTipsPanelProps): JSX.Element {
    return (
        <aside className="rounded border bg-fill-primary p-4 flex flex-col gap-3 text-sm" aria-live="polite">
            <div className="flex items-center gap-1.5 text-secondary text-xs font-semibold uppercase tracking-wide">
                <IconLightBulb />
                Tip
            </div>
            {tip === 'subdomain' && (
                <>
                    <p className="m-0 font-medium">Consider a subdomain like {exampleSubdomain(domain)}</p>
                    <p className="m-0 text-secondary">
                        Emails from workflows build their own reputation. A subdomain keeps that separate from your
                        team's everyday email, and a DMARC policy on it can't affect anything else. Any domain you own
                        works.
                    </p>
                </>
            )}
            {tip === 'records' && (
                <>
                    <p className="m-0 font-medium">What the DNS records do</p>
                    <ul className="m-0 pl-4 text-secondary flex flex-col gap-1">
                        <li>One record proves you own the domain.</li>
                        <li>Three records let us sign your emails, so inboxes know they are really from you.</li>
                        <li>Two records route bounces back through your domain instead of Amazon's.</li>
                        <li>One record tells inboxes what to do with emails that pretend to be you.</li>
                    </ul>
                </>
            )}
            {tip === 'mail_from' && (
                <>
                    <p className="m-0 font-medium">The bounce address</p>
                    <p className="m-0 text-secondary">
                        Bounces and the hidden sender address go through this subdomain. Pick something neutral, like
                        feedback or send. Some inboxes show it to recipients, so avoid words like testing.
                    </p>
                </>
            )}
            {tip === 'dns_timing' && (
                <>
                    <p className="m-0 font-medium">DNS can take a while</p>
                    <p className="m-0 text-secondary">
                        Changes usually show up within minutes, but some hosts take up to 72 hours. You can close this
                        page. We keep checking and show the result here.
                    </p>
                    <p className="m-0 text-secondary">Don't manage DNS yourself? Send this page to a teammate.</p>
                    <LemonButton
                        type="secondary"
                        size="small"
                        icon={<IconCopy />}
                        className="self-start"
                        onClick={() => void copyToClipboard(pageUrl, 'page link')}
                        data-attr="email-domain-copy-page-link"
                    >
                        Copy page link
                    </LemonButton>
                </>
            )}
        </aside>
    )
}
