// PROTOTYPE ONLY. Variant A: the first screen is a composer that sends one email to you, right now.
// Setup (domain, people, workflow vs broadcast) comes after the first delivery, not before it.
import { useState } from 'react'

import { IconCheckCircle, IconDecisionTree, IconMegaphone } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonCard, LemonTag } from '@posthog/lemon-ui'

import {
    BLANK_TEMPLATE,
    MessageKind,
    SIGNED_IN_USER,
    STARTER_TEMPLATES,
    StarterTemplate,
    useBackend,
} from './prototypeBackend'
import { PeopleCheck } from './shared/PeopleCheck'
import { PlugInSlot } from './shared/PlugInSlot'
import { SenderStep } from './shared/SenderStep'
import { SentLog } from './shared/SentLog'

const COMPOSER_TEMPLATES = [
    ...STARTER_TEMPLATES.filter((t) => ['welcome', 'trial-ending', 'announce'].includes(t.id)),
    BLANK_TEMPLATE,
]

export function VariantA(): JSX.Element {
    const { state, senderLabel, sendToMe } = useBackend()
    const [selected, setSelected] = useState<StarterTemplate>(COMPOSER_TEMPLATES[0])
    const firstDelivery = state.sentLog.find((entry) => entry.via === 'sandbox')

    return (
        <div className="max-w-3xl mx-auto py-8 flex flex-col gap-8">
            {!firstDelivery ? (
                <>
                    <div>
                        <h2 className="text-2xl font-semibold mb-1">Send your first email in the next minute</h2>
                        <p className="text-secondary mb-0">
                            Pick a message. It goes to you, {SIGNED_IN_USER.email}, from PostHog's sandbox sender, so
                            there is nothing to set up first.
                        </p>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                        {COMPOSER_TEMPLATES.map((template) => (
                            <LemonCard
                                key={template.id}
                                hoverEffect
                                focused={selected.id === template.id}
                                onClick={() => setSelected(template)}
                                className="flex flex-col gap-1 cursor-pointer"
                            >
                                <span className="font-semibold text-sm leading-tight">{template.name}</span>
                                <span className="text-xs text-secondary">{template.description}</span>
                            </LemonCard>
                        ))}
                    </div>
                    <EmailPreview template={selected} from={senderLabel} />
                    <div className="flex items-center gap-3">
                        <LemonButton type="primary" size="large" onClick={() => sendToMe(selected)}>
                            Send to me
                        </LemonButton>
                        <span className="text-sm text-secondary">
                            Only you receive this. Your users never see a test.
                        </span>
                    </div>
                </>
            ) : (
                <>
                    <LemonBanner type="success">
                        <strong>Delivered to {SIGNED_IN_USER.email}</strong> at minute {firstDelivery.minute}. Open your
                        inbox and see how "{firstDelivery.subject}" looks.
                    </LemonBanner>
                    <div>
                        <h2 className="text-xl font-semibold mb-1">Now reach your users</h2>
                        <p className="text-secondary mb-0">Three steps. You can do them in any order and come back.</p>
                    </div>
                    <NumberedStep number={1} title="Send from your own domain">
                        <SenderStep />
                    </NumberedStep>
                    <NumberedStep number={2} title="Check who can receive it">
                        <PeopleCheck />
                    </NumberedStep>
                    <NumberedStep number={3} title="Decide how it goes out">
                        <GoOutChooser template={selected} />
                    </NumberedStep>
                    <SentLog />
                </>
            )}
        </div>
    )
}

function EmailPreview({ template, from }: { template: StarterTemplate; from: string }): JSX.Element {
    return (
        <div className="rounded border border-primary bg-surface-primary overflow-hidden">
            <div className="px-4 py-3 border-b border-primary text-sm grid grid-cols-[4rem_1fr] gap-y-1">
                <span className="text-secondary">From</span>
                <span>{from}</span>
                <span className="text-secondary">To</span>
                <span>
                    {SIGNED_IN_USER.name} ({SIGNED_IN_USER.email})
                </span>
                <span className="text-secondary">Subject</span>
                <span className="font-semibold">{template.subject}</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
                <p className="mb-0 text-sm">Hi {SIGNED_IN_USER.name},</p>
                <p className="mb-0 text-sm text-secondary">{template.description}</p>
                <PlugInSlot name="Email brand" does="your logo, colors and footer, picked up from your website" />
            </div>
        </div>
    )
}

function NumberedStep({
    number,
    title,
    children,
}: {
    number: number
    title: string
    children: React.ReactNode
}): JSX.Element {
    return (
        <div className="flex gap-4">
            <div className="size-7 shrink-0 rounded-full bg-fill-secondary flex items-center justify-center text-sm font-semibold">
                {number}
            </div>
            <div className="flex-1 flex flex-col gap-2">
                <h3 className="text-base font-semibold mb-0">{title}</h3>
                {children}
            </div>
        </div>
    )
}

function GoOutChooser({ template }: { template: StarterTemplate }): JSX.Element {
    const { state, create, goLive, sender } = useBackend()
    const created = state.created[state.created.length - 1]

    if (created) {
        return (
            <div className="flex items-center gap-3 flex-wrap">
                <IconCheckCircle className="text-success text-lg" />
                <span className="text-sm">
                    <strong>{created.name}</strong> saved as a {created.kind}.
                </span>
                <LemonTag type={created.status === 'live' ? 'success' : 'default'}>{created.status}</LemonTag>
                {created.status === 'draft' && (
                    <LemonButton type="primary" size="small" onClick={() => goLive(created.id)}>
                        {sender === 'domain-verified' ? 'Go live' : 'Go live (you only, until the domain verifies)'}
                    </LemonButton>
                )}
            </div>
        )
    }

    const option = (kind: MessageKind, icon: JSX.Element, title: string, text: string): JSX.Element => (
        <LemonCard
            hoverEffect
            className="flex-1 cursor-pointer flex flex-col gap-1"
            onClick={() => create(template, kind)}
        >
            <div className="flex items-center gap-2 font-semibold">
                {icon}
                {title}
            </div>
            <span className="text-sm text-secondary">{text}</span>
        </LemonCard>
    )

    return (
        <div className="flex gap-3">
            {option(
                'broadcast',
                <IconMegaphone />,
                'Send it once to a list',
                'A broadcast. Pick recipients, schedule, done. Good for announcements.'
            )}
            {option(
                'workflow',
                <IconDecisionTree />,
                'Send it when something happens',
                `A workflow. ${template.triggerLabel}, with waits and branches on the canvas.`
            )}
        </div>
    )
}
