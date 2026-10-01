// PROTOTYPE (throwaway): Focus phase 4, the celebration, the first sender, the records and the trust hand-off.
import { useEffect } from 'react'

import { IconArrowRight, IconCheck, IconSend } from '@posthog/icons'
import { LemonButton, LemonCollapse, LemonInput, lemonToast } from '@posthog/lemon-ui'

import { HedgehogRocket } from '../shared/hoggies'
import { SetupSimulation } from '../simulation'
import { BigAction, QuestionHeading, RecordRows } from './pieces'
import { TrustChecklist, TrustInline } from './TrustOptions'

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

export interface VerifiedQuestionProps {
    sim: SetupSimulation
    onContinueToTrust: () => void
    onFinish: () => void
}

export function VerifiedQuestion({ sim, onContinueToTrust, onFinish }: VerifiedQuestionProps): JSX.Element {
    const { derived, scenario } = sim
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
            {scenario.trust === 'inline' && <TrustInline sim={sim} />}
            {scenario.trust === 'checklist' && <TrustChecklist sim={sim} />}
            {scenario.trust === 'step4' && (
                <div className="flex flex-col items-center gap-2">
                    <BigAction icon={<IconArrowRight />} onClick={onContinueToTrust}>
                        Continue to sender trust
                    </BigAction>
                    <span className="text-xs text-secondary">One more step. Two minutes, and optional.</span>
                </div>
            )}
            {scenario.trust === 'later' && (
                <div className="flex flex-col items-center gap-2">
                    <BigAction icon={<IconCheck />} onClick={onFinish}>
                        Finish
                    </BigAction>
                    <span className="text-xs text-secondary">
                        You can raise sender trust any time from the domain page.
                    </span>
                </div>
            )}
        </div>
    )
}
