// PROTOTYPE ONLY (silthus/posthog#212). Variant B: the people who just signed up, each one unanswered.
// The gap is concrete before any pitch: these are real names that heard nothing from the team.
import { useValues } from 'kea'

import { LemonTable, LemonTag } from '@posthog/lemon-ui'

import { ProfilePicture } from 'lib/lemon-ui/ProfilePicture'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { ProjectData } from '../firstRunScenario'
import { EmailPreview } from '../shared/EmailPreview'
import { MissingDataHelp } from '../shared/MissingDataHelp'
import { OtherStarts } from '../shared/OtherStarts'
import { SendExampleActions } from '../shared/SendExampleActions'

interface Signup {
    name: string
    email: string | null
    signedUp: string
}

const PEOPLE: { name: string; email: string; signedUp: string }[] = [
    { name: 'Noor Haddad', email: 'noor@example.org', signedUp: '12 minutes ago' },
    { name: 'Tomás Rivera', email: 'tomas@example.net', signedUp: '1 hour ago' },
    { name: 'Mei Lin', email: 'mei.lin@example.org', signedUp: '3 hours ago' },
    { name: 'Jonas Becker', email: 'jonas@example.net', signedUp: '5 hours ago' },
    { name: 'Amara Okafor', email: 'amara@example.org', signedUp: 'Yesterday' },
    { name: 'Lucas Martin', email: 'lucas.m@example.net', signedUp: 'Yesterday' },
    { name: 'Priya Nair', email: 'priya@example.org', signedUp: '2 days ago' },
]

function recentSignups(projectData: ProjectData): Signup[] {
    if (projectData === 'nothing-yet') {
        return []
    }
    if (projectData === 'few-emails') {
        return PEOPLE.map((person, index) => ({ ...person, email: index % 3 === 1 ? person.email : null }))
    }
    return PEOPLE
}

export function HomeRecentSignups(): JSX.Element {
    const { facts, projectData } = useValues(firstRunPrototypeLogic)
    const signups = recentSignups(projectData)

    return (
        <div className="@container flex flex-col gap-5 max-w-[72rem] py-2">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold mb-0">
                    {signups.length
                        ? 'These people just signed up. None of them heard from you.'
                        : 'Nobody has signed up yet'}
                </h2>
                <p className="text-secondary mb-0 max-w-[44rem]">
                    A welcome right after signup tells people there is a team behind the product and what to do next.
                    Here is what each of them could have received.
                </p>
            </div>
            <MissingDataHelp facts={facts} />
            <div className="grid grid-cols-1 @4xl:grid-cols-[1fr_24rem] gap-6 items-start">
                <div className="flex flex-col gap-2">
                    <LemonTable<Signup>
                        dataSource={signups}
                        rowKey="name"
                        emptyState="Signups show up here as soon as your app captures them."
                        columns={[
                            {
                                title: 'Person',
                                key: 'person',
                                render: (_, signup) => (
                                    <div className="flex items-center gap-2">
                                        <ProfilePicture name={signup.name} size="md" />
                                        <div className="flex flex-col">
                                            <span className="font-semibold">{signup.name}</span>
                                            <span className="text-xs text-secondary">
                                                {signup.email ?? 'No email address'}
                                            </span>
                                        </div>
                                    </div>
                                ),
                            },
                            { title: 'Signed up', key: 'signedUp', dataIndex: 'signedUp' },
                            {
                                title: 'Heard from you',
                                key: 'heard',
                                render: (_, signup) =>
                                    signup.email ? (
                                        <LemonTag type="muted">Nothing yet</LemonTag>
                                    ) : (
                                        <LemonTag type="warning">Can't be reached</LemonTag>
                                    ),
                            },
                        ]}
                    />
                    {signups.length > 0 && (
                        <span className="text-xs text-secondary">
                            The latest {signups.length} of {facts.signupsThisMonth.toLocaleString()} signups this month,
                            from <code>{facts.signupEvent}</code>.
                        </span>
                    )}
                </div>
                <div className="flex flex-col gap-3 rounded border border-primary bg-surface-primary p-4">
                    <h3 className="text-base font-semibold mb-0">What they would have got</h3>
                    <EmailPreview heightClass="h-[18rem]" />
                    <SendExampleActions sendLabel="Send it to me first" />
                </div>
            </div>
            <OtherStarts />
        </div>
    )
}
