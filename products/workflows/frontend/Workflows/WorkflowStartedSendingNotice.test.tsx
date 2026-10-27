import '@testing-library/jest-dom'

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { BindLogic, Provider } from 'kea'

import { FEATURE_FLAGS } from 'lib/constants'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { workflowsEmailSuspensionLogic } from '../workflowsEmailSuspensionLogic'
import { HogFlow } from './hogflows/types'
import { workflowLogic } from './workflowLogic'
import { WorkflowStartedSendingNotice } from './WorkflowStartedSendingNotice'

const WORKFLOW_ID = 'wf-started-sending-1'

const WENT_LIVE_AFTER_WAITING: HogFlow = {
    id: WORKFLOW_ID,
    name: 'Welcome',
    actions: [],
    edges: [],
    conversion: { filters: [] },
    exit_condition: 'exit_only_at_end',
    version: 1,
    status: 'active',
    team_id: 1,
    trigger: { type: 'event', filters: {} } as HogFlow['trigger'],
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-03T08:30:00.000Z',
    enable_requested_at: '2026-05-02T10:00:00Z',
    went_live_at: '2026-05-03T08:30:00Z',
}

describe('WorkflowStartedSendingNotice', () => {
    afterEach(() => {
        cleanup()
    })

    it.each([
        { name: 'shows once the project can send email', status: 200, suspended: false, shown: true },
        { name: 'stays hidden while the project cannot send email', status: 200, suspended: true, shown: false },
        { name: 'stays hidden when the sending status fails to load', status: 500, suspended: false, shown: false },
    ])('$name', async ({ status, suspended, shown }) => {
        let releaseStatus!: () => void
        const statusReleased = new Promise<void>((resolve) => {
            releaseStatus = resolve
        })
        useMocks({
            get: {
                '/api/environments/:team_id/hog_flows/:id/': async ({ params }) => {
                    if (params.id !== 'email_sending_suspension') {
                        return [200, WENT_LIVE_AFTER_WAITING]
                    }
                    await statusReleased
                    return [status, { email_sending_suspended: suspended }]
                },
                '/api/projects/:team_id/hog_function_templates/': { results: [], count: 0 },
            },
        })
        initKeaTests()
        featureFlagLogic.mount()
        featureFlagLogic.actions.setFeatureFlags([], { [FEATURE_FLAGS.WORKFLOWS_EMAIL_DOMAIN_WIZARD]: true })
        const logic = workflowLogic({ id: WORKFLOW_ID })
        logic.mount()
        await act(async () => {
            await logic.asyncActions.loadWorkflow()
        })

        render(
            <Provider>
                <BindLogic logic={workflowLogic} props={{ id: WORKFLOW_ID }}>
                    <WorkflowStartedSendingNotice />
                </BindLogic>
            </Provider>
        )
        expect(screen.queryByText('Started sending.')).not.toBeInTheDocument()

        releaseStatus()
        await waitFor(() => expect(workflowsEmailSuspensionLogic.values.suspensionStatusLoading).toBe(false))
        expect(screen.queryByText('Started sending.') !== null).toBe(shown)
        logic.unmount()
    })
})
