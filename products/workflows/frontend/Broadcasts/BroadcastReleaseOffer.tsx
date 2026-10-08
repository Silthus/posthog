import { useActions, useValues } from 'kea'
import { useEffect } from 'react'

import { LemonBanner, LemonButton } from '@posthog/lemon-ui'

import { workflowDistributionLogic } from '../Workflows/workflowDistributionLogic'

export function BroadcastReleaseOffer({ experimentId }: { experimentId: number | null }): JSX.Element | null {
    const { offers } = useValues(workflowDistributionLogic)
    const { open, dismiss, offerShown } = useActions(workflowDistributionLogic)
    const offer = Object.values(offers).find((item) => item.releaseSeed?.experimentId === experimentId)
    useEffect(() => {
        if (offer) {
            offerShown(offer.contextKey)
        }
    }, [offer?.contextKey, offerShown])

    if (!offer) {
        return null
    }

    return (
        <LemonBanner type="info" className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
                <span>Prepare an announcement for this release. Choose recipients and review it before sending.</span>
                <LemonButton
                    type="secondary"
                    size="small"
                    onClick={() => open(offer.contextKey)}
                    data-attr="release-announcement-prepare"
                >
                    Prepare release announcement
                </LemonButton>
                <LemonButton
                    size="small"
                    onClick={() => dismiss(offer.contextKey)}
                    data-attr="release-announcement-dismiss"
                >
                    Dismiss
                </LemonButton>
            </div>
        </LemonBanner>
    )
}
