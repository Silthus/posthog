import { MOCK_DEFAULT_TEAM } from 'lib/api.mock'

import { Meta, StoryObj } from '@storybook/react'
import { useValues } from 'kea'
import { useEffect } from 'react'

import { workflowDistributionLogic } from '../Workflows/workflowDistributionLogic'
import { BroadcastReleaseOffer } from './BroadcastReleaseOffer'

function OfferStory(): JSX.Element {
    useValues(workflowDistributionLogic)
    useEffect(() => {
        workflowDistributionLogic.actions.setOffer({
            contextKey: 'release-offer-story',
            projectUuid: MOCK_DEFAULT_TEAM.uuid,
            placementId: 'release-announcement',
            arm: 'offer',
            eligibleAt: Date.now(),
            releaseSeed: {
                projectUuid: MOCK_DEFAULT_TEAM.uuid,
                experimentId: 42,
                experimentName: 'Compact navigation',
                flagId: 8,
                flagKey: 'compact-navigation',
                variantKey: 'compact',
                releaseToEveryone: false,
            },
        })
    }, [])
    return (
        <div className="w-130 max-w-full">
            <BroadcastReleaseOffer experimentId={42} />
        </div>
    )
}

const meta: Meta<typeof BroadcastReleaseOffer> = {
    title: 'Workflows/Broadcasts/Release offer',
    component: BroadcastReleaseOffer,
    render: () => <OfferStory />,
    parameters: { mockDate: '2026-10-08T10:00:00Z' },
}
export default meta
type Story = StoryObj<typeof BroadcastReleaseOffer>
export const Offer: Story = {}
