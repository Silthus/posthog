import { useActions, useValues } from 'kea'

import { LemonButton, LemonCard, LemonSkeleton } from '@posthog/lemon-ui'

import { humanFriendlyNumber } from 'lib/utils/numbers'
import { urls } from 'scenes/urls'

import { AudienceShowFilter, audienceLogic } from './audienceLogic'

interface GapCardProps {
    count: number
    headline: string
    detail: string
    action: JSX.Element
}

function GapCard({ count, headline, detail, action }: GapCardProps): JSX.Element {
    return (
        <LemonCard hoverEffect={false} className="flex-1 min-w-56 flex flex-col gap-1">
            <div className="text-2xl font-semibold">{humanFriendlyNumber(count)}</div>
            <div className="font-medium">{headline}</div>
            <div className="text-muted text-xs flex-1">{detail}</div>
            <div className="mt-2">{action}</div>
        </LemonCard>
    )
}

function ShowButton({ filter, label }: { filter: AudienceShowFilter; label: string }): JSX.Element {
    const { showFilter } = useValues(audienceLogic)
    const { setShowFilter } = useActions(audienceLogic)
    const active = showFilter === filter
    return (
        <LemonButton
            size="xsmall"
            type="secondary"
            active={active}
            onClick={() => setShowFilter(active ? 'all' : filter)}
            data-attr={`audience-gap-${filter}`}
        >
            {active ? 'Show all recipients' : label}
        </LemonButton>
    )
}

export function CoverageGaps(): JSX.Element {
    const { gapCounts } = useValues(audienceLogic)

    if (!gapCounts) {
        return <LemonSkeleton className="h-28" />
    }

    return (
        <div className="flex flex-wrap gap-3" data-attr="audience-coverage-gaps">
            <GapCard
                count={gapCounts.personsWithoutEmail}
                headline="persons can't be reached"
                detail={`Out of ${humanFriendlyNumber(gapCounts.personsTotal)} persons, these have no email property. Workflows skip them at the email step.`}
                action={
                    <LemonButton size="xsmall" type="secondary" to={urls.persons()} data-attr="audience-gap-persons">
                        View persons
                    </LemonButton>
                }
            />
            <GapCard
                count={gapCounts.recipientsWithoutPreference}
                headline="recipients have no recorded preference"
                detail="They receive marketing email until they unsubscribe. Sending preferences from your app fills this in."
                action={<ShowButton filter="no_preference" label="Show them" />}
            />
            <GapCard
                count={gapCounts.suppressed}
                headline="recipients are suppressed"
                detail="Never sent to, because of a bounce, a spam report, or a manual entry."
                action={<ShowButton filter="suppressed" label="Show them" />}
            />
            <GapCard
                count={gapCounts.recipientsWithoutPerson}
                headline="recipients match no person"
                detail="Addresses that came in through the API, a CSV, or Customer.io and belong to no person yet."
                action={<ShowButton filter="no_person" label="Show them" />}
            />
        </div>
    )
}
