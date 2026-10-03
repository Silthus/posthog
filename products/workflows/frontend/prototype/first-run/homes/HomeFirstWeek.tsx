// PROTOTYPE ONLY (silthus/posthog#212). Variant D: a new user's first week as a story, today versus with a
// welcome sequence. The first email of the sequence is the one thing to try now.
import { useValues } from 'kea'

import { IconLetter } from '@posthog/icons'
import { LemonTag } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { EmailPreview } from '../shared/EmailPreview'
import { MissingDataHelp } from '../shared/MissingDataHelp'
import { OtherStarts } from '../shared/OtherStarts'
import { SendExampleActions } from '../shared/SendExampleActions'

interface Moment {
    day: string
    title: string
    detail: string
}

const TODAY: Moment[] = [
    { day: 'Day 0', title: 'Signs up', detail: 'Looks around, maybe gets stuck' },
    { day: 'Day 1', title: 'Hears nothing', detail: 'No hello, no next step' },
    { day: 'Day 3', title: 'Hears nothing', detail: 'Forgets why they signed up' },
    { day: 'Day 14', title: 'Gone quiet', detail: 'Unlikely to come back' },
]

const WITH_WORKFLOWS: Moment[] = [
    { day: 'Day 0', title: 'Welcome email', detail: 'A hello and one next step' },
    { day: 'Day 2', title: 'Three tips', detail: 'Only if they have not set up yet' },
    { day: 'Day 7', title: 'Did you try this?', detail: 'Points at the feature they skipped' },
    { day: 'Day 14', title: 'We saved your spot', detail: 'Only if they went quiet' },
]

export function HomeFirstWeek(): JSX.Element {
    const { facts } = useValues(firstRunPrototypeLogic)
    const quietAfterDayOne = Math.round(facts.signupsThisMonth * 0.6)

    return (
        <div className="@container flex flex-col gap-6 max-w-[72rem] py-2">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold mb-0">What a new user hears from you in their first week</h2>
                <p className="text-secondary mb-0 max-w-[48rem]">
                    {facts.signupsThisMonth > 0
                        ? `${quietAfterDayOne.toLocaleString()} of the ${facts.signupsThisMonth.toLocaleString()} people who signed up this month never came back after their first day. A few well-timed emails give them a reason to.`
                        : 'Most people decide in their first days whether a product is worth coming back to. A few well-timed emails give them a reason to.'}
                </p>
            </div>
            <MissingDataHelp facts={facts} />
            <Journey label="Today" moments={TODAY} muted />
            <Journey label="With a welcome sequence" moments={WITH_WORKFLOWS} />
            <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_20rem] gap-6 items-start rounded border border-primary bg-surface-primary p-4">
                <EmailPreview heightClass="h-[22rem]" />
                <div className="flex flex-col gap-3">
                    <h3 className="text-base font-semibold mb-0">Start with day 0</h3>
                    <p className="text-sm text-secondary mb-0">
                        The welcome email is the first step of the sequence. See it in your inbox, then turn it on. You
                        can add the other days whenever you like.
                    </p>
                    <SendExampleActions />
                </div>
            </div>
            <OtherStarts />
        </div>
    )
}

function Journey({ label, moments, muted }: { label: string; moments: Moment[]; muted?: boolean }): JSX.Element {
    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase text-secondary">{label}</span>
            <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
                {moments.map((moment, index) => {
                    const isStart = !muted && index === 0
                    return (
                        <div
                            key={moment.day}
                            className={`rounded p-3 flex flex-col gap-1 border ${
                                muted
                                    ? 'border-dashed border-primary text-secondary'
                                    : isStart
                                      ? 'border-2 border-accent bg-surface-primary'
                                      : 'border-primary bg-surface-primary'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-secondary">{moment.day}</span>
                                {isStart && (
                                    <LemonTag type="highlight" size="small">
                                        Try now
                                    </LemonTag>
                                )}
                                {!muted && !isStart && (
                                    <LemonTag type="muted" size="small">
                                        Later
                                    </LemonTag>
                                )}
                            </div>
                            <span className="font-semibold flex items-center gap-1.5">
                                {!muted && <IconLetter className="text-secondary" />}
                                {moment.title}
                            </span>
                            <span className="text-xs text-secondary">{moment.detail}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
