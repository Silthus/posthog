// PROTOTYPE ONLY (silthus/posthog#212). Send the example to yourself, then open it or skip to the workflow.
import { useActions, useValues } from 'kea'

import { LemonBanner, LemonButton } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { SIGNED_IN_USER } from '../firstRunScenario'

export function SendExampleActions({ sendLabel = 'Send me an example' }: { sendLabel?: string }): JSX.Element {
    const { exampleSent } = useValues(firstRunPrototypeLogic)
    const { sendExample, openInbox, openWelcomeWorkflow } = useActions(firstRunPrototypeLogic)

    if (exampleSent) {
        return (
            <div className="flex flex-col gap-2">
                <LemonBanner type="success">
                    Sent to {SIGNED_IN_USER.email}. Open it and use the link at the bottom to set it up.
                </LemonBanner>
                <LemonButton type="primary" onClick={openInbox} center>
                    Open my inbox (simulated)
                </LemonButton>
                <LemonButton type="secondary" onClick={openWelcomeWorkflow} center>
                    Set it up without checking
                </LemonButton>
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-2">
            <LemonButton type="primary" size="large" onClick={sendExample} center>
                {sendLabel}
            </LemonButton>
            <span className="text-xs text-secondary">
                Only you get it, at {SIGNED_IN_USER.email}. Nothing goes to your users.
            </span>
        </div>
    )
}
