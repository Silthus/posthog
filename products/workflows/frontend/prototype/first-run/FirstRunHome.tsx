// PROTOTYPE ONLY (silthus/posthog#212). What a team sees in the Workflows tab before its first workflow.
// It starts from what the project already captures and leads with one reason to send an email.
import { useActions, useValues } from 'kea'

import { IconCheckCircle, IconWarning } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonTag, Link, Spinner } from '@posthog/lemon-ui'

import { CodeSnippet, Language } from 'lib/components/CodeSnippet'
import { urls } from 'scenes/urls'

import { ExampleInboxModal } from './ExampleInboxModal'
import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { ProjectFacts, SHARED_SENDER, SIGNED_IN_USER, TEAM_BRAND } from './firstRunScenario'
import { WELCOME_SUBJECT, welcomeEmailHtml } from './welcomeWorkflow'

export function FirstRunHome(): JSX.Element {
    const { facts } = useValues(firstRunPrototypeLogic)

    return (
        <div className="@container flex flex-col gap-6 max-w-[64rem] py-2">
            <Pitch facts={facts} />
            <ProjectSignals facts={facts} />
            <MissingDataHelp facts={facts} />
            <ExampleEmail />
            <div className="text-sm text-secondary">
                Something else in mind? <Link to={urls.workflows('library')}>Browse templates</Link> or{' '}
                <Link to={urls.workflowNew()}>start from a blank workflow</Link>.
            </div>
            <ExampleInboxModal />
        </div>
    )
}

function Pitch({ facts }: { facts: ProjectFacts }): JSX.Element {
    const headline = facts.signupsThisMonth
        ? `${facts.signupsThisMonth.toLocaleString()} people signed up this month. Say hello.`
        : 'Say hello to every new user the moment they sign up'
    return (
        <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold mb-0">{headline}</h2>
            <p className="text-secondary mb-0 max-w-[44rem]">
                A short welcome right after signup shows people there is a team behind your product and gives them one
                clear next step. It is the email most products send first. Send yourself the example below to see how it
                looks.
            </p>
        </div>
    )
}

function ProjectSignals({ facts }: { facts: ProjectFacts }): JSX.Element {
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

function MissingDataHelp({ facts }: { facts: ProjectFacts }): JSX.Element | null {
    if (!facts.signupEvent) {
        return (
            <LemonBanner type="info">
                <div className="flex flex-col gap-2">
                    <span>
                        You can send yourself the example right now. To welcome real signups, capture an event when
                        someone signs up:
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
                        Most people in this project have no email yet, so most signups would miss the welcome. Add the
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

function ExampleEmail(): JSX.Element {
    const { brandStatus, exampleSent } = useValues(firstRunPrototypeLogic)
    const { sendExample, openInbox, openWelcomeWorkflow } = useActions(firstRunPrototypeLogic)

    return (
        <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_20rem] gap-6 items-start rounded border border-primary bg-surface-primary p-4">
            <div className="flex flex-col rounded border border-primary overflow-hidden">
                <div className="px-3 py-2 border-b border-primary text-xs grid grid-cols-[4rem_1fr] gap-y-1 bg-surface-secondary">
                    <span className="text-secondary">From</span>
                    <span>{SHARED_SENDER.label}</span>
                    <span className="text-secondary">Subject</span>
                    <span className="font-semibold">{WELCOME_SUBJECT}</span>
                </div>
                <iframe
                    title="Welcome email preview"
                    className="w-full h-[26rem] border-0 bg-white"
                    sandbox=""
                    srcDoc={welcomeEmailHtml({
                        branded: brandStatus === 'found',
                        recipientName: SIGNED_IN_USER.name,
                    })}
                />
            </div>
            <div className="flex flex-col gap-3">
                <h3 className="text-base font-semibold mb-0">Your welcome email</h3>
                <p className="text-sm text-secondary mb-0">
                    It goes out under your name as soon as someone signs up. You can edit every word before anyone gets
                    it.
                </p>
                {exampleSent ? (
                    <>
                        <LemonBanner type="success">
                            Sent to {SIGNED_IN_USER.email}. Open it and use the link at the bottom to set it up.
                        </LemonBanner>
                        <LemonButton type="primary" onClick={openInbox}>
                            Open my inbox (simulated)
                        </LemonButton>
                        <LemonButton type="secondary" onClick={openWelcomeWorkflow}>
                            Set it up without checking
                        </LemonButton>
                    </>
                ) : (
                    <>
                        <LemonButton type="primary" size="large" onClick={sendExample} center>
                            Send me an example
                        </LemonButton>
                        <span className="text-xs text-secondary">
                            Only you get it, at {SIGNED_IN_USER.email}. Nothing goes to your users.
                        </span>
                    </>
                )}
            </div>
        </div>
    )
}
