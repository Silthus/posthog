// PROTOTYPE ONLY (silthus/posthog#212). Variant A, round 2: the reason, the project's data, the email, one button.
import { useValues } from 'kea'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { EmailPreview } from '../shared/EmailPreview'
import { MissingDataHelp } from '../shared/MissingDataHelp'
import { OtherStarts } from '../shared/OtherStarts'
import { ProjectSignals } from '../shared/ProjectSignals'
import { SendExampleActions } from '../shared/SendExampleActions'

export function HomePitchAndPreview(): JSX.Element {
    const { facts } = useValues(firstRunPrototypeLogic)
    const headline = facts.signupsThisMonth
        ? `${facts.signupsThisMonth.toLocaleString()} people signed up this month. Say hello.`
        : 'Say hello to every new user the moment they sign up'

    return (
        <div className="@container flex flex-col gap-6 max-w-[64rem] py-2">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold mb-0">{headline}</h2>
                <p className="text-secondary mb-0 max-w-[44rem]">
                    A short welcome right after signup shows people there is a team behind your product and gives them
                    one clear next step. It is the email most products send first. Send yourself the example below to
                    see how it looks.
                </p>
            </div>
            <ProjectSignals facts={facts} />
            <MissingDataHelp facts={facts} />
            <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_20rem] gap-6 items-start rounded border border-primary bg-surface-primary p-4">
                <EmailPreview />
                <div className="flex flex-col gap-3">
                    <h3 className="text-base font-semibold mb-0">Your welcome email</h3>
                    <p className="text-sm text-secondary mb-0">
                        It goes out under your name as soon as someone signs up. You can edit every word before anyone
                        gets it.
                    </p>
                    <SendExampleActions />
                </div>
            </div>
            <OtherStarts />
        </div>
    )
}
