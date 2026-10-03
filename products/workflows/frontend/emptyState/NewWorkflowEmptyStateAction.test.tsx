import '@testing-library/jest-dom'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'kea'
import { router } from 'kea-router'

import { removeProjectIdIfPresent } from 'lib/utils/kea-router'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'
import { AccessControlLevel, AccessControlResourceType, type AppContext } from '~/types'

import type { HogFlowTemplate } from '../Workflows/hogflows/types'
import { workflowsEmptyState } from './workflowsEmptyState'

const WELCOME_TEMPLATE: HogFlowTemplate = {
    id: 'tpl-welcome',
    team_id: 1,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    name: 'Welcome email sequence',
    description: 'Welcome new signups.',
    tags: [],
    scope: 'global',
    actions: [
        {
            id: 'trigger_node',
            type: 'trigger',
            name: 'Trigger',
            description: '',
            created_at: 0,
            updated_at: 0,
            config: { type: 'event', filters: {} },
        },
        {
            id: 'exit_node',
            type: 'exit',
            name: 'Exit',
            description: '',
            created_at: 0,
            updated_at: 0,
            config: { reason: 'Default exit' },
        },
    ],
    edges: [{ from: 'trigger_node', to: 'exit_node', type: 'continue' }],
    trigger: { type: 'event', filters: {} },
    exit_condition: 'exit_only_at_end',
}

const PrimaryAction = workflowsEmptyState.config.PrimaryAction as React.ComponentType

describe('NewWorkflowEmptyStateAction', () => {
    beforeEach(() => {
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flow_templates/': { count: 1, results: [WELCOME_TEMPLATE] },
            },
            patch: {
                // nosemgrep: no-environments-api-urls-frontend -- add_product_intent is env-scoped, so the msw mock must match /api/environments to intercept it
                '/api/environments/:team_id/add_product_intent': {},
            },
        })
        initKeaTests()
        // The button fails closed without an access level in the app context, which would swallow the click.
        window.POSTHOG_APP_CONTEXT = {
            ...window.POSTHOG_APP_CONTEXT,
            resource_access_control: { [AccessControlResourceType.Workflow]: AccessControlLevel.Editor },
        } as AppContext
        router.actions.push('/workflows', {}, {})
    })

    afterEach(() => {
        cleanup()
    })

    // The first-run button used to deep link into a blank editor, skipping the templates the list page's button offers.
    it('opens the template chooser on the first run instead of a blank editor', async () => {
        render(
            <Provider>
                <PrimaryAction />
            </Provider>
        )

        fireEvent.click(screen.getByText('New workflow'))

        expect(await screen.findByText('Welcome email sequence')).toBeInTheDocument()
        expect(screen.getByText('Blank workflow')).toBeInTheDocument()
        expect(removeProjectIdIfPresent(router.values.location.pathname)).toBe('/workflows')
    })
})
