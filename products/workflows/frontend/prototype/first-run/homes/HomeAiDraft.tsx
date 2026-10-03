// PROTOTYPE ONLY (silthus/posthog#212). Variant E: PostHog AI has already looked at the project and drafted
// the welcome email. The page reads as a short conversation that ends in "send it to me".
import { useActions, useValues } from 'kea'

import { IconSparkles } from '@posthog/icons'
import { LemonButton, LemonInput, Spinner } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { ProjectFacts, SIGNED_IN_USER, TEAM_BRAND } from '../firstRunScenario'
import { EmailPreview } from '../shared/EmailPreview'
import { OtherStarts } from '../shared/OtherStarts'

export function HomeAiDraft(): JSX.Element {
    const { facts, brandStatus, exampleSent } = useValues(firstRunPrototypeLogic)
    const { sendExample, openInbox, openWelcomeWorkflow } = useActions(firstRunPrototypeLogic)

    return (
        <div className="flex flex-col gap-4 max-w-[48rem] py-2">
            <AiMessage>
                <FindingsText facts={facts} />
            </AiMessage>
            {brandStatus !== 'found' ? (
                <AiMessage>
                    <span className="flex items-center gap-2 text-secondary">
                        <Spinner /> Drafting a welcome email with the logo and colors from {TEAM_BRAND.domain}
                    </span>
                </AiMessage>
            ) : (
                <>
                    <AiMessage>
                        <p className="mb-2">
                            So I drafted a welcome email for new signups, with the logo and colors from{' '}
                            {TEAM_BRAND.domain}. It thanks them, gives one next step, and invites a reply.
                        </p>
                        <EmailPreview heightClass="h-[20rem]" />
                    </AiMessage>
                    <AiMessage>
                        <p className="mb-2">Want to see it in your inbox first? It only goes to you.</p>
                        {!exampleSent && (
                            <div className="flex flex-wrap gap-2">
                                <LemonButton type="primary" onClick={sendExample}>
                                    Send it to me
                                </LemonButton>
                                <LemonButton type="secondary" onClick={openWelcomeWorkflow}>
                                    Edit it myself
                                </LemonButton>
                            </div>
                        )}
                    </AiMessage>
                </>
            )}
            {exampleSent && (
                <>
                    <UserMessage>Send it to me</UserMessage>
                    <AiMessage>
                        <p className="mb-2">
                            Sent to {SIGNED_IN_USER.email}. Have a look. When you are happy with it, I set it up for
                            every new signup and you turn it on.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <LemonButton type="primary" onClick={openInbox}>
                                Open my inbox (simulated)
                            </LemonButton>
                            <LemonButton type="secondary" onClick={openWelcomeWorkflow}>
                                Set it up
                            </LemonButton>
                        </div>
                    </AiMessage>
                </>
            )}
            <LemonInput placeholder="Ask for changes, like “make it shorter” or “mention our free trial”" disabled />
            <OtherStarts />
        </div>
    )
}

function FindingsText({ facts }: { facts: ProjectFacts }): JSX.Element {
    if (!facts.signupEvent) {
        return (
            <p className="mb-0">
                I looked at this project. It does not capture signups yet, so I can't tell who would get a welcome
                email. You can still see one now, and turn it on once your app sends <code>signed_up</code>.
            </p>
        )
    }
    const fewEmails = facts.peopleWithEmail / facts.people <= 0.5
    return (
        <p className="mb-0">
            I looked at this project. {facts.signupsThisMonth.toLocaleString()} people signed up this month through{' '}
            <code>{facts.signupEvent}</code>, and none of them got an email from you.{' '}
            {fewEmails
                ? `Only ${facts.peopleWithEmail.toLocaleString()} of your ${facts.people.toLocaleString()} people have an email address, so I'll show you how to add it.`
                : `${facts.peopleWithEmail.toLocaleString()} of your ${facts.people.toLocaleString()} people have an email address.`}
        </p>
    )
}

function AiMessage({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <div className="flex gap-3 items-start">
            <div className="size-8 shrink-0 rounded-full bg-fill-secondary flex items-center justify-center">
                <IconSparkles className="text-ai" />
            </div>
            <div className="flex-1 min-w-0 rounded-lg border border-primary bg-surface-primary px-4 py-3 text-sm">
                {children}
            </div>
        </div>
    )
}

function UserMessage({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <div className="flex justify-end">
            <div className="rounded-lg bg-fill-highlight-100 px-4 py-2 text-sm">{children}</div>
        </div>
    )
}
