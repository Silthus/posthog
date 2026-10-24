import '@testing-library/jest-dom'

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { expectLogic } from 'kea-test-utils'
import { createElement } from 'react'

import { FEATURE_FLAGS } from 'lib/constants'
import { integrationsLogic } from 'lib/integrations/integrationsLogic'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { ChannelCatalog } from './ChannelCatalog'
import { channelCatalogLogic } from './channelCatalogLogic'

describe('sandbox setup in the channel catalog', () => {
    let logic: ReturnType<typeof channelCatalogLogic.build>

    beforeEach(() => initKeaTests())
    afterEach(() => {
        cleanup()
        logic?.unmount()
    })

    it.each([404, 500])('starts setup on mount and exposes a %s request for retry', async (failureStatus) => {
        let status = failureStatus
        let requests = 0
        const sandbox = { id: 9, kind: 'email', config: { provider: 'sandbox', verified: true } }
        useMocks({
            get: { '/api/projects/:team_id/integrations/': () => [200, { results: status === 200 ? [sandbox] : [] }] },
            post: {
                '/api/projects/:team_id/integrations/email_sandbox_sender/': () => {
                    requests++
                    return status === 200
                        ? [200, sandbox]
                        : [status, { detail: 'Could not set up your sandbox sender.' }]
                },
            },
        })
        featureFlagLogic.actions.setFeatureFlags([FEATURE_FLAGS.WORKFLOWS_SANDBOX_SENDER], {
            [FEATURE_FLAGS.WORKFLOWS_SANDBOX_SENDER]: true,
        })
        logic = channelCatalogLogic()
        logic.mount()
        await waitFor(() => expect(requests).toBe(1))
        await expectLogic(integrationsLogic).toFinishAllListeners()
        expect(logic.values.sandboxSetupError).toBe('Could not set up your sandbox sender.')

        status = 200
        await expectLogic(logic, () => logic.actions.retrySandboxSenderSetup()).toFinishAllListeners()
        await waitFor(() => expect(requests).toBe(2))
        await expectLogic(integrationsLogic).toFinishAllListeners()
        expect(logic.values.sandboxSetupError).toBeNull()
    })

    it('keeps a channel load failure separate from sandbox setup and reloads on retry', async () => {
        let loadStatus = 500
        const sandbox = { id: 9, kind: 'email', config: { provider: 'sandbox', verified: true } }
        useMocks({
            get: {
                '/api/projects/:team_id/integrations/': () =>
                    loadStatus === 200
                        ? [200, { results: [sandbox] }]
                        : [500, { detail: 'Could not load your channels.' }],
            },
            post: { '/api/projects/:team_id/integrations/email_sandbox_sender/': [200, sandbox] },
        })
        featureFlagLogic.actions.setFeatureFlags([FEATURE_FLAGS.WORKFLOWS_SANDBOX_SENDER], {
            [FEATURE_FLAGS.WORKFLOWS_SANDBOX_SENDER]: true,
        })
        logic = channelCatalogLogic()
        logic.mount()
        await expectLogic(integrationsLogic).toDispatchActions(['loadIntegrationsFailure'])
        await expectLogic(integrationsLogic).toFinishAllListeners()
        expect(logic.values.channels).toBeNull()
        expect(logic.values.integrationsLoadFailed).toBe(true)
        expect(logic.values.sandboxSetupError).toBeNull()

        render(createElement(ChannelCatalog))
        expect(screen.getByText('Could not load your channels.')).toBeInTheDocument()
        cleanup()

        loadStatus = 200
        await expectLogic(logic, () => logic.actions.retrySandboxSenderSetup()).toFinishAllListeners()
        await expectLogic(integrationsLogic).toFinishAllListeners()
        expect(logic.values.integrationsLoadFailed).toBe(false)
        expect(logic.values.channels).not.toBeNull()
        expect(logic.values.sandboxSetupError).toBeNull()
        render(createElement(ChannelCatalog))
        expect(screen.getByTestId('workflows-channel-catalog-email')).toBeInTheDocument()

        loadStatus = 500
        await act(async () => {
            await expectLogic(integrationsLogic, () =>
                integrationsLogic.actions.loadIntegrations()
            ).toFinishAllListeners()
        })
        expect(screen.getByTestId('workflows-channel-catalog-email')).toBeInTheDocument()
        expect(screen.getByText(/Couldn't refresh your channels/)).toBeInTheDocument()
    })
})
