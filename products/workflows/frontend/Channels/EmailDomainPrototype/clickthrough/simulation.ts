// PROTOTYPE (throwaway): an in-memory fake of the email domain setup backend.
// Every click-through variant drives this one hook, so a variant is only a different way to render it.
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
    CLOUDFLARE,
    DnsHost,
    FREE_MAILBOX_DOMAINS,
    NAMECHEAP,
    PrototypeDnsRecord,
    ROUTE_53,
    TAKEN_BY_OTHER_ORG,
    buildRecords,
    nameFromDomain,
    normalizeDomainInput,
} from '../prototypeData'

export type HostKey = 'cloudflare' | 'route53' | 'namecheap' | 'unknown'
export type OutcomeKey = 'success' | 'stuck'
export type SpeedKey = 1 | 4

export type TrustKey = 'inline' | 'step4' | 'later' | 'checklist'

export interface SetupScenario {
    host: HostKey
    outcome: OutcomeKey
    speed: SpeedKey
    trust: TrustKey
}

export const TRUST_LABELS: Record<TrustKey, string> = {
    inline: 'Trust: next action under the ladder',
    step4: 'Trust: own step 4',
    later: 'Trust: later, on the domain page',
    checklist: 'Trust: checklist, no ladder',
}

export const HOSTS: Record<HostKey, DnsHost | null> = {
    cloudflare: CLOUDFLARE,
    route53: ROUTE_53,
    namecheap: NAMECHEAP,
    unknown: null,
}

export const HOST_LABELS: Record<HostKey, string> = {
    cloudflare: 'Cloudflare (auto-configure)',
    route53: 'Route 53 (named host)',
    namecheap: 'Namecheap (named host)',
    unknown: 'Unknown host',
}

export interface InferredDomain {
    domain: string
    reasons: string[]
    recommended: boolean
}

/** What the real wizard would pull from the project: event hosts, the login email, the project URLs. */
export const INFERRED_DOMAINS: InferredDomain[] = [
    {
        domain: 'acme.com',
        reasons: ['1.2M events came from acme.com in the last 30 days', 'Your login is jane@acme.com'],
        recommended: true,
    },
    {
        domain: 'app.acme.com',
        reasons: ['860k events came from app.acme.com in the last 30 days'],
        recommended: false,
    },
]

export interface SendPrefixOption {
    prefix: string
    label: string
    why: string
    recommended: boolean
}

export const SEND_PREFIX_OPTIONS: SendPrefixOption[] = [
    {
        prefix: 'mail',
        label: 'mail.',
        why: 'Keeps your main domain safe if a campaign ever lands in spam.',
        recommended: true,
    },
    { prefix: 'send', label: 'send.', why: 'Same protection, different name.', recommended: false },
    {
        prefix: '',
        label: 'No subdomain',
        why: 'Send straight from the main domain. One bad campaign can hurt your login and support emails too.',
        recommended: false,
    },
]

export type SetupPhase = 'domain' | 'records' | 'verifying' | 'verified'
export type RecordState = 'pending' | 'found' | 'verified' | 'missing'
export type DomainProblem = 'free_mailbox' | 'taken_by_other_org' | 'invalid' | null

export interface SetupStep {
    key: 'added' | 'found' | 'verified'
    label: string
    detail: string
    state: 'done' | 'active' | 'todo' | 'stuck'
}

export interface SetupState {
    phase: SetupPhase
    rootDomain: string | null
    customDomainInput: string
    sendPrefix: string
    bouncePrefix: string
    host: DnsHost | null
    hostDetected: boolean
    recordsRevealed: boolean
    checking: boolean
    recordStates: RecordState[]
    pollingStopped: boolean
    checksRun: number
    stuckResolved: boolean
    cloudflareOverlayOpen: boolean
    autoConfigured: boolean
    agentModalOpen: boolean
    computerUse: boolean
    senderName: string
    senderLocalPart: string
    testEmailState: 'idle' | 'sending' | 'sent'
    reportAddress: string
    dmarcPolicy: 'none' | 'quarantine'
    oneClickUnsubscribe: boolean
}

const RECORD_COUNT = 7
const STUCK_RECORD_INDEX = 6

const initialState = (): SetupState => ({
    phase: 'domain',
    rootDomain: null,
    customDomainInput: '',
    sendPrefix: 'mail',
    bouncePrefix: 'feedback',
    host: null,
    hostDetected: false,
    recordsRevealed: false,
    checking: false,
    recordStates: Array(RECORD_COUNT).fill('pending'),
    pollingStopped: false,
    checksRun: 0,
    stuckResolved: false,
    cloudflareOverlayOpen: false,
    autoConfigured: false,
    agentModalOpen: false,
    computerUse: false,
    senderName: '',
    senderLocalPart: 'hello',
    testEmailState: 'idle',
    reportAddress: '',
    dmarcPolicy: 'none',
    oneClickUnsubscribe: false,
})

export interface SetupDerived {
    sendingDomain: string | null
    mailFromDomain: string | null
    fromAddress: string | null
    records: PrototypeDnsRecord[]
    foundCount: number
    allFound: boolean
    missingRecords: PrototypeDnsRecord[]
    customDomainProblem: DomainProblem
    customDomainNormalized: string
    steps: SetupStep[]
    ladderLevel: 0 | 1 | 2 | 3 | 4 | 5
    hostKey: HostKey
}

export interface SetupActions {
    chooseDomain: (domain: string) => void
    clearDomain: () => void
    setCustomDomainInput: (value: string) => void
    setSendPrefix: (prefix: string) => void
    setBouncePrefix: (prefix: string) => void
    continueToRecords: () => void
    backToDomain: () => void
    openCloudflareApproval: () => void
    cancelCloudflareApproval: () => void
    approveCloudflare: () => void
    revealRecords: () => void
    markRecordsAdded: () => void
    checkAgain: () => void
    openAgentModal: () => void
    closeAgentModal: () => void
    setComputerUse: (value: boolean) => void
    setSenderName: (value: string) => void
    setSenderLocalPart: (value: string) => void
    sendTestEmail: () => void
    setReportAddress: (value: string) => void
    setDmarcPolicy: (value: 'none' | 'quarantine') => void
    setOneClickUnsubscribe: (value: boolean) => void
    reset: () => void
}

export interface SetupSimulation {
    state: SetupState
    derived: SetupDerived
    actions: SetupActions
    scenario: SetupScenario
}

const detectProblem = (domain: string): DomainProblem => {
    if (!domain) {
        return null
    }
    if (FREE_MAILBOX_DOMAINS.has(domain)) {
        return 'free_mailbox'
    }
    if (TAKEN_BY_OTHER_ORG.has(domain)) {
        return 'taken_by_other_org'
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
        return 'invalid'
    }
    return null
}

const recordStateToStatus = (state: RecordState): PrototypeDnsRecord['status'] => state

const ladderLevelFor = (state: SetupState): SetupDerived['ladderLevel'] => {
    if (state.phase !== 'verified') {
        return 0
    }
    if (!state.reportAddress) {
        return 2
    }
    if (state.dmarcPolicy === 'none') {
        return 3
    }
    return state.oneClickUnsubscribe ? 5 : 4
}

export function useSetupSimulation(scenario: SetupScenario): SetupSimulation {
    const [state, setState] = useState<SetupState>(initialState)
    const speed = scenario.speed
    const ms = useCallback((base: number): number => Math.max(120, Math.round(base / speed)), [speed])

    const derived = useMemo<SetupDerived>(() => {
        const root = state.rootDomain
        const sendingDomain = root ? (state.sendPrefix ? `${state.sendPrefix}.${root}` : root) : null
        const mailFromDomain = sendingDomain ? `${state.bouncePrefix || 'feedback'}.${sendingDomain}` : null
        const fromAddress = sendingDomain ? `${state.senderLocalPart || 'hello'}@${sendingDomain}` : null
        const records = sendingDomain
            ? buildRecords(sendingDomain, state.bouncePrefix || 'feedback', 'pending').map((record, index) => ({
                  ...record,
                  status: recordStateToStatus(state.recordStates[index]),
              }))
            : []
        const foundCount = records.filter((r) => r.status === 'found' || r.status === 'verified').length
        const allFound = records.length > 0 && foundCount === records.length
        const missingRecords = records.filter((r) => r.status === 'missing')
        const { domain: customDomainNormalized } = normalizeDomainInput(state.customDomainInput)
        const customDomainProblem = detectProblem(customDomainNormalized)

        const verified = state.phase === 'verified'
        const addedDone = state.phase !== 'domain'
        const foundState: SetupStep['state'] = verified
            ? 'done'
            : state.pollingStopped
              ? 'stuck'
              : allFound
                ? 'done'
                : addedDone
                  ? 'active'
                  : 'todo'
        const verifiedState: SetupStep['state'] = verified ? 'done' : allFound ? 'active' : 'todo'
        const steps: SetupStep[] = [
            {
                key: 'added',
                label: 'Domain added',
                detail: sendingDomain ?? 'Pick the domain your emails come from',
                state: addedDone ? 'done' : 'active',
            },
            {
                key: 'found',
                label: 'Settings found at your DNS host',
                detail: addedDone ? `${foundCount} of ${records.length} found` : `${RECORD_COUNT} settings to add`,
                state: foundState,
            },
            {
                key: 'verified',
                label: 'Ready to send',
                detail: verified ? 'Inboxes trust your emails' : 'Takes about a minute after the settings are found',
                state: verifiedState,
            },
        ]
        return {
            sendingDomain,
            mailFromDomain,
            fromAddress,
            records,
            foundCount,
            allFound,
            missingRecords,
            customDomainProblem,
            customDomainNormalized,
            steps,
            ladderLevel: ladderLevelFor(state),
            hostKey: scenario.host,
        }
    }, [state, scenario.host])

    const stuck = scenario.outcome === 'stuck' && !state.stuckResolved

    useEffect(() => {
        if (!state.checking || state.pollingStopped || state.phase === 'verified' || state.phase === 'domain') {
            return
        }
        const nextPending = state.recordStates.findIndex(
            (recordState, index) => recordState === 'pending' && !(stuck && index === STUCK_RECORD_INDEX)
        )
        const pace = state.phase === 'records' ? 9000 : state.autoConfigured ? 350 : 700
        if (nextPending >= 0) {
            const timer = setTimeout(() => {
                setState((prev) => {
                    const recordStates = [...prev.recordStates]
                    recordStates[nextPending] = 'found'
                    const phase = prev.phase === 'records' ? 'verifying' : prev.phase
                    return { ...prev, recordStates, phase }
                })
            }, ms(pace))
            return () => clearTimeout(timer)
        }
        if (stuck && state.recordStates[STUCK_RECORD_INDEX] === 'pending') {
            const timer = setTimeout(() => {
                setState((prev) => {
                    const recordStates = [...prev.recordStates]
                    recordStates[STUCK_RECORD_INDEX] = 'missing'
                    return { ...prev, recordStates, checking: false, pollingStopped: true, phase: 'verifying' }
                })
            }, ms(2600))
            return () => clearTimeout(timer)
        }
        const timer = setTimeout(() => {
            setState((prev) => ({
                ...prev,
                recordStates: prev.recordStates.map(() => 'verified'),
                checking: false,
                phase: 'verified',
                senderName: prev.senderName || nameFromDomain(prev.rootDomain ?? ''),
            }))
        }, ms(1800))
        return () => clearTimeout(timer)
    }, [state.checking, state.pollingStopped, state.phase, state.recordStates, state.autoConfigured, stuck, ms])

    useEffect(() => {
        if (state.phase !== 'records' || state.hostDetected) {
            return
        }
        const timer = setTimeout(() => {
            setState((prev) => ({ ...prev, host: HOSTS[scenario.host], hostDetected: true }))
        }, ms(900))
        return () => clearTimeout(timer)
    }, [state.phase, state.hostDetected, scenario.host, ms])

    useEffect(() => {
        if (state.testEmailState !== 'sending') {
            return
        }
        const timer = setTimeout(() => setState((prev) => ({ ...prev, testEmailState: 'sent' })), ms(1200))
        return () => clearTimeout(timer)
    }, [state.testEmailState, ms])

    const actions = useMemo<SetupActions>(
        () => ({
            chooseDomain: (domain) => setState((prev) => ({ ...prev, rootDomain: domain })),
            clearDomain: () => setState((prev) => ({ ...prev, rootDomain: null })),
            setCustomDomainInput: (value) => setState((prev) => ({ ...prev, customDomainInput: value })),
            setSendPrefix: (prefix) => setState((prev) => ({ ...prev, sendPrefix: prefix })),
            setBouncePrefix: (prefix) => setState((prev) => ({ ...prev, bouncePrefix: prefix })),
            continueToRecords: () =>
                setState((prev) => (prev.rootDomain ? { ...prev, phase: 'records', hostDetected: false } : prev)),
            backToDomain: () =>
                setState((prev) => ({
                    ...prev,
                    phase: 'domain',
                    checking: false,
                    recordsRevealed: false,
                    recordStates: Array(RECORD_COUNT).fill('pending'),
                    pollingStopped: false,
                })),
            openCloudflareApproval: () => setState((prev) => ({ ...prev, cloudflareOverlayOpen: true })),
            cancelCloudflareApproval: () => setState((prev) => ({ ...prev, cloudflareOverlayOpen: false })),
            approveCloudflare: () =>
                setState((prev) => ({
                    ...prev,
                    cloudflareOverlayOpen: false,
                    autoConfigured: true,
                    phase: 'verifying',
                    checking: true,
                    recordsRevealed: true,
                })),
            revealRecords: () => setState((prev) => ({ ...prev, recordsRevealed: true, checking: true })),
            markRecordsAdded: () =>
                setState((prev) => ({ ...prev, phase: 'verifying', checking: true, recordsRevealed: true })),
            checkAgain: () =>
                setState((prev) => ({
                    ...prev,
                    checking: true,
                    pollingStopped: false,
                    checksRun: prev.checksRun + 1,
                    stuckResolved: prev.checksRun >= 1,
                    recordStates: prev.recordStates.map((s) => (s === 'missing' ? 'pending' : s)),
                })),
            openAgentModal: () => setState((prev) => ({ ...prev, agentModalOpen: true })),
            closeAgentModal: () => setState((prev) => ({ ...prev, agentModalOpen: false })),
            setComputerUse: (value) => setState((prev) => ({ ...prev, computerUse: value })),
            setSenderName: (value) => setState((prev) => ({ ...prev, senderName: value })),
            setSenderLocalPart: (value) => setState((prev) => ({ ...prev, senderLocalPart: value })),
            sendTestEmail: () => setState((prev) => ({ ...prev, testEmailState: 'sending' })),
            setReportAddress: (value) => setState((prev) => ({ ...prev, reportAddress: value })),
            setDmarcPolicy: (value) => setState((prev) => ({ ...prev, dmarcPolicy: value })),
            setOneClickUnsubscribe: (value) => setState((prev) => ({ ...prev, oneClickUnsubscribe: value })),
            reset: () => setState(initialState()),
        }),
        []
    )

    return { state, derived, actions, scenario }
}
