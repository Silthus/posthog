// PROTOTYPE ONLY: the step from the sandbox sender to a verified domain, shared by every variant.
import { IconCheckCircle, IconHourglass, IconLetter } from '@posthog/icons'
import { LemonButton, LemonTag } from '@posthog/lemon-ui'

import { SIGNED_IN_USER, TEAM_DOMAIN, useBackend } from '../prototypeBackend'
import { PlugInSlot } from './PlugInSlot'

const DNS_RECORDS = [
    ['TXT', `_posthog.${TEAM_DOMAIN}`, 'posthog-verification=…'],
    ['CNAME', `ph1._domainkey.${TEAM_DOMAIN}`, 'ph1.dkim.sandbox.example'],
    ['MX', `mail.${TEAM_DOMAIN}`, '10 feedback.sandbox.example'],
]

function DomainWizardSlot(): JSX.Element {
    return (
        <PlugInSlot name="Email domain wizard" does="connects DNS automatically or lists the records to add">
            <div className="flex gap-2">
                <LemonButton type="primary" size="small">
                    Connect automatically
                </LemonButton>
                <LemonButton type="secondary" size="small">
                    Add records by hand
                </LemonButton>
            </div>
            <table className="text-xs w-full">
                <tbody>
                    {DNS_RECORDS.map(([kind, host, value]) => (
                        <tr key={host} className="border-t border-primary">
                            <td className="py-1 pr-3 font-mono">{kind}</td>
                            <td className="py-1 pr-3 font-mono">{host}</td>
                            <td className="py-1 font-mono text-secondary">{value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </PlugInSlot>
    )
}

export function SenderStep({ compact = false }: { compact?: boolean }): JSX.Element {
    const { sender, addDomain } = useBackend()

    if (sender === 'sandbox') {
        return (
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <IconLetter className="text-lg" />
                    <LemonTag type="completion">Sandbox sender</LemonTag>
                    <span className="text-sm">Delivers to you only ({SIGNED_IN_USER.email}). Nothing to set up.</span>
                </div>
                {!compact && (
                    <p className="text-sm text-secondary mb-0">
                        To reach your users, send from your own domain. Verification can take up to 48 hours, and you
                        can keep working while it runs.
                    </p>
                )}
                <div>
                    <LemonButton type="secondary" size="small" onClick={addDomain}>
                        Add {TEAM_DOMAIN}
                    </LemonButton>
                </div>
            </div>
        )
    }

    if (sender === 'domain-pending') {
        return (
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <IconHourglass className="text-lg text-warning" />
                    <LemonTag type="warning">Verifying {TEAM_DOMAIN}</LemonTag>
                    <span className="text-sm">
                        Until DNS resolves, your messages still go only to you. We email you when it is done.
                    </span>
                </div>
                {!compact && <DomainWizardSlot />}
            </div>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <IconCheckCircle className="text-lg text-success" />
            <LemonTag type="success">hello@{TEAM_DOMAIN} verified</LemonTag>
            <span className="text-sm">Messages now go to real recipients.</span>
        </div>
    )
}
