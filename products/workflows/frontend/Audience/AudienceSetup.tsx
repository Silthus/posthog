import { useActions, useValues } from 'kea'
import { useEffect, useState } from 'react'

import { IconCheck, IconExternal } from '@posthog/icons'
import { LemonButton, LemonTabs, LemonTag, Link } from '@posthog/lemon-ui'

import { CodeSnippet, Language } from 'lib/components/CodeSnippet'
import { teamLogic } from 'scenes/teamLogic'
import { urls } from 'scenes/urls'

import { AUDIENCE_TOPICS } from './audienceFixtures'
import { audienceLogic } from './audienceLogic'

const DOCS_URL = 'https://posthog.com/docs/workflows/opt-outs'

function snippetFor(projectToken: string, host: string, topicKeys: string[]): string {
    const categories = topicKeys.map((key) => `        '${key}': true,`).join('\n')
    return `import { PostHog } from 'posthog-node'

const posthog = new PostHog('${projectToken}', {
    host: '${host}',
    // A personal API key with the hog_flow:write scope
    secretKey: process.env.POSTHOG_PERSONAL_API_KEY,
})

// Call this whenever a user saves their email preferences in your app.
// false unsubscribes from a topic, true subscribes again. Sending is on by default.
await posthog.messaging.setPreferences('jamie@example.com', {
    allMarketing: true,
    categories: {
${categories}
    },
})`
}

function agentPromptFor(host: string, topicKeys: string[]): string {
    return `Add PostHog email preference sync to our backend.

1. Install or update posthog-node to a version with \`posthog.messaging.setPreferences\`.
2. Create a PostHog client with our project API key and \`secretKey\` set to a personal API key that has the \`hog_flow:write\` scope. Read the key from the POSTHOG_PERSONAL_API_KEY environment variable. The PostHog host is ${host}.
3. Wherever a user saves their email or notification preferences, call
   \`await posthog.messaging.setPreferences(email, { allMarketing, categories })\`.
   - \`allMarketing\` is a boolean: false unsubscribes the user from every marketing email, true subscribes them again.
   - \`categories\` maps topic keys to booleans. Our topic keys are: ${topicKeys.map((key) => `\`${key}\``).join(', ')}.
4. Call it again whenever the preferences change, so PostHog always holds the latest state.
5. Catch \`MessagingPreferencesError\` and log which topic failed. Retrying the whole call is safe.

Do not add any other PostHog calls as part of this change.`
}

export function AudienceSetup(): JSX.Element {
    const { currentTeam, currentTeamLoading } = useValues(teamLogic)
    const { updateCurrentTeam } = useActions(teamLogic)
    const { topics } = useValues(audienceLogic)
    const { trackSetupViewed, trackSnippetCopied } = useActions(audienceLogic)
    const [snippetTab, setSnippetTab] = useState<'snippet' | 'agent_prompt'>('snippet')

    useEffect(() => {
        trackSetupViewed()
    }, [trackSetupViewed])

    const projectToken = currentTeam?.api_token ?? '<project API key>'
    const host = window.location.origin
    const topicKeys = (topics.length > 0 ? topics : AUDIENCE_TOPICS)
        .filter((topic) => topic.category_type === 'marketing')
        .map((topic) => topic.key)
    const captureOn = !!currentTeam?.workflows_config?.capture_workflows_engagement_events

    return (
        <div className="flex flex-col gap-6 max-w-3xl" data-attr="audience-setup">
            <div>
                <h2 className="text-xl font-semibold mb-1">Bring your recipients into PostHog</h2>
                <p className="text-muted m-0">
                    Audience fills itself from the preferences your app sends. Once the first one arrives, every email
                    address shows up here with its topics, its suppression state, and the persons that hold it.{' '}
                    <Link to={DOCS_URL} target="_blank">
                        Read the docs
                    </Link>
                </p>
            </div>

            <section className="flex flex-col gap-2">
                <h3 className="font-semibold m-0">1. Create a personal API key</h3>
                <p className="text-muted text-sm m-0">
                    The key needs the <code>hog_flow:write</code> scope and belongs to someone who can edit workflows in
                    this project. Store it as <code>POSTHOG_PERSONAL_API_KEY</code> in your backend.
                </p>
                <div>
                    <LemonButton
                        type="secondary"
                        size="small"
                        icon={<IconExternal />}
                        to={urls.settings('user-api-keys')}
                        targetBlank
                        data-attr="audience-setup-api-key"
                    >
                        Create personal API key
                    </LemonButton>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-semibold m-0">2. Send preferences from your app</h3>
                <p className="text-muted text-sm m-0">
                    Add the call where users save their email preferences. Copy the snippet, or hand the prompt to your
                    coding agent.
                </p>
                <LemonTabs
                    size="small"
                    activeKey={snippetTab}
                    onChange={setSnippetTab}
                    tabs={[
                        {
                            key: 'snippet',
                            label: 'posthog-node',
                            content: (
                                <CodeSnippet
                                    language={Language.JavaScript}
                                    thing="snippet"
                                    onCopy={() => trackSnippetCopied('snippet')}
                                >
                                    {snippetFor(projectToken, host, topicKeys)}
                                </CodeSnippet>
                            ),
                        },
                        {
                            key: 'agent_prompt',
                            label: 'Prompt for your coding agent',
                            content: (
                                <CodeSnippet
                                    language={Language.Text}
                                    thing="prompt"
                                    wrap
                                    onCopy={() => trackSnippetCopied('agent_prompt')}
                                >
                                    {agentPromptFor(host, topicKeys)}
                                </CodeSnippet>
                            ),
                        },
                    ]}
                />
                <p className="text-muted text-xs m-0">
                    Topic keys come from the <Link to={urls.audience('topics')}>Topics</Link> tab. Already keeping
                    opt-outs in Customer.io? Import them there instead.
                </p>
            </section>

            <section className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold m-0">3. Turn on engagement events</h3>
                    {captureOn && (
                        <LemonTag type="success" icon={<IconCheck />}>
                            On
                        </LemonTag>
                    )}
                </div>
                <p className="text-muted text-sm m-0">
                    Records a PostHog event when a workflow email is sent, delivered, opened, clicked, bounced, reported
                    as spam, or unsubscribed. The Engagement tab and each recipient's timeline are built on these
                    events. They count toward your event volume.
                </p>
                <div>
                    {captureOn ? (
                        <LemonButton
                            type="secondary"
                            size="small"
                            to={urls.settings('environment-workflows')}
                            data-attr="audience-setup-engagement-settings"
                        >
                            Manage in settings
                        </LemonButton>
                    ) : (
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
                            data-attr="audience-setup-engagement-enable"
                        >
                            Turn on engagement events
                        </LemonButton>
                    )}
                </div>
            </section>
        </div>
    )
}
