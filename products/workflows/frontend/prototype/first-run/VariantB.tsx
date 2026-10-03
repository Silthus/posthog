// PROTOTYPE ONLY. Variant B: a setup checklist in sending order. Each row shows its state from the
// project data, expands in place, and the canvas never appears before the first send.
import { useState } from 'react'

import { IconCheckCircle, IconWarning } from '@posthog/icons'
import { LemonButton, LemonCard, LemonTag } from '@posthog/lemon-ui'

import { LemonRadio } from 'lib/lemon-ui/LemonRadio'

import { BLANK_TEMPLATE, STARTER_TEMPLATES, StarterTemplate, useBackend } from './prototypeBackend'
import { PeopleCheck } from './shared/PeopleCheck'
import { PlugInSlot } from './shared/PlugInSlot'
import { SenderStep } from './shared/SenderStep'
import { SentLog } from './shared/SentLog'

type StepKey = 'sender' | 'people' | 'trigger' | 'message' | 'send'
type StepStatus = 'done' | 'attention' | 'todo'

const BROADCAST_TRIGGER = 'once'
const MANUAL_TRIGGER = 'manual'

export function VariantB(): JSX.Element {
    const backend = useBackend()
    const [open, setOpen] = useState<StepKey>('sender')
    const [trigger, setTrigger] = useState<string | null>(null)
    const [template, setTemplate] = useState<StarterTemplate | null>(null)
    const latest = backend.state.created[backend.state.created.length - 1]

    const statuses: Record<StepKey, StepStatus> = {
        sender: backend.sender === 'domain-verified' ? 'done' : 'attention',
        people:
            backend.peopleWithEmail === 0
                ? 'attention'
                : backend.peopleWithEmail === backend.peopleTotal
                  ? 'done'
                  : 'attention',
        trigger: trigger ? 'done' : 'todo',
        message: template ? 'done' : 'todo',
        send: latest?.status === 'live' ? 'done' : 'todo',
    }

    const triggerOptions = [
        {
            value: BROADCAST_TRIGGER,
            label: 'Send once to a list',
            description: 'A broadcast. No trigger, you pick recipients and a time.',
        },
        ...backend.projectEvents.map((event) => ({
            value: event,
            label: `When ${event} happens`,
            description: 'A workflow. Your project already sends this event.',
        })),
        {
            value: MANUAL_TRIGGER,
            label: 'When I add a person by hand or from a CSV',
            description: 'A workflow without an SDK event.',
        },
    ]

    const kind = trigger === BROADCAST_TRIGGER ? 'broadcast' : 'workflow'
    const canSend = Boolean(trigger && template)

    return (
        <div className="grid grid-cols-[1fr_22rem] gap-8 py-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold mb-2">Get your first message out</h2>
                <ChecklistRow
                    number={1}
                    title="Sender"
                    summary={
                        backend.sender === 'sandbox'
                            ? 'Sandbox sender, delivers to you only'
                            : backend.sender === 'domain-pending'
                              ? 'Your domain is verifying'
                              : 'Your domain is verified'
                    }
                    status={statuses.sender}
                    open={open === 'sender'}
                    onToggle={() => setOpen('sender')}
                >
                    <SenderStep />
                </ChecklistRow>
                <ChecklistRow
                    number={2}
                    title="People"
                    summary={`${backend.peopleWithEmail.toLocaleString()} of ${backend.peopleTotal.toLocaleString()} can receive email`}
                    status={statuses.people}
                    open={open === 'people'}
                    onToggle={() => setOpen('people')}
                >
                    <PeopleCheck />
                </ChecklistRow>
                <ChecklistRow
                    number={3}
                    title="When to send"
                    summary={
                        trigger ? (triggerOptions.find((o) => o.value === trigger)?.label ?? trigger) : 'Not chosen yet'
                    }
                    status={statuses.trigger}
                    open={open === 'trigger'}
                    onToggle={() => setOpen('trigger')}
                >
                    <div className="flex flex-col gap-3">
                        {backend.projectEvents.length === 0 && (
                            <div className="text-sm text-warning flex items-center gap-2">
                                <IconWarning /> Your project sends no events yet, so only the first and last options
                                work. Install the SDK to trigger on behavior.
                            </div>
                        )}
                        <LemonRadio value={trigger ?? undefined} onChange={setTrigger} options={triggerOptions} />
                    </div>
                </ChecklistRow>
                <ChecklistRow
                    number={4}
                    title="Message"
                    summary={template ? template.name : 'Pick a template or start blank'}
                    status={statuses.message}
                    open={open === 'message'}
                    onToggle={() => setOpen('message')}
                >
                    <div className="grid grid-cols-3 gap-2">
                        {[...STARTER_TEMPLATES, BLANK_TEMPLATE].map((candidate) => {
                            const readiness = backend.readiness(candidate)
                            return (
                                <LemonCard
                                    key={candidate.id}
                                    hoverEffect
                                    focused={template?.id === candidate.id}
                                    onClick={() => setTemplate(candidate)}
                                    className="cursor-pointer flex flex-col gap-1"
                                >
                                    <span className="text-sm font-semibold leading-tight">{candidate.name}</span>
                                    <span className="text-xs text-secondary">{candidate.subject}</span>
                                    {readiness.missingEvent && (
                                        <LemonTag type="warning" size="small">
                                            needs {readiness.missingEvent}
                                        </LemonTag>
                                    )}
                                </LemonCard>
                            )
                        })}
                    </div>
                    <PlugInSlot name="Email brand" does="every template opens in your colors" />
                </ChecklistRow>
                <ChecklistRow
                    number={5}
                    title="Test and go live"
                    summary={
                        latest?.status === 'live' ? `${latest.name} is live` : 'Send yourself a test, then go live'
                    }
                    status={statuses.send}
                    open={open === 'send'}
                    onToggle={() => setOpen('send')}
                >
                    <div className="flex items-center gap-2 flex-wrap">
                        <LemonButton
                            type="secondary"
                            disabledReason={template ? undefined : 'Pick a message first'}
                            onClick={() => template && backend.sendToMe(template)}
                        >
                            Send a test to me
                        </LemonButton>
                        <LemonButton
                            type="primary"
                            disabledReason={canSend ? undefined : 'Choose when to send and a message first'}
                            onClick={() => {
                                if (template) {
                                    backend.create(template, kind)
                                }
                            }}
                        >
                            Save {kind}
                        </LemonButton>
                        {latest && latest.status === 'draft' && (
                            <LemonButton type="primary" onClick={() => backend.goLive(latest.id)}>
                                {backend.sender === 'domain-verified' ? 'Go live' : 'Go live for me only'}
                            </LemonButton>
                        )}
                        {backend.sender !== 'domain-verified' && (
                            <span className="text-xs text-secondary">
                                Real recipients unlock when your domain verifies. Nothing else changes.
                            </span>
                        )}
                    </div>
                </ChecklistRow>
            </div>
            <div className="flex flex-col gap-4">
                <LemonCard className="flex flex-col gap-2">
                    <div className="text-xs font-semibold uppercase text-secondary">What will happen</div>
                    <SummaryLine label="From" value={backend.senderLabel} />
                    <SummaryLine
                        label="To"
                        value={
                            backend.sender === 'domain-verified'
                                ? `${backend.peopleWithEmail.toLocaleString()} people with an email`
                                : 'You, until the domain verifies'
                        }
                    />
                    <SummaryLine
                        label="When"
                        value={trigger ? (triggerOptions.find((o) => o.value === trigger)?.label ?? '') : 'Not chosen'}
                    />
                    <SummaryLine label="Message" value={template?.name ?? 'Not chosen'} />
                </LemonCard>
                <SentLog />
            </div>
        </div>
    )
}

function ChecklistRow({
    number,
    title,
    summary,
    status,
    open,
    onToggle,
    children,
}: {
    number: number
    title: string
    summary: string
    status: StepStatus
    open: boolean
    onToggle: () => void
    children: React.ReactNode
}): JSX.Element {
    return (
        <div className="rounded border border-primary bg-surface-primary">
            <button className="w-full text-left px-4 py-3 flex items-center gap-3" onClick={onToggle}>
                <span className="size-7 shrink-0 rounded-full bg-fill-secondary flex items-center justify-center text-sm font-semibold">
                    {status === 'done' ? <IconCheckCircle className="text-success text-lg" /> : number}
                </span>
                <span className="flex-1">
                    <span className="font-semibold">{title}</span>
                    <span className="block text-sm text-secondary">{summary}</span>
                </span>
                <LemonTag type={status === 'done' ? 'success' : status === 'attention' ? 'warning' : 'default'}>
                    {status === 'done' ? 'done' : status === 'attention' ? 'look' : 'to do'}
                </LemonTag>
            </button>
            {open && <div className="px-4 pb-4 pl-14 flex flex-col gap-3">{children}</div>}
        </div>
    )
}

function SummaryLine({ label, value }: { label: string; value: string }): JSX.Element {
    return (
        <div className="text-sm grid grid-cols-[4.5rem_1fr] gap-2">
            <span className="text-secondary">{label}</span>
            <span>{value}</span>
        </div>
    )
}
