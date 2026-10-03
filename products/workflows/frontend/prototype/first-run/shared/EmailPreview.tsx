// PROTOTYPE ONLY (silthus/posthog#212). The welcome email as the team will send it, branded once detected.
import { useValues } from 'kea'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { SHARED_SENDER, SIGNED_IN_USER } from '../firstRunScenario'
import { WELCOME_SUBJECT, welcomeEmailHtml } from '../welcomeWorkflow'

export function EmailPreview({ heightClass = 'h-[26rem]' }: { heightClass?: string }): JSX.Element {
    const { brandStatus } = useValues(firstRunPrototypeLogic)
    return (
        <div className="flex flex-col rounded border border-primary overflow-hidden">
            <div className="px-3 py-2 border-b border-primary text-xs grid grid-cols-[4rem_1fr] gap-y-1 bg-surface-secondary">
                <span className="text-secondary">From</span>
                <span>{SHARED_SENDER.label}</span>
                <span className="text-secondary">Subject</span>
                <span className="font-semibold">{WELCOME_SUBJECT}</span>
            </div>
            <iframe
                title="Welcome email preview"
                className={`w-full ${heightClass} border-0 bg-white`}
                sandbox=""
                srcDoc={welcomeEmailHtml({ branded: brandStatus === 'found', recipientName: SIGNED_IN_USER.name })}
            />
        </div>
    )
}
