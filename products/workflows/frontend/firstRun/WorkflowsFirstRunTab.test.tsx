import '@testing-library/jest-dom'

import { cleanup, render, waitFor } from '@testing-library/react'

import { navPanelProductPushWelcomeLogic } from 'lib/components/NavPanelAdvertisement/navPanelProductPushWelcomeLogic'
import { clearAllCachedHasData } from 'lib/components/ProductEmptyState/setupDetectionLogic'

import { useMocks } from '~/mocks/jest'
import { ProductKey } from '~/queries/schema/schema-general'
import { initKeaTests } from '~/test/init'

import { WorkflowsFirstRunTab } from './WorkflowsFirstRunTab'

const WELCOME = {
    campaignId: 'campaign-1',
    productKey: ProductKey.WORKFLOWS,
    label: 'Workflows',
    text: 'Message users when it matters.',
}

describe('WorkflowsFirstRunTab', () => {
    afterEach(() => {
        cleanup()
        clearAllCachedHasData()
    })

    it.each([
        { project: 'without workflows', workflowCount: 0, shows: 'workflows-first-run-gallery', holdsWelcome: true },
        { project: 'with a workflow', workflowCount: 1, shows: 'workflows-table', holdsWelcome: false },
    ])('shows a project $project the $shows', async ({ workflowCount, shows, holdsWelcome }) => {
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flows/': {
                    count: workflowCount,
                    results: [],
                },
            },
        })
        initKeaTests()
        const welcomeLogic = navPanelProductPushWelcomeLogic()
        welcomeLogic.mount()
        welcomeLogic.actions.setPendingWelcome(WELCOME)

        const { container, unmount } = render(<WorkflowsFirstRunTab />)

        welcomeLogic.actions.openWelcome(WELCOME)
        expect(welcomeLogic.values.openFor).toBeNull()

        await waitFor(() => expect(container.querySelector(`[data-attr="${shows}"]`)).toBeInTheDocument())
        expect(
            container.querySelectorAll('[data-attr="workflows-first-run-gallery"], [data-attr="workflows-table"]')
        ).toHaveLength(1)
        welcomeLogic.actions.openWelcome(WELCOME)
        expect(welcomeLogic.values.openFor).toEqual(holdsWelcome ? null : WELCOME)

        unmount()
        welcomeLogic.actions.openWelcome(WELCOME)
        expect(welcomeLogic.values.openFor).toEqual(WELCOME)
        welcomeLogic.unmount()
    })
})
