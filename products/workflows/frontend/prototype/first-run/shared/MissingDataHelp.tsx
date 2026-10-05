// PROTOTYPE ONLY (silthus/posthog#212). Tells the team which data the welcome email still lacks, and hands the
// fix to an agent instead of asking anyone to edit code by hand.
import { useState } from 'react'

import { IconCopy, IconMagicWand } from '@posthog/icons'
import { LemonBanner, LemonButton } from '@posthog/lemon-ui'

import { CodeSnippet, Language } from 'lib/components/CodeSnippet'
import { copyToClipboard } from 'lib/utils/copyToClipboard'

import { ProjectFacts } from '../firstRunScenario'

const WIZARD_COMMAND = 'npx -y @posthog/wizard@latest'

const SIGNUP_PROMPT = `Send a signed_up event to PostHog when someone signs up for my app.
1. If posthog-js is not installed and initialized yet, set it up first.
2. Right after a signup succeeds, call posthog.identify(user.id, { email: user.email }).
3. Then call posthog.capture('signed_up').
Keep the change small and follow the patterns already in the codebase.`

const EMAIL_PROMPT = `Make sure PostHog knows the email of every signed-in user of my app.
1. Find every place that calls posthog.identify(), usually after login and signup.
2. Pass the email as a person property: posthog.identify(user.id, { email: user.email }).
3. If the app never calls posthog.identify(), add the call right after a user logs in or signs up.
Keep the change small and follow the patterns already in the codebase.`

export function MissingDataHelp({ facts }: { facts: ProjectFacts }): JSX.Element | null {
    if (!facts.signupEvent) {
        return (
            <AgentFix
                type="info"
                message="You can test an email right now. To send it to real signups, your app needs to tell PostHog when someone signs up."
                prompt={SIGNUP_PROMPT}
            />
        )
    }
    if (facts.peopleWithEmail / facts.people <= 0.5) {
        return (
            <AgentFix
                type="warning"
                message="Most people in this project have no email yet, so most of them would miss your emails. Your app needs to send the email when it identifies a user."
                prompt={EMAIL_PROMPT}
            />
        )
    }
    return null
}

function AgentFix({
    type,
    message,
    prompt,
}: {
    type: 'info' | 'warning'
    message: string
    prompt: string
}): JSX.Element {
    const [showWizard, setShowWizard] = useState(false)

    return (
        <LemonBanner type={type}>
            <div className="flex flex-col gap-2">
                <span>{message}</span>
                <div className="flex items-center gap-2 flex-wrap">
                    <LemonButton
                        type="primary"
                        size="small"
                        icon={<IconCopy />}
                        onClick={() => void copyToClipboard(prompt, 'prompt')}
                        tooltip={<pre className="whitespace-pre-wrap text-xs mb-0">{prompt}</pre>}
                    >
                        Copy prompt for your coding agent
                    </LemonButton>
                    <LemonButton
                        type="secondary"
                        size="small"
                        icon={<IconMagicWand />}
                        onClick={() => setShowWizard(!showWizard)}
                    >
                        Let the Wizard do it
                    </LemonButton>
                </div>
                {showWizard && (
                    <div className="flex flex-col gap-1">
                        <span className="text-xs">
                            Run this in your app's folder. The setup agent reads your code and makes the change for you.
                        </span>
                        <CodeSnippet language={Language.Bash} compact>
                            {WIZARD_COMMAND}
                        </CodeSnippet>
                    </div>
                )}
            </div>
        </LemonBanner>
    )
}
