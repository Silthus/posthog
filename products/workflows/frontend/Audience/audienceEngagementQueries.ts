import { EventsNode, FunnelsQuery, InsightVizNode, NodeKind, TrendsQuery } from '~/queries/schema/schema-general'
import { BaseMathType, ChartDisplayType, FunnelVizType } from '~/types'

const ENGAGEMENT_DATE_RANGE = { date_from: '-30d' }

function engagementSeries(event: string, name: string): EventsNode {
    return { kind: NodeKind.EventsNode, event, name, math: BaseMathType.TotalCount }
}

export const emailsSentPerDayQuery: InsightVizNode<TrendsQuery> = {
    kind: NodeKind.InsightVizNode,
    source: {
        kind: NodeKind.TrendsQuery,
        interval: 'day',
        dateRange: ENGAGEMENT_DATE_RANGE,
        filterTestAccounts: false,
        series: [
            engagementSeries('$workflows_email_sent', 'Sent'),
            engagementSeries('$workflows_email_delivered', 'Delivered'),
            engagementSeries('$workflows_email_opened', 'Opened'),
            engagementSeries('$workflows_email_link_clicked', 'Clicked'),
        ],
        trendsFilter: { display: ChartDisplayType.ActionsLineGraph },
    },
}

export const unsubscribesAndBouncesQuery: InsightVizNode<TrendsQuery> = {
    kind: NodeKind.InsightVizNode,
    source: {
        kind: NodeKind.TrendsQuery,
        interval: 'week',
        dateRange: ENGAGEMENT_DATE_RANGE,
        filterTestAccounts: false,
        series: [
            engagementSeries('$workflows_email_unsubscribed', 'Unsubscribed'),
            engagementSeries('$workflows_email_bounced', 'Bounced'),
            engagementSeries('$workflows_email_blocked', 'Marked as spam'),
        ],
        trendsFilter: { display: ChartDisplayType.ActionsBar },
    },
}

export const engagementFunnelQuery: InsightVizNode<FunnelsQuery> = {
    kind: NodeKind.InsightVizNode,
    source: {
        kind: NodeKind.FunnelsQuery,
        dateRange: ENGAGEMENT_DATE_RANGE,
        filterTestAccounts: false,
        series: [
            engagementSeries('$workflows_email_sent', 'Sent'),
            engagementSeries('$workflows_email_delivered', 'Delivered'),
            engagementSeries('$workflows_email_opened', 'Opened'),
            engagementSeries('$workflows_email_link_clicked', 'Clicked'),
        ],
        funnelsFilter: {
            funnelVizType: FunnelVizType.Steps,
            // Engagement events carry no person link that survives across recipients, so the
            // funnel follows the address the email went to.
            funnelAggregateByHogQL: 'properties.$email_to',
        },
    },
}

export interface AudienceEngagementTile {
    key: 'sent-per-day' | 'unsubscribes-and-bounces' | 'funnel'
    name: string
    description: string
    query: InsightVizNode
}

export const AUDIENCE_ENGAGEMENT_TILES: AudienceEngagementTile[] = [
    {
        key: 'sent-per-day',
        name: 'Emails sent, delivered, opened and clicked',
        description: 'Per day, across every workflow and broadcast.',
        query: emailsSentPerDayQuery,
    },
    {
        key: 'funnel',
        name: 'Sent to delivered to opened to clicked',
        description: 'Each step counts recipients by the address the email went to.',
        query: engagementFunnelQuery,
    },
    {
        key: 'unsubscribes-and-bounces',
        name: 'Unsubscribes, bounces and spam reports',
        description: 'Per week. A rising bar here is the earliest sign of a reputation problem.',
        query: unsubscribesAndBouncesQuery,
    },
]

/** The dashboard that "Create dashboard from this" makes: a normal, editable dashboard, one tile per card above. */
export function audienceEngagementDashboardTemplate(): Record<string, unknown> {
    return {
        template_name: 'Email engagement',
        dashboard_description: 'How recipients engage with email from workflows and broadcasts.',
        dashboard_filters: { date_from: '-30d' },
        tags: ['workflows-audience'],
        tiles: AUDIENCE_ENGAGEMENT_TILES.map((tile, index) => ({
            type: 'INSIGHT',
            name: tile.name,
            description: tile.description,
            query: tile.query,
            layouts: {
                sm: { h: 5, w: 6, x: (index % 2) * 6, y: Math.floor(index / 2) * 5, minH: 5, minW: 3 },
                xs: { h: 5, w: 1, x: 0, y: index * 5, minH: 5, minW: 3 },
            },
        })),
    }
}
