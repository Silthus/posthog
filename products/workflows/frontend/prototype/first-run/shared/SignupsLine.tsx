// PROTOTYPE ONLY (silthus/posthog#212). Real people who signed up and heard nothing, in one line.
import { useValues } from 'kea'

import { ProfilePicture } from 'lib/lemon-ui/ProfilePicture'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { RECENT_SIGNUPS } from '../firstRunScenario'

export function SignupsLine(): JSX.Element {
    const { facts } = useValues(firstRunPrototypeLogic)

    if (!facts.signupsThisMonth) {
        return (
            <span className="text-secondary">
                Nobody has signed up yet. Pick an email now, and it goes out on its own once people arrive.
            </span>
        )
    }
    const names = RECENT_SIGNUPS.slice(0, 3).map((person) => person.name.split(' ')[0])
    const others = facts.signupsThisMonth - names.length
    return (
        <span className="flex items-center gap-2 flex-wrap">
            <span className="flex -space-x-1.5">
                {RECENT_SIGNUPS.map((person) => (
                    <ProfilePicture key={person.name} name={person.name} size="md" />
                ))}
            </span>
            <span>
                {names.join(', ')} and {others.toLocaleString()} others signed up this month.{' '}
                <strong>None of them heard from you.</strong>
            </span>
        </span>
    )
}
