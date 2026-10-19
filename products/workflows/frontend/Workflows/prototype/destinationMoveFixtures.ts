import { HogFunctionType } from '~/types'

import type { HogFlow, HogFlowAction } from '../hogflows/types'
import { NEW_WORKFLOW } from '../workflowLogic'

export const MOVE_DATE = '12 Oct 2026'
export const PREVIEW_WORKFLOW_ID = 'prototype-destination-preview'
export const MOVED_WORKFLOW_ID = 'prototype-destination-moved'
export const AI_DRAFT_WORKFLOW_ID = 'prototype-destination-ai-draft'

export const PRICE_LINE =
    'No price change at your current volume. Above the free tier a workflow run costs more than a destination event.'
export const PRICE_LINE_SOURCE = 'placeholder, final wording comes from #63'
export const BLOCKED_REASON = 'This destination uses a feature that workflows do not support yet'
export const BLOCKED_REASON_SOURCE = 'placeholder, the real reasons come from #62'

const EXAMPLE_USER = {
    id: 1,
    uuid: 'prototype-user',
    distinct_id: 'prototype-user',
    first_name: 'Sam',
    last_name: 'Example',
    email: 'sam@example.com',
}

function destination(overrides: Partial<HogFunctionType>): HogFunctionType {
    return {
        id: 'prototype-destination',
        type: 'destination',
        name: 'Destination',
        description: '',
        created_by: EXAMPLE_USER,
        created_at: '2026-08-02T09:00:00.000Z',
        updated_at: '2026-10-01T09:00:00.000Z',
        enabled: true,
        hog: '',
        template_id: 'template-slack',
        ...overrides,
    }
}

export const DESTINATION = destination({
    id: 'prototype-destination-slack-signups',
    name: 'Slack: new signups',
    description: 'Posts to #signups each time someone signs up.',
    icon_url: '/static/services/slack.png',
})

export const BLOCKED_DESTINATION = destination({
    id: 'prototype-destination-orders-webhook',
    name: 'Webhook: order events',
    description: 'Sends every order event to the fulfillment service.',
    icon_url: '/static/services/webhook.png',
    template_id: 'template-webhook',
})

export const OTHER_DESTINATION = destination({
    id: 'prototype-destination-crm-sync',
    name: 'HubSpot: contact sync',
    description: 'Keeps contacts in sync with HubSpot.',
    icon_url: '/static/services/hubspot.png',
    template_id: 'template-hubspot',
    enabled: false,
})

export const MOVED_DESTINATION: HogFunctionType = {
    ...DESTINATION,
    enabled: false,
    updated_at: '2026-10-12T14:20:00.000Z',
}

const SIGNUP_TRIGGER = {
    type: 'event' as const,
    filters: {
        events: [{ id: 'user signed up', name: 'user signed up', type: 'events' as const }],
        properties: [],
        actions: [],
    },
}

export const PREVIEW_WORKFLOW: HogFlow = {
    ...NEW_WORKFLOW,
    id: PREVIEW_WORKFLOW_ID,
    team_id: 1,
    version: 1,
    name: 'Slack: new signups',
    description: 'Posts to #signups each time someone signs up.',
    status: 'draft',
    trigger: SIGNUP_TRIGGER,
    actions: [
        {
            id: 'trigger',
            type: 'trigger',
            name: 'User signed up',
            description: 'Starts each time someone signs up.',
            config: SIGNUP_TRIGGER,
        },
        {
            id: 'post-to-slack',
            type: 'function',
            name: 'Post to #signups',
            description: 'The same Slack message the destination sends today.',
            config: {
                template_id: 'template-slack',
                inputs: {
                    slack_workspace: { value: 1 },
                    channel: { value: '#signups' },
                    text: { value: '{person.properties.email} just signed up.', templating: 'hog' },
                },
            },
        },
        {
            id: 'exit',
            type: 'exit',
            name: 'End workflow',
            description: 'Nothing else runs.',
            config: { reason: 'Done' },
        },
    ] as HogFlowAction[],
    edges: [
        { from: 'trigger', to: 'post-to-slack', type: 'continue' },
        { from: 'post-to-slack', to: 'exit', type: 'continue' },
    ],
    created_at: '2026-10-12T14:00:00.000Z',
    updated_at: '2026-10-12T14:00:00.000Z',
}

export const MOVED_WORKFLOW: HogFlow = {
    ...PREVIEW_WORKFLOW,
    id: MOVED_WORKFLOW_ID,
    status: 'active',
    updated_at: '2026-10-12T14:20:00.000Z',
}

export const AI_DRAFT_WORKFLOW: HogFlow = {
    ...PREVIEW_WORKFLOW,
    id: AI_DRAFT_WORKFLOW_ID,
    name: 'Signups to Slack with a welcome email',
    description: 'Built by PostHog AI from the destination Slack: new signups.',
    status: 'draft',
    actions: [
        PREVIEW_WORKFLOW.actions[0],
        PREVIEW_WORKFLOW.actions[1],
        {
            id: 'wait-one-day',
            type: 'delay',
            name: 'Wait one day',
            description: 'Give the person a day to look around.',
            config: { delay_duration: '1d' },
        },
        {
            id: 'welcome-email',
            type: 'function',
            name: 'Send welcome email',
            description: 'A short welcome with the getting started guide.',
            config: {
                template_id: 'template-webhook',
                inputs: {
                    url: { value: 'https://example.com/hooks/welcome' },
                    method: { value: 'POST' },
                    body: { value: { person_id: '{person.id}' }, templating: 'hog' },
                },
            },
        },
        PREVIEW_WORKFLOW.actions[2],
    ] as HogFlowAction[],
    edges: [
        { from: 'trigger', to: 'post-to-slack', type: 'continue' },
        { from: 'post-to-slack', to: 'wait-one-day', type: 'continue' },
        { from: 'wait-one-day', to: 'welcome-email', type: 'continue' },
        { from: 'welcome-email', to: 'exit', type: 'continue' },
    ],
}

export const PROTOTYPE_WORKFLOWS: Record<string, HogFlow> = {
    [PREVIEW_WORKFLOW_ID]: PREVIEW_WORKFLOW,
    [MOVED_WORKFLOW_ID]: MOVED_WORKFLOW,
    [AI_DRAFT_WORKFLOW_ID]: AI_DRAFT_WORKFLOW,
}

export function buildAgentPrompt(): string {
    return [
        `Turn my PostHog destination "${DESTINATION.name}" (id ${DESTINATION.id}, template ${DESTINATION.template_id}) into a workflow.`,
        '',
        '1. Read its configuration with the PostHog MCP tool cdp-functions-retrieve. Do not change or disable the destination.',
        '2. Ask me what else the workflow should do before you build anything.',
        '3. Create the workflow as a draft with workflows-create: an event trigger with the same filters, one function step with the same template and inputs, then the steps we agreed on. Load the building-workflows skill if it is available.',
        '4. Do not enable the workflow. Send me the link to the draft.',
    ].join('\n')
}
