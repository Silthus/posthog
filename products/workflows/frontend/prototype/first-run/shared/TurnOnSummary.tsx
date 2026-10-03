// PROTOTYPE ONLY (silthus/posthog#212). What turning the email on means, on the shared PostHog sender.
import { useActions, useValues } from 'kea'

import { LemonButton } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { SHARED_SENDER, SIGNED_IN_USER } from '../firstRunScenario'

export function TurnOnSummary(): JSX.Element | null {
    const { starter, facts } = useValues(firstRunPrototypeLogic)
    const { turnOn, openInEditor } = useActions(firstRunPrototypeLogic)
    if (!starter) {
        return null
    }
    const reachable = facts.people
        ? `${facts.peopleWithEmail.toLocaleString()} of your people have an email`
        : 'Nobody yet'

    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold mb-0">Ready to go</h3>
            <div className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                <span className="text-secondary">From</span>
                <span>
                    {SHARED_SENDER.label}
                    <span className="block text-xs text-secondary">
                        A shared PostHog address with your name on it. Replies go to {SIGNED_IN_USER.email}.
                    </span>
                </span>
                <span className="text-secondary">When</span>
                <span>{starter.triggerLabel}</span>
                <span className="text-secondary">Who</span>
                <span>{reachable}</span>
            </div>
            <span className="text-xs text-secondary">
                Shared sending has a lower daily limit. Add your own domain whenever you like, and switch over with one
                click.
            </span>
            <LemonButton type="primary" size="large" onClick={turnOn} center>
                Turn it on
            </LemonButton>
            <LemonButton type="secondary" onClick={openInEditor} center>
                Open in the full editor first
            </LemonButton>
        </div>
    )
}
