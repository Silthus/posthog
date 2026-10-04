// PROTOTYPE ONLY (silthus/posthog#212). MSW handlers that answer the real Workflows scenes from the
// prototype's simulated state, so the click-through runs through the real list, editor and quick start.
import { MOCK_DEFAULT_ORGANIZATION, MOCK_DEFAULT_TEAM } from 'lib/api.mock'

import { mswDecorator } from '~/mocks/browser'
import _hogFunctionTemplatesDestinations from '~/mocks/fixtures/_hogFunctionTemplatesDestinations.json'
import type { HogFunctionTemplateType } from '~/types'

import type { HogFlow } from '../../Workflows/hogflows/types'
import { applyBrand } from './emailBrand'
import { firstRunPrototypeLogic, WorkflowStatus } from './firstRunPrototypeLogic'
import { OWN_SENDER, SHARED_SENDER, TEAM_BRAND } from './firstRunScenario'
import { WORKFLOW_ID } from './firstRunScenario'
import { EMAIL_TEMPLATES, emailActions } from './realTemplates'

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

function withEmail(action: Record<string, any>, value: Record<string, any>): Record<string, any> {
    return {
        ...action,
        config: {
            ...action.config,
            inputs: { ...action.config.inputs, email: { ...action.config.inputs.email, value } },
        },
    }
}

function currentWorkflow(): HogFlow {
    const { workflowStatus, senderIntegrationId, template, email, brand } = state()
    const chosen = template ?? EMAIL_TEMPLATES[0]
    const firstEmailId = emailActions(chosen)[0].id
    const from = { integrationId: senderIntegrationId }
    const actions = chosen.actions.map((action) => {
        if (action.type !== 'function_email') {
            return action
        }
        const original = (action.config.inputs as Record<string, any>).email.value
        if (action.id === firstEmailId && email) {
            return withEmail(action, { ...email, from })
        }
        return withEmail(action, {
            ...original,
            from,
            design: original.design ? applyBrand(original.design, brand) : original.design,
        })
    })
    return {
        ...(chosen as unknown as HogFlow),
        id: WORKFLOW_ID,
        team_id: 1,
        version: 1,
        status: workflowStatus,
        actions: actions as HogFlow['actions'],
        created_at: '2026-10-04T09:00:00.000Z',
        updated_at: '2026-10-04T09:00:00.000Z',
    }
}

const METRIC_TOTALS: Record<string, number> = {
    triggered: 4,
    succeeded: 4,
    email_sent: 4,
    email_delivered: 4,
    email_opened: 2,
    email_link_clicked: 1,
}

function lastSevenDays(): string[] {
    return Array.from({ length: 7 }, (_, index) => {
        const day = new Date()
        day.setUTCHours(0, 0, 0, 0)
        day.setUTCDate(day.getUTCDate() - (6 - index))
        return day.toISOString()
    })
}

function requestedMetrics(sql: string): string[] {
    const all = Object.keys(METRIC_TOTALS)
    if (!sql.includes('metric_name IN')) {
        return all
    }
    return all.filter((name) => sql.includes(`'${name}'`))
}

function isPreviousPeriod(sql: string): boolean {
    const periodEnd = sql.match(/toDateTime\('([^']+)', tz\) AS to_local/)?.[1]
    return Boolean(periodEnd) && Date.now() - new Date(periodEnd!).getTime() > 2 * 24 * 60 * 60 * 1000
}

function metricsResults(sql: string): unknown[][] {
    const { workflowStatus, template } = state()
    if (workflowStatus !== 'active' || !sql.includes('app_metrics')) {
        return []
    }
    const emailId = emailActions(template ?? EMAIL_TEMPLATES[0])[0].id
    const names = requestedMetrics(sql)
    if (sql.includes('calendar')) {
        const days = lastSevenDays()
        const previous = isPreviousPeriod(sql)
        return names.map((name) => [
            days,
            name,
            days.map((_, index) => (index === 6 && !previous ? METRIC_TOTALS[name] : 0)),
        ])
    }
    if (sql.includes('instance_id, metric_name')) {
        return names.map((name) => [METRIC_TOTALS[name], emailId, name])
    }
    if (/GROUP BY\s+instance_id\b/.test(sql)) {
        return [[METRIC_TOTALS.email_link_clicked, emailId]]
    }
    return names.map((name) => [METRIC_TOTALS[name], name])
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
        '/api/environments/:team_id/hog_flow_templates/': {
            ...EMPTY_PAGE,
            count: EMAIL_TEMPLATES.length,
            results: EMAIL_TEMPLATES,
        },
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
    post: {
        // nosemgrep: no-environments-api-urls-frontend -- prototype mocks answer both route prefixes.
        '/api/environments/:team_id/query/:kind/': async ({ request }) => {
            const body = (await request.json()) as { query?: { query?: string } }
            return [200, { results: metricsResults(body.query?.query ?? '') }]
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
