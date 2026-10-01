// PROTOTYPE (throwaway): Focus phases 2 and 3, adding the settings and watching them get found.
import { useEffect } from 'react'

import { IconExternal, IconRefresh, IconSparkles } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { LemonProgress } from 'lib/lemon-ui/LemonProgress'

import { HedgehogHourglass, HedgehogMagnifyingGlass, HedgehogPanic, HedgehogWizard } from '../shared/hoggies'
import { SetupSimulation } from '../simulation'
import { BigAction, QuestionHeading, RecordRows, StepsStrip } from './pieces'

const RECORDS_EXPLAINER =
    'Each setting is a DNS record. Add them exactly as shown, name and value, and keep the rest of your DNS as it is.'

function AgentButton({ sim }: { sim: SetupSimulation }): JSX.Element {
    return (
        <LemonButton type="tertiary" icon={<IconSparkles />} onClick={sim.actions.openAgentModal}>
            Let an agent do it
        </LemonButton>
    )
}

function HostLink({ sim, primary }: { sim: SetupSimulation; primary?: boolean }): JSX.Element | null {
    const host = sim.state.host
    if (!host) {
        return null
    }
    return (
        <LemonButton
            type={primary ? 'primary' : 'tertiary'}
            size={primary ? 'large' : undefined}
            fullWidth={primary}
            center={primary}
            to={host.dnsSettingsUrl}
            targetBlank
            sideIcon={<IconExternal />}
        >
            Open {host.name}
        </LemonButton>
    )
}

function Gotcha({ sim }: { sim: SetupSimulation }): JSX.Element | null {
    const gotcha = sim.state.host?.gotcha
    return gotcha ? <p className="m-0 text-sm text-secondary text-center text-balance">Heads up: {gotcha}</p> : null
}

function CloudflareChoice({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2">
                <BigAction onClick={actions.openCloudflareApproval}>Add them to Cloudflare for me</BigAction>
                <span className="text-xs text-secondary">You approve it once in Cloudflare. Nothing else changes.</span>
                <div className="flex flex-wrap justify-center gap-1">
                    {!state.recordsRevealed && (
                        <LemonButton type="tertiary" onClick={actions.revealRecords}>
                            I'll add them myself
                        </LemonButton>
                    )}
                    <AgentButton sim={sim} />
                </div>
            </div>
            {state.recordsRevealed && (
                <div className="flex flex-col gap-3">
                    <p className="m-0 text-sm text-secondary text-center">{RECORDS_EXPLAINER}</p>
                    <RecordRows records={derived.records} showStatus />
                    <Gotcha sim={sim} />
                    <div className="flex flex-wrap justify-center gap-1">
                        <HostLink sim={sim} />
                        <LemonButton type="secondary" onClick={actions.markRecordsAdded}>
                            I've added them
                        </LemonButton>
                    </div>
                </div>
            )}
        </div>
    )
}

function ManualChoice({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    useEffect(() => {
        if (!state.recordsRevealed) {
            actions.revealRecords()
        }
    }, [state.recordsRevealed, actions])
    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col items-center gap-2">
                {state.host ? (
                    <>
                        <HostLink sim={sim} primary />
                        <LemonButton type="secondary" onClick={actions.markRecordsAdded}>
                            I've added them
                        </LemonButton>
                    </>
                ) : (
                    <BigAction onClick={actions.markRecordsAdded}>I've added them</BigAction>
                )}
                <AgentButton sim={sim} />
            </div>
            <Gotcha sim={sim} />
            <p className="m-0 text-sm text-secondary text-center">{RECORDS_EXPLAINER}</p>
            <RecordRows records={derived.records} showStatus />
        </div>
    )
}

export function RecordsQuestion({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const count = derived.records.length
    if (!state.hostDetected) {
        return (
            <div className="flex flex-col gap-8">
                <QuestionHeading
                    Hoggie={HedgehogMagnifyingGlass}
                    busy
                    title={`Finding where ${state.rootDomain}'s DNS lives…`}
                    lead="This tells us whether we can add the settings for you."
                />
                <div className="flex flex-col items-center gap-2">
                    <BigAction disabledReason="Still finding your DNS host">Add {count} settings</BigAction>
                    <LemonButton type="tertiary" size="small" onClick={actions.backToDomain}>
                        Back
                    </LemonButton>
                </div>
            </div>
        )
    }
    const hostName = state.host?.name ?? 'your DNS host'
    const lead = state.host
        ? state.host.supportsDomainConnect
            ? `${state.host.name} runs ${state.rootDomain}'s DNS and lets PostHog add settings for you.`
            : `${state.host.name} runs ${state.rootDomain}'s DNS. Add these there, then come back.`
        : `We could not tell who runs ${state.rootDomain}'s DNS. Open your DNS provider's settings and add these.`
    return (
        <div className="flex flex-col gap-8">
            <QuestionHeading Hoggie={HedgehogWizard} title={`Add ${count} settings at ${hostName}`} lead={lead} />
            {state.host?.supportsDomainConnect ? <CloudflareChoice sim={sim} /> : <ManualChoice sim={sim} />}
            <div className="flex flex-col gap-2">
                <span className="text-xs text-secondary text-center uppercase tracking-wide">What happens next</span>
                <StepsStrip steps={derived.steps} />
            </div>
            <LemonButton type="tertiary" size="small" className="self-center" onClick={actions.backToDomain}>
                Back to domain
            </LemonButton>
        </div>
    )
}

export function VerifyingQuestion({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const count = derived.records.length
    const stuck = state.pollingStopped
    const missing = derived.missingRecords.length
    const records = stuck
        ? [...derived.missingRecords, ...derived.records.filter((record) => record.status !== 'missing')]
        : derived.records
    return (
        <div className="flex flex-col gap-8">
            {stuck ? (
                <QuestionHeading
                    Hoggie={HedgehogPanic}
                    title={missing === 1 ? 'One setting is still missing' : `${missing} settings are still missing`}
                    lead={`We found ${derived.foundCount} of ${count}. Check the highlighted one at ${state.host?.name ?? 'your DNS host'}, then check again.`}
                />
            ) : (
                <QuestionHeading
                    Hoggie={HedgehogHourglass}
                    busy
                    title="Checking your settings…"
                    lead={
                        state.autoConfigured
                            ? 'Cloudflare added them. This usually takes under a minute.'
                            : 'DNS changes can take a few minutes to show up. You can leave this page and come back.'
                    }
                />
            )}
            <div className="flex flex-col gap-2">
                <LemonProgress
                    percent={(derived.foundCount / count) * 100}
                    size="large"
                    strokeColor={stuck ? 'var(--danger)' : 'var(--success)'}
                    bgColor="var(--border)"
                />
                <span className="text-sm text-secondary text-center">
                    {derived.foundCount} of {count} found
                </span>
            </div>
            <StepsStrip steps={derived.steps} />
            {stuck && (
                <div className="flex flex-col items-center gap-2">
                    <BigAction onClick={actions.checkAgain} icon={<IconRefresh />} loading={state.checking}>
                        Check again
                    </BigAction>
                    <div className="flex flex-wrap justify-center gap-1">
                        <AgentButton sim={sim} />
                        <HostLink sim={sim} />
                    </div>
                </div>
            )}
            <RecordRows records={records} showStatus />
            {!stuck && (
                <div className="flex flex-wrap justify-center gap-1">
                    <AgentButton sim={sim} />
                    <HostLink sim={sim} />
                </div>
            )}
        </div>
    )
}
