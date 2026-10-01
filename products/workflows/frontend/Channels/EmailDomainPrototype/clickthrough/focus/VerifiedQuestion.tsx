// PROTOTYPE (throwaway): Focus phase 4, the celebration, the first sender, the records and the first workflow.
import clsx from 'clsx'
import { useEffect, useState } from 'react'

import { IconArrowRight, IconCheck, IconPlus, IconSend } from '@posthog/icons'
import { LemonButton, LemonCollapse, LemonInput, Link, lemonToast } from '@posthog/lemon-ui'

import { HedgehogCowboyLasso, HedgehogMailbox, HedgehogRocket } from '../shared/hoggies'
import { SetupSimulation } from '../simulation'
import { BigAction, QuestionHeading, RecordRows } from './pieces'

function FirstSender({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const sending = state.testEmailState === 'sending'
    const sent = state.testEmailState === 'sent'
    useEffect(() => {
        if (sent) {
            lemonToast.success(`Test email sent from ${derived.fromAddress}. Check your inbox.`)
        }
    }, [sent, derived.fromAddress])
    return (
        <section className="rounded-lg border bg-surface-primary p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
                <h2 className="m-0 text-lg font-semibold">Your first sender</h2>
                <p className="m-0 text-sm text-secondary">The name and address people see in their inbox.</p>
            </div>
            <div className="grid gap-3 @md:grid-cols-2">
                <div className="flex flex-col gap-1">
                    <label className="text-sm" htmlFor="focus-sender-name">
                        Name
                    </label>
                    <LemonInput
                        id="focus-sender-name"
                        value={state.senderName}
                        onChange={actions.setSenderName}
                        placeholder="Acme"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-sm" htmlFor="focus-sender-local">
                        Address
                    </label>
                    <LemonInput
                        id="focus-sender-local"
                        className="font-mono"
                        value={state.senderLocalPart}
                        onChange={actions.setSenderLocalPart}
                        placeholder="hello"
                        suffix={<span className="text-secondary whitespace-nowrap">@{derived.sendingDomain}</span>}
                    />
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded bg-fill-primary border px-3 py-2">
                <span className="text-sm min-w-0 break-all">
                    <span className="font-medium">{state.senderName || 'Your name'}</span>{' '}
                    <span className="text-secondary font-mono">&lt;{derived.fromAddress}&gt;</span>
                </span>
                <LemonButton
                    type={sent ? 'secondary' : 'primary'}
                    icon={sent ? <IconCheck /> : <IconSend />}
                    loading={sending}
                    disabledReason={sending ? 'Sending' : undefined}
                    onClick={actions.sendTestEmail}
                >
                    {sent ? 'Send another test' : 'Send me a test email'}
                </LemonButton>
            </div>
        </section>
    )
}

function RecordsInPlace({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived } = sim
    return (
        <LemonCollapse
            panels={[
                {
                    key: 'records',
                    header: (
                        <span className="flex items-center gap-2">
                            <IconCheck className="text-success" />
                            {derived.records.length} settings in place at {state.host?.name ?? 'your DNS host'}
                        </span>
                    ),
                    content: <RecordRows records={derived.records} showStatus />,
                },
            ]}
        />
    )
}

const WRANGLING_LINES = [
    'Wrangling your first workflow together…',
    'Dusting off the welcome template…',
    'Hooking up your sender…',
    'Teaching it to say hello…',
]

function useWranglingLine(active: boolean): string {
    const [index, setIndex] = useState(0)
    useEffect(() => {
        if (!active) {
            setIndex(0)
            return
        }
        const timer = setInterval(() => setIndex((i) => (i + 1) % WRANGLING_LINES.length), 900)
        return () => clearInterval(timer)
    }, [active])
    return WRANGLING_LINES[index]
}

function NextWorkflowCard({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const creating = state.firstWorkflowState === 'creating'
    const created = state.firstWorkflowState === 'created'
    const wranglingLine = useWranglingLine(creating)
    const Hoggie = creating || created ? HedgehogCowboyLasso : HedgehogMailbox
    return (
        <section
            className={clsx(
                'rounded-xl border p-6 @md:p-8 flex flex-col gap-5 transition-colors',
                created
                    ? 'border-success bg-gradient-to-br from-success-highlight via-surface-primary to-surface-primary'
                    : 'border-accent bg-gradient-to-br from-accent-highlight-secondary via-surface-primary to-surface-primary'
            )}
        >
            <div className="flex items-start gap-4">
                <Hoggie className={clsx('w-20 shrink-0', creating && 'motion-safe:animate-bounce')} />
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-xs uppercase tracking-wide text-secondary">{created ? 'Ready' : 'Next'}</span>
                    {created ? (
                        <>
                            <h2 className="m-0 text-xl font-semibold">Your first workflow is ready</h2>
                            <p className="m-0 text-sm text-secondary">
                                The welcome email goes out from{' '}
                                <span className="font-medium">{state.senderName || 'your sender'}</span>{' '}
                                <span className="font-mono">&lt;{derived.fromAddress}&gt;</span> whenever someone signs
                                up. Open it, tweak the words, switch it on.
                            </p>
                        </>
                    ) : (
                        <>
                            <h2 className="m-0 text-xl font-semibold">
                                Send your first email from {derived.sendingDomain}
                            </h2>
                            <p className="m-0 text-sm text-secondary">
                                Start with a welcome email that goes out when someone signs up. We open the Welcome
                                email sequence template with{' '}
                                <span className="font-medium">{state.senderName || 'your sender'}</span>{' '}
                                <span className="font-mono">&lt;{derived.fromAddress}&gt;</span> already filled in.
                            </p>
                        </>
                    )}
                </div>
            </div>
            {created ? (
                <BigAction
                    icon={<IconArrowRight />}
                    onClick={() => lemonToast.info('Would open the welcome workflow in the editor')}
                >
                    Go catch your customers
                </BigAction>
            ) : (
                <BigAction
                    icon={creating ? undefined : <IconPlus />}
                    loading={creating}
                    disabledReason={creating ? 'Almost there' : undefined}
                    onClick={actions.createFirstWorkflow}
                >
                    <span aria-live="polite">{creating ? wranglingLine : 'Create the welcome email workflow'}</span>
                </BigAction>
            )}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
                <Link onClick={() => lemonToast.info('Would open the template library')}>Pick another template</Link>
                <Link onClick={() => lemonToast.info('Would open the workflows list')}>Go to workflows</Link>
            </div>
        </section>
    )
}

export function VerifiedQuestion({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { derived } = sim
    return (
        <div className="flex flex-col gap-8">
            <div className="rounded-xl border border-success bg-gradient-to-br from-success-highlight via-surface-primary to-accent-highlight-secondary p-6 @md:p-8">
                <QuestionHeading
                    Hoggie={HedgehogRocket}
                    title={
                        <>
                            You can send from <span className="font-mono break-all">{derived.sendingDomain}</span>
                        </>
                    }
                    lead="All 7 settings are in place. Inboxes now know these emails really come from you."
                />
            </div>
            <FirstSender sim={sim} />
            <RecordsInPlace sim={sim} />
            <NextWorkflowCard sim={sim} />
        </div>
    )
}
