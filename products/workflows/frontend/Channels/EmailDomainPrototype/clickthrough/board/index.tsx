// PROTOTYPE (throwaway): "Board" variant, the whole email domain setup on one page as a mission checklist.
import clsx from 'clsx'

import { IconCheck } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { HedgehogMailbox } from '../shared/hoggies'
import { SetupPhase, SetupSimulation } from '../simulation'
import { DomainSection, RecordsSection, SenderSection, VerificationSection } from './sections'
import { TrustRail } from './TrustRail'

const PHASE_INDEX: Record<SetupPhase, number> = { domain: 1, records: 2, verifying: 3, verified: 4 }

type SectionMood = 'done' | 'active' | 'future'

interface SectionCardProps {
    number: number
    title: string
    mood: SectionMood
    summary?: React.ReactNode
    preview: React.ReactNode
    onChange?: () => void
    children: React.ReactNode
}

function SectionNumber({ number, mood }: { number: number; mood: SectionMood }): JSX.Element {
    return (
        <span
            className={clsx(
                'flex items-center justify-center size-7 rounded-full text-sm font-semibold shrink-0',
                mood === 'done' && 'bg-success-highlight text-success border border-success',
                mood === 'active' && 'bg-accent text-primary-inverse',
                mood === 'future' && 'bg-fill-primary text-secondary border'
            )}
            aria-hidden
        >
            {mood === 'done' ? <IconCheck /> : number}
        </span>
    )
}

function SectionCard({ number, title, mood, summary, preview, onChange, children }: SectionCardProps): JSX.Element {
    if (mood === 'active') {
        return (
            <section
                className="flex rounded-lg border border-accent bg-surface-primary overflow-hidden shadow-sm"
                aria-current="step"
            >
                <div className="w-1.5 bg-accent shrink-0" />
                <div className="flex flex-col grow min-w-0">
                    <header className="flex items-center gap-3 px-4 py-3 bg-accent-highlight-secondary border-b">
                        <SectionNumber number={number} mood={mood} />
                        <h2 className="m-0 text-base font-semibold">{title}</h2>
                    </header>
                    <div className="p-4">{children}</div>
                </div>
            </section>
        )
    }
    return (
        <section
            className={clsx(
                'flex items-center gap-3 rounded-lg border bg-surface-primary px-4 py-3 min-w-0',
                mood === 'future' && 'opacity-60'
            )}
        >
            <SectionNumber number={number} mood={mood} />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0 grow">
                <span className={clsx('font-medium', mood === 'done' && 'text-secondary')}>{title}</span>
                <span className="text-sm text-secondary min-w-0 break-words">
                    {mood === 'done' ? summary : preview}
                </span>
            </div>
            {mood === 'done' && onChange && (
                <LemonButton size="xsmall" type="tertiary" onClick={onChange} data-attr="email-domain-board-change">
                    change
                </LemonButton>
            )}
        </section>
    )
}

function PageHeader({ sim }: { sim: SetupSimulation }): JSX.Element {
    const current = PHASE_INDEX[sim.state.phase]
    return (
        <header className="rounded-lg border bg-gradient-to-br from-accent-highlight-secondary via-surface-primary to-surface-primary p-5 @lg:p-6 flex items-center gap-4 @lg:gap-6">
            <HedgehogMailbox className="w-16 @lg:w-24 shrink-0" />
            <div className="flex flex-col gap-1 min-w-0">
                <h1 className="m-0 text-xl @lg:text-2xl font-bold">Send email from your own domain</h1>
                <p className="m-0 text-secondary text-sm @lg:text-base">
                    Four small jobs on one page. Max checks your work as you go, and an agent can take any job off your
                    hands.
                </p>
                <span className="text-xs text-muted">Job {current} of 4</span>
            </div>
        </header>
    )
}

export function BoardVariant({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const active = PHASE_INDEX[state.phase]
    const moodFor = (index: number): SectionMood => (index < active ? 'done' : index === active ? 'active' : 'future')

    return (
        <div className="flex flex-col gap-5 p-4 @lg:p-6 @3xl:p-8 max-w-320 mx-auto w-full">
            <PageHeader sim={sim} />
            <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-start">
                <div className="flex flex-col gap-3 grow min-w-0">
                    <SectionCard
                        number={1}
                        title="Domain"
                        mood={moodFor(1)}
                        summary={derived.sendingDomain}
                        preview=""
                        onChange={state.phase !== 'verified' ? actions.backToDomain : undefined}
                    >
                        <DomainSection sim={sim} />
                    </SectionCard>
                    <SectionCard
                        number={2}
                        title="Settings at your DNS host"
                        mood={moodFor(2)}
                        summary={
                            state.pollingStopped
                                ? `${derived.foundCount} of ${derived.records.length} found at ${state.host?.name ?? 'your DNS host'}`
                                : state.autoConfigured
                                  ? `Cloudflare added all ${derived.records.length} for you`
                                  : `${derived.records.length} settings added at ${state.host?.name ?? 'your DNS host'}`
                        }
                        preview="We'll find your DNS host and give you 7 settings to add. Some hosts let us add them for you."
                    >
                        <RecordsSection sim={sim} />
                    </SectionCard>
                    <SectionCard
                        number={3}
                        title="Verification"
                        mood={moodFor(3)}
                        summary="All settings found. Inboxes trust your emails."
                        preview={
                            <>
                                We'll check the settings and tell you when you're ready: domain added, settings found,
                                ready to send.
                            </>
                        }
                    >
                        <VerificationSection sim={sim} />
                    </SectionCard>
                    <SectionCard
                        number={4}
                        title="First sender"
                        mood={moodFor(4)}
                        preview="Name your first sender and send yourself a test email."
                    >
                        <SenderSection sim={sim} />
                    </SectionCard>
                </div>
                <aside className="w-full @3xl:w-80 @3xl:shrink-0 @3xl:sticky @3xl:top-4">
                    <TrustRail sim={sim} />
                </aside>
            </div>
        </div>
    )
}
