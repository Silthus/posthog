import { useActions, useValues } from 'kea'

import { IconArrowRight } from '@posthog/icons'
import { LemonButton, LemonInput, LemonLabel } from '@posthog/lemon-ui'

import { DomainProblem } from '../domainInput'
import { EmailDomainWizardLogicProps, emailDomainWizardLogic } from '../emailDomainWizardLogic'

const PROBLEM_COPY: Record<DomainProblem, string> = {
    free_mailbox: 'That is a free mailbox provider. Use a domain you own, like yourcompany.com.',
    invalid: 'That does not look like a domain. Try something like yourcompany.com.',
}

export function AnotherDomainInput(props: EmailDomainWizardLogicProps): JSX.Element {
    const logic = emailDomainWizardLogic(props)
    const { customDomainInput, customDomain, customDomainHint } = useValues(logic)
    const { setCustomDomainInput, useCustomDomain } = useActions(logic)
    const canUse = Boolean(customDomain.domain) && !customDomain.problem
    return (
        <div className="flex flex-col gap-1.5">
            <LemonLabel htmlFor="email-domain-another-domain">Another domain</LemonLabel>
            <div className="flex gap-2">
                <LemonInput
                    id="email-domain-another-domain"
                    className="flex-1 font-mono"
                    placeholder="yourcompany.com"
                    value={customDomainInput}
                    onChange={setCustomDomainInput}
                    onPressEnter={useCustomDomain}
                    status={customDomainHint ? 'danger' : undefined}
                />
                <LemonButton
                    type="secondary"
                    onClick={useCustomDomain}
                    disabledReason={canUse ? undefined : 'Type a domain you own'}
                    icon={<IconArrowRight />}
                    data-attr="email-domain-use-custom-domain"
                >
                    Use
                </LemonButton>
            </div>
            {customDomainHint && <span className="text-xs text-danger">{PROBLEM_COPY[customDomainHint]}</span>}
        </div>
    )
}
