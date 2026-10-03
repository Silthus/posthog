import { useActions, useValues } from 'kea'
import { useEffect, useState } from 'react'

// PROTOTYPE ONLY (silthus/posthog#212). Variant C: no pitch, no data, one button. The email arriving in
// your inbox is the pitch, and everything else waits until after it.
import * as workflowsPng from '@posthog/brand/hoggies/png/workflows'
import { LemonButton, Spinner } from '@posthog/lemon-ui'

import { pngHoggie } from 'lib/brand/hoggies'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { SIGNED_IN_USER, TEAM_BRAND } from '../firstRunScenario'
import { DeliveredEmail } from '../shared/DeliveredEmail'
import { OtherStarts } from '../shared/OtherStarts'

const HedgehogWorkflows = pngHoggie(workflowsPng)

export function HomeOneButton(): JSX.Element {
    const { exampleSent, facts } = useValues(firstRunPrototypeLogic)
    const { sendExample } = useActions(firstRunPrototypeLogic)
    const [arrived, setArrived] = useState(false)

    useEffect(() => {
        if (!exampleSent) {
            setArrived(false)
            return
        }
        const timer = window.setTimeout(() => setArrived(true), 1500)
        return () => window.clearTimeout(timer)
    }, [exampleSent])

    return (
        <div className="flex flex-col items-center gap-6 py-10 mx-auto max-w-[44rem] text-center">
            {!exampleSent ? (
                <>
                    <HedgehogWorkflows className="w-40" />
                    <h2 className="text-3xl font-semibold mb-0">See what your new users could get from you</h2>
                    <p className="text-secondary mb-0">
                        We write a welcome email from {TEAM_BRAND.name} in your colors and send it to you.
                    </p>
                    <LemonButton type="primary" size="large" onClick={sendExample}>
                        Email it to me
                    </LemonButton>
                    <span className="text-xs text-secondary">Only to {SIGNED_IN_USER.email}.</span>
                </>
            ) : !arrived ? (
                <div className="flex flex-col items-center gap-3 py-20">
                    <Spinner className="text-3xl" />
                    <span className="text-secondary">On its way to {SIGNED_IN_USER.email}</span>
                </div>
            ) : (
                <div className="w-full flex flex-col gap-4 text-left">
                    <h2 className="text-2xl font-semibold mb-0 text-center">It just landed in your inbox</h2>
                    {facts.signupsThisMonth > 0 && (
                        <p className="text-secondary mb-0 text-center">
                            {facts.signupsThisMonth.toLocaleString()} people signed up this month. Each of them could
                            have got this.
                        </p>
                    )}
                    <div className="rounded border border-primary bg-surface-primary p-4">
                        <DeliveredEmail />
                    </div>
                </div>
            )}
            <OtherStarts />
        </div>
    )
}
