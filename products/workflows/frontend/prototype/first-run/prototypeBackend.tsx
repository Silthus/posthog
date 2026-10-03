// PROTOTYPE ONLY (ticket silthus/posthog#212). In-memory stand-in for the backend so the first-run
// variants can be clicked through. Nothing here persists or talks to an API.
import { ReactNode, createContext, useContext, useMemo, useReducer, useState } from 'react'

export type EmailCoverage = 'all' | 'some' | 'none'
export type EventCoverage = 'rich' | 'pageviews-only' | 'none'

export interface Scenario {
    /** When true, DNS resolves the moment the team adds its domain. When false, it stays pending (up to 48h in life). */
    domainVerifiesInstantly: boolean
    emailCoverage: EmailCoverage
    eventCoverage: EventCoverage
}

export const DEFAULT_SCENARIO: Scenario = {
    domainVerifiesInstantly: false,
    emailCoverage: 'some',
    eventCoverage: 'pageviews-only',
}

export const SIGNED_IN_USER = { name: 'Ada', email: 'ada@example.com' }
export const TEAM_DOMAIN = 'example.com'
export const SANDBOX_SENDER = 'PostHog sandbox <no-reply@sandbox.example>'
export const DOMAIN_SENDER = `Ada from Example <hello@${TEAM_DOMAIN}>`

export type SenderState = 'sandbox' | 'domain-pending' | 'domain-verified'
export type MessageKind = 'workflow' | 'broadcast'

export interface StarterTemplate {
    id: string
    name: string
    description: string
    kind: MessageKind
    triggerEvent: string | null
    triggerLabel: string
    subject: string
    steps: string[]
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
    {
        id: 'welcome',
        name: 'Welcome email sequence',
        description: 'Greet new users and follow up with tips two days later.',
        kind: 'workflow',
        triggerEvent: 'signed_up',
        triggerLabel: 'When a person signs up',
        subject: 'Welcome to Example',
        steps: ['Trigger: signed_up', 'Email: Welcome', 'Wait 2 days', 'Email: Three tips', 'Exit'],
    },
    {
        id: 'onboarding-stuck',
        name: 'Onboarding started but not completed',
        description: 'Nudge people who start onboarding and go quiet for a day.',
        kind: 'workflow',
        triggerEvent: 'onboarding_started',
        triggerLabel: 'When onboarding starts',
        subject: 'Need a hand finishing setup?',
        steps: [
            'Trigger: onboarding_started',
            'Wait 1 day',
            'Branch: onboarding_completed?',
            'Email: Finish setup',
            'Exit',
        ],
    },
    {
        id: 'trial-ending',
        name: 'Trial ending reminder',
        description: 'Remind trial users three days before the trial ends.',
        kind: 'workflow',
        triggerEvent: 'trial_started',
        triggerLabel: 'When a trial starts',
        subject: 'Your trial ends in 3 days',
        steps: ['Trigger: trial_started', 'Wait 11 days', 'Email: Trial ending', 'Exit'],
    },
    {
        id: 're-engagement',
        name: 'Re-engagement',
        description: 'Reach people who have not visited in 14 days.',
        kind: 'workflow',
        triggerEvent: '$pageview',
        triggerLabel: 'When a person goes quiet',
        subject: 'We saved your spot',
        steps: ['Trigger: $pageview', 'Wait 14 days', 'Branch: visited since?', 'Email: Come back', 'Exit'],
    },
    {
        id: 'announce',
        name: 'Announce a new feature',
        description: 'One email to everyone, sent once.',
        kind: 'broadcast',
        triggerEvent: null,
        triggerLabel: 'Send once to a list',
        subject: 'New: scheduled reports',
        steps: ['Recipients', 'Email: Announcement', 'Schedule', 'Send'],
    },
]

export const BLANK_TEMPLATE: StarterTemplate = {
    id: 'blank',
    name: 'Blank workflow',
    description: 'Start from an empty canvas.',
    kind: 'workflow',
    triggerEvent: null,
    triggerLabel: 'You choose',
    subject: 'Hello from Example',
    steps: ['Trigger', 'Exit'],
}

const PROJECT_EVENTS: Record<EventCoverage, string[]> = {
    none: [],
    'pageviews-only': ['$pageview', '$autocapture', '$identify'],
    rich: ['$pageview', '$identify', 'signed_up', 'onboarding_started', 'onboarding_completed', 'trial_started'],
}

const PEOPLE_TOTAL = 1240
const PEOPLE_WITH_EMAIL: Record<EmailCoverage, number> = { all: 1240, some: 860, none: 0 }

export interface SentMessage {
    id: number
    minute: number
    subject: string
    via: 'sandbox' | 'domain'
    to: string
    recipients: number
    outcome: 'delivered' | 'blocked'
    note?: string
}

export interface CreatedMessage {
    id: number
    kind: MessageKind
    templateId: string
    name: string
    status: 'draft' | 'live'
}

export interface SimState {
    minute: number
    domainAdded: boolean
    sentLog: SentMessage[]
    created: CreatedMessage[]
}

const INITIAL_STATE: SimState = { minute: 0, domainAdded: false, sentLog: [], created: [] }

type SimAction =
    | { type: 'addDomain' }
    | { type: 'sendToMe'; subject: string }
    | { type: 'create'; template: StarterTemplate; kind?: MessageKind }
    | { type: 'goLive'; id: number; sender: SenderState; recipients: number }
    | { type: 'reset' }

let nextId = 1

function reduce(state: SimState, action: SimAction): SimState {
    switch (action.type) {
        case 'addDomain':
            return { ...state, minute: state.minute + 2, domainAdded: true }
        case 'sendToMe':
            return {
                ...state,
                minute: state.minute + 1,
                sentLog: [
                    ...state.sentLog,
                    {
                        id: nextId++,
                        minute: state.minute + 1,
                        subject: action.subject,
                        via: 'sandbox',
                        to: SIGNED_IN_USER.email,
                        recipients: 1,
                        outcome: 'delivered',
                    },
                ],
            }
        case 'create':
            return {
                ...state,
                minute: state.minute + 2,
                created: [
                    ...state.created,
                    {
                        id: nextId++,
                        kind: action.kind ?? action.template.kind,
                        templateId: action.template.id,
                        name: action.template.name,
                        status: 'draft',
                    },
                ],
            }
        case 'goLive': {
            const message = state.created.find((m) => m.id === action.id)
            if (!message) {
                return state
            }
            const template = findTemplate(message.templateId)
            const minute = state.minute + 1
            const entry: SentMessage =
                action.sender === 'domain-verified'
                    ? {
                          id: nextId++,
                          minute,
                          subject: template.subject,
                          via: 'domain',
                          to: `${action.recipients} people with an email`,
                          recipients: action.recipients,
                          outcome: action.recipients > 0 ? 'delivered' : 'blocked',
                          note: action.recipients > 0 ? undefined : 'Nobody in the audience has an email address.',
                      }
                    : {
                          id: nextId++,
                          minute,
                          subject: template.subject,
                          via: 'sandbox',
                          to: SIGNED_IN_USER.email,
                          recipients: 1,
                          outcome: 'delivered',
                          note: 'Sandbox sender: only you receive this until your domain is verified.',
                      }
            return {
                ...state,
                minute,
                created: state.created.map((m) => (m.id === action.id ? { ...m, status: 'live' } : m)),
                sentLog: [...state.sentLog, entry],
            }
        }
        case 'reset':
            return INITIAL_STATE
    }
}

export function findTemplate(id: string): StarterTemplate {
    return STARTER_TEMPLATES.find((t) => t.id === id) ?? BLANK_TEMPLATE
}

export interface Readiness {
    missingEvent: string | null
    peopleWithoutEmail: number
    nobodyHasEmail: boolean
    ready: boolean
}

export interface PrototypeBackend {
    scenario: Scenario
    setScenario: (patch: Partial<Scenario>) => void
    state: SimState
    sender: SenderState
    senderLabel: string
    projectEvents: string[]
    peopleTotal: number
    peopleWithEmail: number
    readiness: (template: StarterTemplate) => Readiness
    addDomain: () => void
    sendToMe: (template: StarterTemplate) => void
    create: (template: StarterTemplate, kind?: MessageKind) => void
    goLive: (id: number) => void
    reset: () => void
}

const BackendContext = createContext<PrototypeBackend | null>(null)

export function PrototypeBackendProvider({ children }: { children: ReactNode }): JSX.Element {
    const [scenario, setScenarioState] = useState<Scenario>(DEFAULT_SCENARIO)
    const [state, dispatch] = useReducer(reduce, INITIAL_STATE)

    const backend = useMemo<PrototypeBackend>(() => {
        const sender: SenderState = !state.domainAdded
            ? 'sandbox'
            : scenario.domainVerifiesInstantly
              ? 'domain-verified'
              : 'domain-pending'
        const projectEvents = PROJECT_EVENTS[scenario.eventCoverage]
        const peopleWithEmail = PEOPLE_WITH_EMAIL[scenario.emailCoverage]
        const readiness = (template: StarterTemplate): Readiness => {
            const missingEvent =
                template.triggerEvent && !projectEvents.includes(template.triggerEvent) ? template.triggerEvent : null
            const peopleWithoutEmail = PEOPLE_TOTAL - peopleWithEmail
            const nobodyHasEmail = peopleWithEmail === 0
            return { missingEvent, peopleWithoutEmail, nobodyHasEmail, ready: !missingEvent && !nobodyHasEmail }
        }
        return {
            scenario,
            setScenario: (patch) => setScenarioState((current) => ({ ...current, ...patch })),
            state,
            sender,
            senderLabel: sender === 'domain-verified' ? DOMAIN_SENDER : SANDBOX_SENDER,
            projectEvents,
            peopleTotal: PEOPLE_TOTAL,
            peopleWithEmail,
            readiness,
            addDomain: () => dispatch({ type: 'addDomain' }),
            sendToMe: (template) => dispatch({ type: 'sendToMe', subject: template.subject }),
            create: (template, kind) => dispatch({ type: 'create', template, kind }),
            goLive: (id) => dispatch({ type: 'goLive', id, sender, recipients: peopleWithEmail }),
            reset: () => dispatch({ type: 'reset' }),
        }
    }, [scenario, state])

    return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>
}

export function useBackend(): PrototypeBackend {
    const backend = useContext(BackendContext)
    if (!backend) {
        throw new Error('useBackend needs PrototypeBackendProvider')
    }
    return backend
}
