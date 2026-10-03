// PROTOTYPE ONLY (silthus/posthog#212). Variant H: PostHog AI leads. It says what it found, offers the emails
// that fit, takes change requests, sends the test and turns it on. The email stays in view the whole time.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconSparkles } from '@posthog/icons'
import { LemonButton, LemonInput, Spinner } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { SHARED_SENDER, SIGNED_IN_USER, TEAM_BRAND } from '../firstRunScenario'
import { DeliveredEmail } from '../shared/DeliveredEmail'
import { DraftPreview } from '../shared/DraftPreview'
import { FlowStepsHeader } from '../shared/FlowSteps'
import { AI_EDITS, aiEditFor } from '../starterEmails'

export function HomeAiWalkthrough(): JSX.Element {
    const { facts, picks, starter, draft, chat, brandStatus, flowStep, testSent } = useValues(firstRunPrototypeLogic)
    const { selectStarter, askAi, sendTest, setFlowStep, openInbox, turnOn, openInEditor } =
        useActions(firstRunPrototypeLogic)
    const [prompt, setPrompt] = useState('')
    const ready = picks.filter((pick) => pick.ready)

    const submit = (): void => {
        if (prompt.trim()) {
            askAi(prompt.trim(), aiEditFor(prompt))
            setPrompt('')
        }
    }

    return (
        <div className="@container grid grid-cols-1 @4xl:grid-cols-[1fr_30rem] gap-6 items-start max-w-[80rem] py-2">
            <div className="flex flex-col gap-3">
                <AiMessage>
                    {facts.signupsThisMonth ? (
                        <p className="mb-2">
                            I looked at your project. {facts.signupsThisMonth.toLocaleString()} people signed up this
                            month, and none of them heard from you. These emails fit what your app already tracks:
                        </p>
                    ) : (
                        <p className="mb-2">
                            I looked at your project. It does not capture signups or visits yet, so I picked emails that
                            work once it does. You can make one yours and test it right now:
                        </p>
                    )}
                    <div className="flex flex-col gap-1.5">
                        {(ready.length ? ready : picks.slice(0, 3)).map((pick) => (
                            <LemonButton
                                key={pick.starter.id}
                                type={starter?.id === pick.starter.id ? 'primary' : 'secondary'}
                                onClick={() => selectStarter(pick.starter.id)}
                                sideIcon={null}
                                fullWidth
                            >
                                <span className="flex flex-col items-start text-left">
                                    <span>{pick.starter.name}</span>
                                    <span className="text-xs text-secondary font-normal">{pick.reason}</span>
                                </span>
                            </LemonButton>
                        ))}
                    </div>
                </AiMessage>
                {starter && (
                    <>
                        <UserMessage>Let's do the {starter.name.toLowerCase()}</UserMessage>
                        <AiMessage>
                            {brandStatus !== 'found' ? (
                                <span className="flex items-center gap-2 text-secondary">
                                    <Spinner /> Putting it in your brand from {TEAM_BRAND.domain}
                                </span>
                            ) : (
                                <p className="mb-0">
                                    Here it is with the logo and colors from {TEAM_BRAND.domain}. What would you like to
                                    change?
                                </p>
                            )}
                        </AiMessage>
                        {chat.map((message, index) =>
                            message.from === 'user' ? (
                                <UserMessage key={index}>{message.text}</UserMessage>
                            ) : (
                                <AiMessage key={index}>{message.text}</AiMessage>
                            )
                        )}
                        {testSent && (
                            <>
                                <UserMessage>Send me a test</UserMessage>
                                <AiMessage>
                                    <p className="mb-2">Sent to {SIGNED_IN_USER.email}. Have a look.</p>
                                    <div className="flex flex-wrap gap-2">
                                        <LemonButton type="secondary" size="small" onClick={openInbox}>
                                            Open my inbox (simulated)
                                        </LemonButton>
                                        <LemonButton type="primary" size="small" onClick={() => setFlowStep('turn-on')}>
                                            Looks good
                                        </LemonButton>
                                    </div>
                                </AiMessage>
                            </>
                        )}
                        {flowStep === 'turn-on' && (
                            <>
                                <UserMessage>Looks good</UserMessage>
                                <AiMessage>
                                    <p className="mb-2">
                                        It goes out {starter.triggerLabel.toLowerCase()}, from {SHARED_SENDER.address}{' '}
                                        with your name on it. Replies go to you. Add your own domain whenever you like.
                                        Shall I turn it on?
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <LemonButton type="primary" size="small" onClick={turnOn}>
                                            Turn it on
                                        </LemonButton>
                                        <LemonButton type="secondary" size="small" onClick={openInEditor}>
                                            Open in the full editor first
                                        </LemonButton>
                                    </div>
                                </AiMessage>
                            </>
                        )}
                        {flowStep === 'customize' && (
                            <div className="flex flex-col gap-2 pl-11">
                                <div className="flex flex-wrap gap-1.5">
                                    {AI_EDITS.map((edit) => (
                                        <LemonButton
                                            key={edit.key}
                                            size="xsmall"
                                            type="secondary"
                                            onClick={() => askAi(edit.label, edit.key)}
                                        >
                                            {edit.label}
                                        </LemonButton>
                                    ))}
                                    <LemonButton size="xsmall" type="primary" onClick={sendTest}>
                                        Looks good, send me a test
                                    </LemonButton>
                                </div>
                            </div>
                        )}
                    </>
                )}
                <LemonInput
                    placeholder={starter ? 'Ask for a change, like “mention our onboarding call”' : 'Ask PostHog AI'}
                    value={prompt}
                    onChange={setPrompt}
                    onPressEnter={submit}
                    disabledReason={starter ? undefined : 'Pick an email first'}
                />
            </div>
            <div className="flex flex-col gap-3 @4xl:sticky @4xl:top-4">
                {starter && draft ? (
                    <>
                        <FlowStepsHeader />
                        {flowStep === 'test' ? <DeliveredEmail /> : <DraftPreview draft={draft} />}
                    </>
                ) : (
                    <div className="rounded border border-dashed border-primary p-8 text-center text-secondary">
                        Pick an email and it shows up here, in your brand.
                    </div>
                )}
            </div>
        </div>
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
