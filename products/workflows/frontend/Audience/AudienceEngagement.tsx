import clsx from 'clsx'
import { useActions, useValues } from 'kea'

import { IconDashboard, IconTrends } from '@posthog/icons'
import { LemonButton, LemonCard, LemonSkeleton } from '@posthog/lemon-ui'

import { humanFriendlyNumber } from 'lib/utils/numbers'
import { teamLogic } from 'scenes/teamLogic'
import { urls } from 'scenes/urls'

import { Query } from '~/queries/Query/Query'

import { AUDIENCE_ENGAGEMENT_TILES } from './audienceEngagementQueries'
import { audienceLogic } from './audienceLogic'

function EngagementCaptureOff(): JSX.Element {
    const { currentTeam, currentTeamLoading } = useValues(teamLogic)
    const { updateCurrentTeam } = useActions(teamLogic)
    const { audience } = useValues(audienceLogic)

    if (!audience) {
        return <LemonSkeleton className="h-40" />
    }

    const totals = audience.app_metrics

    return (
        <LemonCard hoverEffect={false} className="flex flex-col gap-3 max-w-3xl" data-attr="audience-engagement-off">
            <div>
                <div className="text-2xl font-semibold">
                    {humanFriendlyNumber(totals.sent)} emails sent in the last {totals.period_days} days
                </div>
                <div className="text-muted">
                    {humanFriendlyNumber(totals.delivered)} delivered, {humanFriendlyNumber(totals.bounced)} bounced.
                    These totals come from workflow metrics.
                </div>
            </div>
            <p className="m-0">
                Opens, clicks, unsubscribes and the per-recipient timeline need engagement events. Turning them on
                records a PostHog event for every send, delivery, open, click, bounce, spam report and unsubscribe. They
                count toward your event volume.
            </p>
            <div className="flex flex-wrap gap-2">
                <LemonButton
                    type="primary"
                    size="small"
                    loading={currentTeamLoading}
                    onClick={() =>
                        updateCurrentTeam({
                            workflows_config: {
                                ...currentTeam?.workflows_config,
                                capture_workflows_engagement_events: true,
                            },
                        })
                    }
                    data-attr="audience-engagement-enable"
                >
                    Turn on engagement events
                </LemonButton>
                <LemonButton type="secondary" size="small" to={urls.settings('environment-workflows')}>
                    Settings
                </LemonButton>
            </div>
        </LemonCard>
    )
}

export function AudienceEngagement(): JSX.Element {
    const { currentTeam } = useValues(teamLogic)
    const { createdDashboardLoading } = useValues(audienceLogic)
    const { createDashboardFromTemplate } = useActions(audienceLogic)
    const captureOn = !!currentTeam?.workflows_config?.capture_workflows_engagement_events

    if (!captureOn) {
        return <EngagementCaptureOff />
    }

    return (
        <div className="flex flex-col gap-4" data-attr="audience-engagement">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-muted m-0 max-w-2xl">
                    Built from the engagement events of every workflow and broadcast, over the last 30 days. Open a tile
                    as an insight to change it, or turn the whole set into a dashboard you can edit and share.
                </p>
                <LemonButton
                    type="primary"
                    size="small"
                    icon={<IconDashboard />}
                    loading={createdDashboardLoading}
                    onClick={createDashboardFromTemplate}
                    data-attr="audience-engagement-create-dashboard"
                >
                    Create dashboard from this
                </LemonButton>
            </div>
            <div className="grid gap-4 grid-cols-1 @min-[64rem]/main-content:grid-cols-2">
                {AUDIENCE_ENGAGEMENT_TILES.map((tile) => (
                    <LemonCard
                        key={tile.key}
                        hoverEffect={false}
                        className={clsx(
                            'flex flex-col gap-2 p-0 overflow-hidden',
                            tile.wide && '@min-[64rem]/main-content:col-span-2'
                        )}
                        data-attr={`audience-engagement-tile-${tile.key}`}
                    >
                        <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3">
                            <div className="min-w-0">
                                <div className="font-semibold">{tile.name}</div>
                                <div className="text-muted text-xs">{tile.description}</div>
                            </div>
                            <LemonButton
                                size="xsmall"
                                type="secondary"
                                icon={<IconTrends />}
                                to={urls.insightNew({ query: tile.query })}
                                data-attr="audience-engagement-open-insight"
                            >
                                Open as insight
                            </LemonButton>
                        </div>
                        <div className="h-100 min-h-0 flex flex-col px-2 pb-2">
                            <div className="min-h-0 flex-1">
                                <Query
                                    query={tile.query}
                                    readOnly
                                    inSharedMode
                                    context={{
                                        insightProps: {
                                            dashboardItemId: `new-AdHoc.audience-engagement-${tile.key}`,
                                            dataNodeCollectionId: `audience-engagement-${tile.key}`,
                                            query: tile.query,
                                        },
                                        suppressSlowQuerySuggestions: true,
                                    }}
                                />
                            </div>
                        </div>
                    </LemonCard>
                ))}
            </div>
        </div>
    )
}
