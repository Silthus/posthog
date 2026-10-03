// PROTOTYPE ONLY (silthus/posthog#212). Stands in for the team's real inbox.
import { useActions, useValues } from 'kea'

import { LemonModal } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { DeliveredEmail } from './shared/DeliveredEmail'

export function ExampleInboxModal(): JSX.Element {
    const { inboxOpen } = useValues(firstRunPrototypeLogic)
    const { closeInbox } = useActions(firstRunPrototypeLogic)

    return (
        <LemonModal isOpen={inboxOpen} onClose={closeInbox} title="Your inbox (simulated)" width={680}>
            <DeliveredEmail />
        </LemonModal>
    )
}
