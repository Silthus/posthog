// PROTOTYPE ONLY (silthus/posthog#212). What the project already captures, as one line of checks.
import { useValues } from 'kea'

import { IconCheckCircle, IconWarning } from '@posthog/icons'
import { LemonTag, Spinner } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { ProjectFacts, TEAM_BRAND } from '../firstRunScenario'

export function ProjectSignals({ facts }: { facts: ProjectFacts }): JSX.Element {
    const { brandStatus } = useValues(firstRunPrototypeLogic)
    const mostHaveEmail = facts.people > 0 && facts.peopleWithEmail / facts.people > 0.5

    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Signal ok={Boolean(facts.signupEvent)}>
                {facts.signupEvent ? (
                    <>
                        Your app sends <code>{facts.signupEvent}</code>
                    </>
                ) : (
                    'No signup event yet'
                )}
            </Signal>
            <Signal ok={mostHaveEmail}>
                {facts.people
                    ? `${facts.peopleWithEmail.toLocaleString()} of ${facts.people.toLocaleString()} people have an email`
                    : 'No people yet'}
            </Signal>
            <span className="flex items-center gap-1.5">
                {brandStatus === 'found' ? (
                    <>
                        <IconCheckCircle className="text-success" />
                        Logo and colors from {TEAM_BRAND.domain}
                    </>
                ) : (
                    <>
                        <Spinner className="text-secondary" />
                        Picking up your logo and colors from {TEAM_BRAND.domain}
                    </>
                )}
                <LemonTag type="completion" size="small">
                    Email brand, in flight
                </LemonTag>
            </span>
        </div>
    )
}

function Signal({ ok, children }: { ok: boolean; children: React.ReactNode }): JSX.Element {
    return (
        <span className="flex items-center gap-1.5">
            {ok ? <IconCheckCircle className="text-success" /> : <IconWarning className="text-warning" />}
            {children}
        </span>
    )
}
