// PROTOTYPE ONLY (silthus/posthog#212). MSW handlers that answer the real Workflows scenes from the
// prototype's simulated state, so the click-through runs through the real list, editor and quick start.
import { MOCK_DEFAULT_ORGANIZATION, MOCK_DEFAULT_TEAM } from 'lib/api.mock'

import { mswDecorator } from '~/mocks/browser'
import _hogFunctionTemplatesDestinations from '~/mocks/fixtures/_hogFunctionTemplatesDestinations.json'
import type { HogFunctionTemplateType } from '~/types'

import { firstRunPrototypeLogic, WorkflowStatus } from './firstRunPrototypeLogic'
import { OWN_SENDER, SHARED_SENDER, TEAM_BRAND } from './firstRunScenario'
import { STARTERS, starterWorkflow } from './starterEmails'

const EMAIL_TEMPLATE: HogFunctionTemplateType = {
    id: 'template-email',
    type: 'destination',
    name: 'Email',
    description: 'The email message to send. Configure the recipient, sender, subject, and content.',
    status: 'hidden',
    free: false,
    code: '',
    code_language: 'hog',
    icon_url: '/static/posthog-icon.svg',
    inputs_schema: [
        {
            type: 'native_email',
            key: 'email',
            label: 'Email message',
            integration: 'email',
            required: true,
            secret: false,
            description: 'The email message to send. Configure the recipient, sender, subject, and content.',
        },
    ],
}

const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] }

let onboardingTasks: Record<string, string> = {}

function state(): typeof firstRunPrototypeLogic.values {
    return firstRunPrototypeLogic.values
}

function currentWorkflow(): ReturnType<typeof starterWorkflow> {
    const { workflowStatus, senderIntegrationId, starter, draft } = state()
    const chosen = starter ?? STARTERS[0]
    return starterWorkflow({
        starter: chosen,
        draft: draft ?? chosen.draft,
        status: workflowStatus,
        senderIntegrationId,
    })
}

function emailIntegration(sender: typeof SHARED_SENDER, domain: string, verified: boolean): Record<string, unknown> {
    return {
        id: sender.integrationId,
        kind: 'email',
        display_name: sender.label,
        config: { email: sender.address, domain, name: TEAM_BRAND.name, provider: 'ses', verified },
        created_at: '2026-10-03T09:00:00.000Z',
        created_by: null,
        errors: '',
    }
}

function emailIntegrations(): Record<string, unknown>[] {
    const shared = emailIntegration(SHARED_SENDER, 'trial.posthog.com', true)
    const { ownDomain } = state()
    if (ownDomain === 'none') {
        return [shared]
    }
    return [shared, emailIntegration(OWN_SENDER, TEAM_BRAND.domain, ownDomain === 'verified')]
}

export const firstRunMswDecorator = mswDecorator({
    get: {
        '/api/organizations/@current/': () => [
            200,
            { ...MOCK_DEFAULT_ORGANIZATION, created_at: new Date().toISOString() },
        ],
        // nosemgrep: no-environments-api-urls-frontend -- prototype mocks answer both route prefixes.
        '/api/environments/:team_id/hog_flows/': () => {
            const results = state().workflowCreated ? [currentWorkflow()] : []
            return [200, { ...EMPTY_PAGE, count: results.length, results }]
        },
        // nosemgrep: no-environments-api-urls-frontend -- prototype mocks answer both route prefixes.
        '/api/environments/:team_id/hog_flows/:id/': ({ params }) =>
            params.id === 'email_sending_suspension'
                ? [
                      200,
                      {
                          email_sending_suspended: false,
                          email_sending_suspended_at: null,
                          email_sending_suspension_reason: '',
                      },
                  ]
                : [200, currentWorkflow()],
        // nosemgrep: no-environments-api-urls-frontend -- prototype mocks answer both route prefixes.
        '/api/environments/:team_id/hog_flows/:id/batch_jobs/': EMPTY_PAGE,
        // nosemgrep: no-environments-api-urls-frontend -- prototype mocks answer both route prefixes.
        '/api/environments/:team_id/hog_flow_templates/': EMPTY_PAGE,
        // nosemgrep: no-environments-api-urls-frontend -- prototype mocks answer both route prefixes.
        '/api/environments/:team_id/integrations/': () => [
            200,
            { ...EMPTY_PAGE, count: emailIntegrations().length, results: emailIntegrations() },
        ],
        // nosemgrep: no-environments-api-urls-frontend -- prototype mocks answer both route prefixes.
        '/api/environments/:team_id/messaging_templates/': EMPTY_PAGE,
        // nosemgrep: no-environments-api-urls-frontend -- prototype mocks answer both route prefixes.
        '/api/environments/:team_id/messaging_categories/': EMPTY_PAGE,
        '/api/projects/:team_id/hog_function_templates/': {
            count: _hogFunctionTemplatesDestinations.results.length + 1,
            results: [...(_hogFunctionTemplatesDestinations.results as unknown[]), EMAIL_TEMPLATE],
        },
    },
    patch: {
        // nosemgrep: no-environments-api-urls-frontend -- prototype mocks answer both route prefixes.
        '/api/environments/:team_id/hog_flows/:id/': async ({ request }) => {
            const body = (await request.json()) as { status?: WorkflowStatus }
            if (body.status) {
                firstRunPrototypeLogic.actions.setWorkflowStatus(body.status)
            }
            return [200, { ...currentWorkflow(), updated_at: new Date().toISOString() }]
        },
        '/api/projects/:team_id/': async ({ request }) => {
            const body = (await request.json()) as { onboarding_tasks?: Record<string, string> }
            onboardingTasks = { ...onboardingTasks, ...body.onboarding_tasks }
            return [200, { ...MOCK_DEFAULT_TEAM, ...body, onboarding_tasks: onboardingTasks }]
        },
    },
})
