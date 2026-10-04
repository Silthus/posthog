// PROTOTYPE ONLY (silthus/posthog#212). The test email as it lands in the team's inbox, exported from the
// editor at the moment the test was sent.
import { useValues } from 'kea'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { SHARED_SENDER, SIGNED_IN_USER, TEAM_BRAND } from '../firstRunScenario'

export function DeliveredEmail(): JSX.Element | null {
    const { testHtml, email } = useValues(firstRunPrototypeLogic)
    if (!testHtml || !email) {
        return null
    }
    return (
        <div className="flex flex-col gap-3 rounded border border-primary bg-surface-primary p-3">
            <div className="flex items-center gap-3">
                <div className="size-9 shrink-0 rounded-full flex items-center justify-center text-white font-semibold bg-[#6d28d9]">
                    {TEAM_BRAND.name[0]}
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="font-semibold truncate">{email.subject}</span>
                    <span className="text-xs text-secondary truncate">
                        {SHARED_SENDER.label} to {SIGNED_IN_USER.email}, just now
                    </span>
                </div>
            </div>
            <iframe
                title="Delivered test email"
                className="w-full h-[calc(100vh-18rem)] border-0 rounded bg-white"
                sandbox=""
                srcDoc={testHtml}
            />
        </div>
    )
}
