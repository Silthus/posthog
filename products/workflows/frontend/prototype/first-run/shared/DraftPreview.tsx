// PROTOTYPE ONLY (silthus/posthog#212). The email draft as the team's users will get it.
import { useValues } from 'kea'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { SHARED_SENDER, SIGNED_IN_USER } from '../firstRunScenario'
import { EmailDraft, emailHtml } from '../starterEmails'

export function DraftPreview({
    draft,
    heightClass = 'h-[26rem]',
    showHeader = true,
}: {
    draft: EmailDraft
    heightClass?: string
    showHeader?: boolean
}): JSX.Element {
    const { brandStatus, brandApplied } = useValues(firstRunPrototypeLogic)
    return (
        <div className="flex flex-col rounded border border-primary overflow-hidden bg-surface-primary">
            {showHeader && (
                <div className="px-3 py-2 border-b border-primary text-xs grid grid-cols-[4rem_1fr] gap-y-1 bg-surface-secondary">
                    <span className="text-secondary">From</span>
                    <span>{SHARED_SENDER.label}</span>
                    <span className="text-secondary">Subject</span>
                    <span className="font-semibold">{draft.subject}</span>
                </div>
            )}
            <iframe
                title="Email preview"
                className={`w-full ${heightClass} border-0 bg-white`}
                sandbox=""
                srcDoc={emailHtml({
                    draft,
                    branded: brandStatus === 'found' && brandApplied,
                    recipientName: SIGNED_IN_USER.name,
                })}
            />
        </div>
    )
}
