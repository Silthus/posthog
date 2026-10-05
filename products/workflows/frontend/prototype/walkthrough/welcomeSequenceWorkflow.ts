import { mswDecorator } from '~/mocks/browser'
import _hogFunctionTemplatesDestinations from '~/mocks/fixtures/_hogFunctionTemplatesDestinations.json'
import { HogFunctionTemplateType } from '~/types'

import type { HogFlow, HogFlowAction } from '../../Workflows/hogflows/types'
import { NEW_WORKFLOW } from '../../Workflows/workflowLogic'

export const WELCOME_SEQUENCE_WORKFLOW_ID = 'prototype-welcome-sequence'

export const WELCOME_EMAIL_ID = 'welcome-email'
export const WAIT_TWO_DAYS_ID = 'wait-two-days'
export const FINISHED_ONBOARDING_ID = 'finished-onboarding'
export const TIPS_EMAIL_ID = 'tips-email'

const EMAIL_TEMPLATE: HogFunctionTemplateType = {
    id: 'template-email',
    type: 'destination',
    name: 'Email',
    description: 'The email message to send.',
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
            description: 'The email message to send.',
        },
    ],
}

const EMAIL_SENDER_INTEGRATION = {
    id: 1,
    kind: 'email',
    display_name: 'Acme team <hello@example.com>',
    config: { email: 'hello@example.com', name: 'Acme team', domain: 'example.com', verified: true },
    created_at: '2026-09-01T12:00:00.000Z',
    created_by: null,
    errors: '',
}

function emailHtml(heading: string, body: string): string {
    return `<html><body style="margin:0;font-family:sans-serif"><div style="background:#1d1f27;color:#fff;padding:24px">Acme</div><div style="padding:24px"><h1 style="margin:0 0 8px">${heading}</h1><p>${body}</p></div></body></html>`
}

function emailAction(
    id: string,
    name: string,
    description: string,
    email: { subject: string; text: string; fromName: string; fromEmail: string }
): HogFlowAction {
    return {
        id,
        type: 'function_email',
        name,
        description,
        config: {
            template_id: 'template-email',
            inputs: {
                email: {
                    value: {
                        to: { email: '{{ person.properties.email }}', name: '' },
                        from: {
                            email: email.fromEmail,
                            name: email.fromName,
                            integrationId: EMAIL_SENDER_INTEGRATION.id,
                        },
                        subject: email.subject,
                        preheader: '',
                        text: email.text,
                        html: emailHtml(email.subject, email.text),
                    },
                    templating: 'liquid',
                },
            },
        },
    } as HogFlowAction
}

export const WELCOME_SEQUENCE_WORKFLOW: HogFlow = {
    ...NEW_WORKFLOW,
    id: WELCOME_SEQUENCE_WORKFLOW_ID,
    team_id: 1,
    version: 3,
    name: 'Welcome email sequence',
    description: 'Welcome new signups with an intro email, then check in on how they are getting on.',
    status: 'active',
    trigger: {
        type: 'event',
        filters: {
            events: [{ id: 'user signed up', name: 'user signed up', type: 'events' }],
            properties: [],
            actions: [],
        },
    },
    exit_condition: 'exit_only_at_end',
    actions: [
        {
            id: 'trigger',
            type: 'trigger',
            name: 'User signed up',
            description: 'Starts when a person signs up.',
            config: {
                type: 'event',
                filters: {
                    events: [{ id: 'user signed up', name: 'user signed up', type: 'events' }],
                    properties: [],
                    actions: [],
                },
            },
        },
        emailAction(WELCOME_EMAIL_ID, 'Welcome email', 'Say hello and point to the first steps.', {
            subject: 'Welcome to Acme, {{ person.properties.first_name }}',
            text: 'Hi {{ person.properties.first_name }}, thanks for signing up. Your workspace is ready. Start by inviting your team and connecting your first data source.',
            fromName: 'Acme team',
            fromEmail: 'hello@example.com',
        }),
        {
            id: WAIT_TWO_DAYS_ID,
            type: 'delay',
            name: 'Wait 2 days',
            description: 'Give them time to try the product.',
            config: { delay_duration: '2d' },
        },
        {
            id: FINISHED_ONBOARDING_ID,
            type: 'conditional_branch',
            name: 'Did they finish onboarding?',
            description: 'Check whether the person completed the onboarding checklist.',
            config: {
                conditions: [
                    {
                        name: 'Finished onboarding',
                        filters: {
                            properties: [
                                { key: 'onboarding_completed', value: ['true'], operator: 'exact', type: 'person' },
                            ],
                        },
                    },
                ],
            },
        },
        emailAction(TIPS_EMAIL_ID, 'Onboarding tips', 'Nudge the people who have not finished onboarding.', {
            subject: 'A few tips to get started with Acme',
            text: 'Hi {{ person.properties.first_name }}, most teams finish setup in under ten minutes. Here are the three steps that matter most, with a short video for each.',
            fromName: 'Acme team',
            fromEmail: 'hello@example.com',
        }),
        {
            id: 'exit',
            type: 'exit',
            name: 'Exit',
            description: 'The person has finished the sequence.',
            config: { reason: 'Completed' },
        },
    ] as HogFlowAction[],
    edges: [
        { from: 'trigger', to: WELCOME_EMAIL_ID, type: 'continue' },
        { from: WELCOME_EMAIL_ID, to: WAIT_TWO_DAYS_ID, type: 'continue' },
        { from: WAIT_TWO_DAYS_ID, to: FINISHED_ONBOARDING_ID, type: 'continue' },
        { from: FINISHED_ONBOARDING_ID, to: 'exit', type: 'branch', index: 0 },
        { from: FINISHED_ONBOARDING_ID, to: TIPS_EMAIL_ID, type: 'continue' },
        { from: TIPS_EMAIL_ID, to: 'exit', type: 'continue' },
    ],
    created_at: '2026-09-04T12:00:00.000Z',
    updated_at: '2026-09-04T12:00:00.000Z',
}

const DRAFT_CONTENT_FIELDS = [
    'actions',
    'edges',
    'trigger',
    'trigger_masking',
    'conversion',
    'exit_condition',
    'email_sending_rate_limit',
    'abort_action',
    'variables',
] as const

let savedWorkflow: HogFlow = WELCOME_SEQUENCE_WORKFLOW

// The live row stays as it is; an edit lands in `draft`, which is what makes the status bar
// show "Editing draft" the same way the real backend does.
function saveAsStagedDraft(body: Record<string, unknown>): HogFlow {
    const { stage_draft, ...rest } = body
    if (stage_draft) {
        const draft = Object.fromEntries(DRAFT_CONTENT_FIELDS.filter((f) => f in rest).map((f) => [f, rest[f]]))
        const metadata = { name: rest.name, description: rest.description }
        savedWorkflow = {
            ...savedWorkflow,
            ...(metadata.name ? { name: metadata.name as string } : {}),
            ...(metadata.description !== undefined ? { description: metadata.description as string } : {}),
            draft: { ...savedWorkflow.draft, ...draft },
            draft_updated_at: new Date().toISOString(),
        }
    } else {
        savedWorkflow = { ...savedWorkflow, ...(rest as Partial<HogFlow>) }
    }
    return savedWorkflow
}

export function resetSavedWorkflow(): void {
    savedWorkflow = WELCOME_SEQUENCE_WORKFLOW
}

export const welcomeSequenceStoryDecorator = mswDecorator({
    get: {
        '/api/projects/:team_id/hog_flow_templates/': { count: 0, results: [] },
        '/api/environments/:team_id/integrations/': {
            count: 1,
            next: null,
            previous: null,
            results: [EMAIL_SENDER_INTEGRATION],
        },
        '/api/projects/:team_id/hog_function_templates': {
            count: _hogFunctionTemplatesDestinations.results.length + 1,
            results: [...(_hogFunctionTemplatesDestinations.results as unknown[]), EMAIL_TEMPLATE],
        },
        // nosemgrep: no-environments-api-urls-frontend -- api.hogFlows has not migrated to generated project routes.
        '/api/environments/:team_id/hog_flows/:id/': () => [200, savedWorkflow],
        // nosemgrep: no-environments-api-urls-frontend -- api.messaging has not migrated to generated project routes.
        '/api/environments/:team_id/messaging_categories': { count: 0, results: [] },
    },
    patch: {
        // nosemgrep: no-environments-api-urls-frontend -- api.hogFlows has not migrated to generated project routes.
        '/api/environments/:team_id/hog_flows/:id/': async ({ request }) => [
            200,
            saveAsStagedDraft((await request.json()) as Record<string, unknown>),
        ],
    },
    post: {
        // nosemgrep: no-environments-api-urls-frontend -- api.hogFlows has not migrated to generated project routes.
        '/api/environments/:team_id/hog_flows/user_blast_radius/': {
            affected: 240,
            total: 1200,
            limit: 100000,
            dedupe_key: null,
            confirm_token: 'storybook-confirm-token',
        },
        '/api/environments/:team_id/query/:query_kind/': {
            results: [
                {
                    data: [120, 140, 180, 150, 130, 190, 170],
                    count: 1080,
                    labels: ['1-Sep', '2-Sep', '3-Sep', '4-Sep', '5-Sep', '6-Sep', '7-Sep'],
                },
            ],
        },
    },
})
