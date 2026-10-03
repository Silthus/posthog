// PROTOTYPE ONLY (silthus/posthog#212). Tells the team which data the welcome email still lacks.
import { LemonBanner } from '@posthog/lemon-ui'

import { CodeSnippet, Language } from 'lib/components/CodeSnippet'

import { ProjectFacts } from '../firstRunScenario'

export function MissingDataHelp({ facts }: { facts: ProjectFacts }): JSX.Element | null {
    if (!facts.signupEvent) {
        return (
            <LemonBanner type="info">
                <div className="flex flex-col gap-2">
                    <span>
                        You can test an email right now. To send it to real signups, capture an event when someone signs
                        up:
                    </span>
                    <CodeSnippet language={Language.JavaScript} compact>
                        posthog.capture('signed_up')
                    </CodeSnippet>
                    <span>
                        Or let the setup agent add it for you: <code>npx -y @posthog/wizard@latest</code>
                    </span>
                </div>
            </LemonBanner>
        )
    }
    if (facts.peopleWithEmail / facts.people <= 0.5) {
        return (
            <LemonBanner type="warning">
                <div className="flex flex-col gap-2">
                    <span>
                        Most people in this project have no email yet, so most of them would miss your emails. Add the
                        email when you identify a user:
                    </span>
                    <CodeSnippet language={Language.JavaScript} compact>
                        {'posthog.identify(user.id, { email: user.email })'}
                    </CodeSnippet>
                </div>
            </LemonBanner>
        )
    }
    return null
}
