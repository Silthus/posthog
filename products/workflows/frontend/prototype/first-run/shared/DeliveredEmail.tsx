// PROTOTYPE ONLY (silthus/posthog#212). The example email as it lands in the team's inbox, with the link
// back into Workflows that opens the welcome workflow.
import { useActions } from 'kea'

import { LemonButton } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { SHARED_SENDER, SIGNED_IN_USER, TEAM_BRAND } from '../firstRunScenario'
import { WELCOME_SUBJECT, welcomeEmailHtml } from '../welcomeWorkflow'

export function DeliveredEmail({ heightClass = 'h-[24rem]' }: { heightClass?: string }): JSX.Element {
    const { openWelcomeWorkflow } = useActions(firstRunPrototypeLogic)
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <div className="size-9 shrink-0 rounded-full flex items-center justify-center text-white font-semibold bg-[#6d28d9]">
                    {TEAM_BRAND.name[0]}
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="font-semibold truncate">{WELCOME_SUBJECT}</span>
                    <span className="text-xs text-secondary truncate">
                        {SHARED_SENDER.label} to {SIGNED_IN_USER.email}, just now
                    </span>
                </div>
            </div>
            <iframe
                title="Delivered welcome email"
                className={`w-full ${heightClass} border-0 rounded bg-white`}
                sandbox=""
                srcDoc={welcomeEmailHtml({ branded: true, recipientName: SIGNED_IN_USER.name })}
            />
            <div className="rounded border border-dashed border-primary p-3 flex flex-col gap-2 text-sm">
                <span className="text-secondary">This is an example from PostHog Workflows. Only you received it.</span>
                <div>
                    <LemonButton type="primary" size="small" onClick={openWelcomeWorkflow}>
                        Send this to everyone who signs up
                    </LemonButton>
                </div>
            </div>
        </div>
    )
}
