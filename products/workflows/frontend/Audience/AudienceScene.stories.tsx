import { MOCK_DEFAULT_TEAM } from 'lib/api.mock'

import type { Meta, StoryObj } from '@storybook/react'
import { router } from 'kea-router'
import { useEffect } from 'react'

import { FEATURE_FLAGS } from 'lib/constants'
import { urls } from 'scenes/urls'

import { mswDecorator, useStorybookMocks } from '~/mocks/browser'
import { toPaginatedResponse } from '~/mocks/handlers'

import { AUDIENCE_TOPICS, buildAudienceFixtures } from './audienceFixtures'
import { AudienceScene } from './AudienceScene'

const fixtures = buildAudienceFixtures()

const categories = AUDIENCE_TOPICS.map((topic) => ({
    ...topic,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    created_by: null,
    deleted: false,
}))

const optOuts = fixtures.recipients
    .filter((recipient) => recipient.topics.$all === 'unsubscribed')
    .slice(0, 20)
    .map((recipient, index) => ({
        id: `0199c1bb-0000-7000-8000-${String(index).padStart(12, '0')}`,
        identifier: recipient.email,
        updated_at: recipient.preferences_updated_at,
        preferences: { $all: 'OPTED_OUT' },
    }))

const suppressions = fixtures.recipients
    .filter((recipient) => recipient.suppression)
    .map((recipient, index) => ({
        id: `0199c1cc-0000-7000-8000-${String(index).padStart(12, '0')}`,
        identifier: recipient.email,
        source: recipient.suppression?.source,
        reason: recipient.suppression?.reason ?? null,
        transient_bounce_count: recipient.suppression?.source === 'BOUNCE' ? 5 : 0,
        last_bounce_at: recipient.suppression?.source === 'BOUNCE' ? recipient.suppression.suppressed_at : null,
        last_bounce_diagnostic:
            recipient.suppression?.source === 'BOUNCE' ? '550 5.1.1 The email account does not exist' : null,
        suppressed: true,
        suppressed_at: recipient.suppression?.suppressed_at,
        created_at: recipient.suppression?.suppressed_at,
        updated_at: recipient.suppression?.suppressed_at,
    }))

function trendsResult(labels: string[], seed: number[]): Record<string, unknown> {
    const days = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)
    return {
        results: labels.map((label, index) => {
            const data = days.map((_, day) => Math.round(seed[index] * (0.7 + 0.3 * Math.sin((day + index) / 3))))
            return {
                action: { id: label, name: label, type: 'events', order: index },
                label,
                count: data.reduce((sum, value) => sum + value, 0),
                data,
                labels: days,
                days,
            }
        }),
    }
}

const funnelResult = {
    results: [
        {
            action_id: '$workflows_email_sent',
            name: 'Sent',
            custom_name: 'Sent',
            order: 0,
            count: 1180,
            type: 'events',
            average_conversion_time: null,
            median_conversion_time: null,
        },
        {
            action_id: '$workflows_email_delivered',
            name: 'Delivered',
            custom_name: 'Delivered',
            order: 1,
            count: 1131,
            type: 'events',
            average_conversion_time: 55,
            median_conversion_time: 40,
        },
        {
            action_id: '$workflows_email_opened',
            name: 'Opened',
            custom_name: 'Opened',
            order: 2,
            count: 622,
            type: 'events',
            average_conversion_time: 21600,
            median_conversion_time: 14400,
        },
        {
            action_id: '$workflows_email_link_clicked',
            name: 'Clicked',
            custom_name: 'Clicked',
            order: 3,
            count: 249,
            type: 'events',
            average_conversion_time: 900,
            median_conversion_time: 600,
        },
    ],
}

const queryMock = async ({ request }: { request: Request }): Promise<[number, unknown] | undefined> => {
    const body = (await request.json()) as { query: { kind: string; source?: { kind: string; interval?: string } } }
    const source = body.query.source ?? body.query
    if (source.kind === 'FunnelsQuery') {
        return [200, funnelResult]
    }
    if (source.kind === 'TrendsQuery' && source.interval === 'week') {
        return [200, trendsResult(['Unsubscribed', 'Bounced', 'Marked as spam'], [12, 6, 2])]
    }
    if (source.kind === 'TrendsQuery') {
        return [200, trendsResult(['Sent', 'Delivered', 'Opened', 'Clicked'], [48, 46, 25, 10])]
    }
    return undefined
}

function teamWith(captureOn: boolean): Record<string, unknown> {
    return {
        ...MOCK_DEFAULT_TEAM,
        workflows_config: { ...MOCK_DEFAULT_TEAM.workflows_config, capture_workflows_engagement_events: captureOn },
    }
}

const meta: Meta<typeof AudienceScene> = {
    title: 'Products/Workflows/Audience prototype',
    component: AudienceScene,
    parameters: {
        layout: 'fullscreen',
        viewMode: 'story',
        mockDate: '2026-10-01T09:00:00Z',
        featureFlags: [FEATURE_FLAGS.WORKFLOWS_AUDIENCE],
    },
    decorators: [
        mswDecorator({
            get: {
                '/api/projects/:team_id/messaging_categories/': toPaginatedResponse(categories),
                '/api/projects/:team_id/messaging_preferences/opt_outs/': toPaginatedResponse(optOuts),
                '/api/projects/:team_id/messaging_suppressions/suppressions/': toPaginatedResponse(suppressions),
            },
            post: {
                '/api/environments/:team_id/query/': queryMock,
                '/api/environments/:team_id/query/:kind/': queryMock,
            },
        }),
    ],
}
export default meta

type Story = StoryObj<typeof AudienceScene>

function sceneStory(url: string, captureOn: boolean = false): Story {
    return {
        render: function Render() {
            useStorybookMocks({
                patch: { '/api/environments/:team_id/': teamWith(captureOn) },
                get: { '/api/environments/:team_id/': teamWith(captureOn) },
            })
            useEffect(() => {
                router.actions.push(url)
            }, [])
            return <AudienceScene />
        },
    }
}

export const Setup: Story = sceneStory(`${urls.audience()}?scenario=empty`)
export const SetupWithEngagementOn: Story = sceneStory(`${urls.audience('setup')}?scenario=empty`, true)
export const Recipients: Story = sceneStory(urls.audience())
export const RecipientDetail: Story = sceneStory(urls.audienceRecipient(fixtures.recipients[3].email), true)
export const RecipientDetailSuppressed: Story = sceneStory(
    urls.audienceRecipient(fixtures.recipients.find((recipient) => recipient.suppression)!.email),
    true
)
export const EngagementCaptureOff: Story = sceneStory(urls.audience('engagement'), false)
export const Engagement: Story = sceneStory(urls.audience('engagement'), true)
export const Topics: Story = sceneStory(urls.audience('topics'))
export const SuppressionList: Story = sceneStory(urls.audience('suppression'))
