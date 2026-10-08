import { MOCK_DEFAULT_TEAM } from 'lib/api.mock'

import '@testing-library/jest-dom'

import { act, fireEvent, render, screen } from '@testing-library/react'
import { BindLogic } from 'kea'
import { expectLogic } from 'kea-test-utils'
import posthog from 'posthog-js'

import { FEATURE_FLAGS } from 'lib/constants'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'
import { AccessControlLevel, AccessControlResourceType } from '~/types'

import { workflowDistributionLogic } from '../Workflows/workflowDistributionLogic'
import { BroadcastReleaseOffer } from './BroadcastReleaseOffer'
import { broadcastWizardLogic } from './broadcastWizardLogic'
import { newBroadcastAgentLogic } from './newBroadcastAgentLogic'
import { BroadcastRecipientsStep } from './steps/BroadcastRecipientsStep'
import { BroadcastScheduleStep } from './steps/BroadcastScheduleStep'

describe('release announcement recipient and timing choices', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        useMocks({
            get: {
                '/api/projects/:team_id/integrations/': { results: [] },
                '/api/projects/:team_id/hog_flows/message_categories/': [],
                '/api/projects/:team_id/cohorts/': { results: [], count: 0 },
            },
            post: { '/api/projects/:team_id/hog_flows/user_blast_radius/': { affected: 3, total: 3 } },
        })
        initKeaTests()
        window.POSTHOG_APP_CONTEXT!.resource_access_control = Object.fromEntries(
            Object.values(AccessControlResourceType).map((resource) => [resource, AccessControlLevel.Editor])
        ) as Record<AccessControlResourceType, AccessControlLevel>
        Object.defineProperty(posthog, 'getGroups', {
            value: jest.fn(() => ({ project: MOCK_DEFAULT_TEAM.uuid })),
            configurable: true,
        })
        jest.spyOn(posthog, 'getFeatureFlagResult').mockImplementation((key) => ({
            key,
            enabled: true,
            variant: key === 'workflows-distribution' ? 'offer' : undefined,
            payload: undefined,
        }))
        jest.mocked(posthog.get_property).mockReturnValue(undefined)
        jest.mocked(posthog.capture).mockClear()
    })
    afterEach(() => jest.restoreAllMocks())

    it.each([false, 'test'])('renders explicit recipients and one-time timing with AI-first %s', async (aiFirst) => {
        newBroadcastAgentLogic.mount()
        const flags = [
            FEATURE_FLAGS.PHAI_SCENE_AUTO_OPEN,
            FEATURE_FLAGS.PHAI_SANDBOX_MODE,
            ...(aiFirst ? [FEATURE_FLAGS.BROADCASTS_AI_FIRST_NEW] : []),
        ]
        featureFlagLogic.actions.setFeatureFlags(flags, Object.fromEntries(flags.map((flag) => [flag, true])))
        const distribution = workflowDistributionLogic()
        distribution.mount()
        distribution.actions.offer({
            projectUuid: MOCK_DEFAULT_TEAM.uuid,
            placementId: 'release-announcement',
            sourceActionId: 'release-42',
            eligible: true,
            releaseSeed: {
                projectUuid: MOCK_DEFAULT_TEAM.uuid,
                experimentId: 42,
                experimentName: 'Compact navigation',
                flagId: 8,
                flagKey: 'compact-navigation',
                variantKey: 'compact',
                releaseToEveryone: true,
            },
        })
        const offer = render(<BroadcastReleaseOffer experimentId={42} />)
        expect(posthog.capture).toHaveBeenCalledWith(
            'workflow distribution offer shown',
            expect.objectContaining({ placement_id: 'release-announcement' })
        )
        fireEvent.click(screen.getByText('Prepare release announcement'))
        expect(newBroadcastAgentLogic.values.aiComposerAvailable).toBe(false)
        offer.unmount()
        const props = { id: 'new', distributionContextKey: distribution.values.memory[0].contextKey }
        const logic = broadcastWizardLogic(props)
        logic.mount()
        const view = render(
            <BindLogic logic={broadcastWizardLogic} props={props}>
                <BroadcastRecipientsStep />
                <BroadcastScheduleStep />
            </BindLogic>
        )
        expect(screen.queryByText('This broadcast will reach')).not.toBeInTheDocument()
        expect(screen.queryByText('Recurring')).not.toBeInTheDocument()
        fireEvent.click(screen.getByText('Choose everyone'))
        expect(screen.getByText('Everyone selected')).toBeInTheDocument()
        expect(screen.getByText('This broadcast will reach')).toBeInTheDocument()
        expect(screen.getByText('Send now')).toBeInTheDocument()
        expect(screen.getByText('Send later')).toBeInTheDocument()
        act(() => logic.actions.setScheduleMode('recurring'))
        expect(logic.values.stepValidationErrors.schedule).toContain(
            'Choose Send now or Send later for this announcement'
        )
        await expectLogic(logic).toFinishAllListeners()
        view.unmount()
        logic.unmount()
        distribution.unmount()
        newBroadcastAgentLogic.unmount()
    })
})
