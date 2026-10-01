// PROTOTYPE (throwaway): Max walks the user through the email domain setup as a chat. The transcript is derived from the simulation state.
import { ReactNode, useEffect, useRef, useState } from 'react'

import { LemonTag, Spinner, lemonToast } from '@posthog/lemon-ui'

import { LadderLevel, SenderSecurityLadder } from '../../SenderSecurityLadder'
import {
    HedgehogClimber,
    HedgehogDeskWizard,
    HedgehogHourglass,
    HedgehogMagnifyingGlass,
    HedgehogMailbox,
    HedgehogPanic,
    HedgehogRocket,
    HedgehogSuccess,
    HedgehogWizard,
} from '../shared/hoggies'
import { INFERRED_DOMAINS, SetupSimulation } from '../simulation'
import { Chip, Chips, Hoggie, MaxBubble, StepsTimeline, TopBar, UserBubble } from './bubbles'
import { CustomDomainRow, RecordsCard, SenderCard, SubdomainPicker } from './cards'

const USER_EMAIL = 'jane@acme.com'

interface TranscriptItem {
    key: string
    from: 'max' | 'user'
    hoggie?: Hoggie
    wide?: boolean
    render: (active: boolean) => ReactNode
}

interface LocalChoices {
    customOpen: boolean
    subdomainOpen: boolean
    addedClicked: boolean
    testSkipped: boolean
}

const NO_CHOICES: LocalChoices = { customOpen: false, subdomainOpen: false, addedClicked: false, testSkipped: false }

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1)

function statusLabel(sim: SetupSimulation): string {
    const { state, derived } = sim
    switch (state.phase) {
        case 'domain':
            return state.rootDomain ? 'Picking a subdomain' : 'Picking a domain'
        case 'records':
            return state.hostDetected ? 'Adding settings' : 'Finding your DNS host'
        case 'verifying':
            return state.pollingStopped
                ? 'One setting missing'
                : `Checking ${derived.foundCount} of ${derived.records.length}`
        case 'verified':
            return 'Ready to send'
    }
}

export function MaxVariant({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const [choices, setChoices] = useState<LocalChoices>(NO_CHOICES)
    const [ladderOverride, setLadderOverride] = useState<LadderLevel | null>(null)
    const choose = (patch: Partial<LocalChoices>): void => setChoices((prev) => ({ ...prev, ...patch }))
    const endRef = useRef<HTMLDivElement>(null)

    const hostNeedsManualRecords = state.hostDetected && !state.host?.supportsDomainConnect
    useEffect(() => {
        if (state.phase === 'records' && hostNeedsManualRecords && !state.recordsRevealed) {
            actions.revealRecords()
        }
    }, [state.phase, hostNeedsManualRecords, state.recordsRevealed, actions])

    useEffect(() => {
        if (state.phase === 'domain' && !state.rootDomain) {
            setChoices(NO_CHOICES)
            setLadderOverride(null)
        }
    }, [state.phase, state.rootDomain])

    useEffect(() => {
        if (state.testEmailState === 'sent') {
            lemonToast.success(`Test email sent to ${USER_EMAIL}`)
        }
    }, [state.testEmailState])

    const items = buildTranscript(sim, choices, choose, ladderOverride ?? derived.ladderLevel, setLadderOverride)
    const lastMaxIndex = items.map((item) => item.from).lastIndexOf('max')
    const scrollKey = `${items.map((item) => item.key).join('|')}:${choices.customOpen}:${choices.subdomainOpen}:${derived.foundCount}`

    useEffect(() => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' })
    }, [scrollKey])

    return (
        <div className="min-h-full bg-gradient-to-b from-accent-highlight-secondary/40 to-primary">
            <TopBar
                status={statusLabel(sim)}
                ladderLevel={state.phase === 'verified' ? (ladderOverride ?? derived.ladderLevel) : null}
            />
            <div className="max-w-176 mx-auto px-4 pt-6 pb-28 flex flex-col gap-4">
                {items.map((item, index) =>
                    item.from === 'user' ? (
                        <UserBubble key={item.key}>{item.render(false)}</UserBubble>
                    ) : (
                        <MaxBubble key={item.key} hoggie={item.hoggie ?? HedgehogWizard} wide={item.wide}>
                            {item.render(index === lastMaxIndex)}
                        </MaxBubble>
                    )
                )}
                <div ref={endRef} />
            </div>
        </div>
    )
}

function buildTranscript(
    sim: SetupSimulation,
    choices: LocalChoices,
    choose: (patch: Partial<LocalChoices>) => void,
    ladderLevel: LadderLevel,
    onLadderChange: (level: LadderLevel) => void
): TranscriptItem[] {
    const { state, derived, actions } = sim
    const items: TranscriptItem[] = []
    const max = (key: string, hoggie: Hoggie, render: (active: boolean) => ReactNode, wide = false): void => {
        items.push({ key, from: 'max', hoggie, wide, render })
    }
    const user = (key: string, text: string): void => items.push({ key, from: 'user', render: () => text })
    const root = state.rootDomain ?? 'your domain'
    const hostName = state.host?.name ?? 'your DNS host'
    const agentChip: Chip = { label: 'Hand it to my coding agent', onClick: actions.openAgentModal }
    const openHostChip: Chip | null = state.host
        ? { label: `Open ${state.host.name}`, to: state.host.dnsSettingsUrl }
        : null

    const [primary, alternative] = INFERRED_DOMAINS
    max('domain', HedgehogMailbox, (active) => (
        <>
            <p className="m-0 text-sm">
                Hi! I noticed {lowerFirst(primary.reasons[0])}, and {lowerFirst(primary.reasons[1])}. Want to send email
                from <strong>{primary.domain}</strong>?
            </p>
            <Chips
                active={active}
                chips={[
                    {
                        label: `Yes, use ${primary.domain}`,
                        primary: true,
                        onClick: () => actions.chooseDomain(primary.domain),
                    },
                    { label: `Use ${alternative.domain}`, onClick: () => actions.chooseDomain(alternative.domain) },
                    { label: 'Another domain…', onClick: () => choose({ customOpen: true }) },
                ]}
            />
            {active && choices.customOpen && <CustomDomainRow sim={sim} />}
        </>
    ))
    if (!state.rootDomain) {
        return items
    }
    user('domain-echo', `Use ${state.rootDomain}`)

    max('subdomain', HedgehogWizard, (active) => (
        <>
            <p className="m-0 text-sm">
                {state.sendPrefix
                    ? `Great. I'll send from ${derived.sendingDomain} so your main domain stays safe if a campaign ever lands in spam.`
                    : `I'll send straight from ${root}. One bad campaign can hurt your login and support emails too.`}{' '}
                Emails will come from <strong>{derived.fromAddress}</strong>.
            </p>
            {active && choices.subdomainOpen && <SubdomainPicker sim={sim} />}
            <Chips
                active={active}
                chips={[
                    { label: 'Sounds good', primary: true, onClick: actions.continueToRecords },
                    ...(choices.subdomainOpen
                        ? [{ label: 'Pick a different domain', onClick: actions.clearDomain }]
                        : [{ label: 'Change the subdomain', onClick: () => choose({ subdomainOpen: true }) }]),
                ]}
            />
        </>
    ))
    if (state.phase === 'domain') {
        return items
    }
    user(
        'subdomain-echo',
        state.sendPrefix === 'mail' && state.bouncePrefix === 'feedback'
            ? 'Sounds good'
            : `Send from ${derived.sendingDomain}`
    )

    if (!state.hostDetected) {
        max('detecting', HedgehogMagnifyingGlass, () => (
            <p className="m-0 text-sm flex items-center gap-2">
                <Spinner className="text-base" /> Looking up where {root}'s DNS lives…
            </p>
        ))
        return items
    }

    const recordsBody = (active: boolean, intro: string): ReactNode => (
        <>
            <p className="m-0 text-sm">{intro}</p>
            <p className="m-0 text-xs text-secondary">
                DNS is the address book for your domain. These 7 entries tell inboxes that PostHog may send for you.
            </p>
            <RecordsCard records={derived.records} live={state.recordsRevealed} />
            {state.host?.gotcha && <p className="m-0 text-xs text-secondary">{state.host.gotcha}</p>}
            <Chips
                active={active}
                chips={[
                    ...(openHostChip ? [openHostChip] : []),
                    {
                        label: "I've added them",
                        primary: true,
                        onClick: () => {
                            choose({ addedClicked: true })
                            actions.markRecordsAdded()
                        },
                    },
                    agentChip,
                ]}
            />
        </>
    )

    if (state.host?.supportsDomainConnect) {
        max('host', HedgehogWizard, (active) => (
            <>
                <p className="m-0 text-sm">
                    It's at <strong>{hostName}</strong>. I can add the 7 settings for you, you only approve it once.
                </p>
                <Chips
                    active={active}
                    chips={[
                        { label: 'Add them for me', primary: true, onClick: actions.openCloudflareApproval },
                        { label: "I'll do it myself", onClick: actions.revealRecords },
                        agentChip,
                    ]}
                />
            </>
        ))
        if (state.autoConfigured) {
            user('host-echo', 'Add them for me')
        } else if (state.recordsRevealed) {
            user('host-echo', "I'll do it myself")
            max(
                'records',
                HedgehogDeskWizard,
                (active) =>
                    recordsBody(
                        active,
                        `Here are the 7 settings. Add them at ${hostName} and I'll keep checking in the background.`
                    ),
                true
            )
        }
    } else {
        max(
            'records',
            HedgehogDeskWizard,
            (active) =>
                recordsBody(
                    active,
                    state.host
                        ? `It's at ${hostName}. Here are the 7 settings.`
                        : `I couldn't tell where your DNS lives. Here are the settings, add them wherever you manage ${root}.`
                ),
            true
        )
    }
    if (choices.addedClicked) {
        user('added-echo', "I've added them")
    }
    if (state.phase === 'records') {
        return items
    }

    const unresolved = derived.records.find((record) => record.status !== 'found' && record.status !== 'verified')
    for (let round = 0; round < state.checksRun; round++) {
        max(`round-${round}`, HedgehogHourglass, () => (
            <p className="m-0 text-sm">
                I looked and found all but one. The setting at <strong>{unresolved?.name ?? 'one place'}</strong> was
                still missing.
            </p>
        ))
        user(`round-${round}-echo`, 'Check again')
    }
    max('verifying', HedgehogHourglass, () => (
        <>
            <p className="m-0 text-sm">
                {state.autoConfigured
                    ? `${hostName} added all 7. Checking them now.`
                    : state.checksRun > 0
                      ? 'Looking again.'
                      : 'Checking your settings. This usually takes a minute.'}
            </p>
            <StepsTimeline steps={derived.steps} />
        </>
    ))
    if (state.pollingStopped) {
        max(
            'stuck',
            HedgehogPanic,
            (active) => (
                <>
                    <p className="m-0 text-sm">
                        One setting is still missing: the one at <strong>{derived.missingRecords[0]?.name}</strong>. Add
                        it and I'll look again.
                    </p>
                    <RecordsCard records={derived.missingRecords} live />
                    <Chips
                        active={active}
                        chips={[
                            { label: 'Check again', primary: true, onClick: actions.checkAgain },
                            ...(openHostChip ? [openHostChip] : []),
                            agentChip,
                        ]}
                    />
                </>
            ),
            true
        )
    }
    if (state.phase !== 'verified') {
        return items
    }

    max('verified', HedgehogSuccess, () => (
        <div className="flex flex-col items-center gap-2 text-center">
            <HedgehogSuccess className="w-36" loading="eager" />
            <LemonTag type="success">Verified</LemonTag>
            <p className="m-0 text-base font-semibold">You're ready to send from {derived.sendingDomain}!</p>
        </div>
    ))
    const sending = state.testEmailState === 'sending'
    max(
        'sender',
        HedgehogRocket,
        (active) => (
            <>
                <p className="m-0 text-sm">Who should emails come from?</p>
                <SenderCard sim={sim} />
                <Chips
                    active={active}
                    chips={[
                        {
                            label: 'Send me a test email',
                            primary: true,
                            loading: sending,
                            disabledReason: sending
                                ? 'Sending…'
                                : state.testEmailState === 'sent'
                                  ? 'Already sent'
                                  : null,
                            onClick: actions.sendTestEmail,
                        },
                        { label: 'Skip the test', onClick: () => choose({ testSkipped: true }) },
                    ]}
                />
            </>
        ),
        true
    )
    if (state.testEmailState !== 'idle') {
        user('sender-echo', 'Send me a test email')
    } else if (choices.testSkipped) {
        user('sender-echo', 'Skip the test')
    }
    if (state.testEmailState === 'sent' || choices.testSkipped) {
        max(
            'ladder',
            HedgehogClimber,
            () => (
                <>
                    <p className="m-0 text-sm">
                        {state.testEmailState === 'sent' ? `Sent to ${USER_EMAIL}. ` : ''}You're at level {ladderLevel}{' '}
                        of 5 on sender trust. Want to climb?
                    </p>
                    <SenderSecurityLadder level={ladderLevel} onLevelChange={onLadderChange} />
                </>
            ),
            true
        )
    }
    return items
}
