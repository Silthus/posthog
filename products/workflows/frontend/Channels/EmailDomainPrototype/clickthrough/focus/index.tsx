// PROTOTYPE (throwaway): "Focus" variant, one big question at a time in a centred column.
import clsx from 'clsx'
import { useEffect, useState } from 'react'

import { IconCheck } from '@posthog/icons'

import { SetupPhase, SetupSimulation, TrustKey } from '../simulation'
import { DomainQuestion } from './DomainQuestion'
import { RecordsQuestion, VerifyingQuestion } from './SettingsQuestions'
import { DomainPagePreview, DoneCard, TrustStep } from './TrustOptions'
import { VerifiedQuestion } from './VerifiedQuestion'

const STEPS: { label: string; phases: SetupPhase[] }[] = [
    { label: 'Domain', phases: ['domain'] },
    { label: 'Settings', phases: ['records', 'verifying'] },
    { label: 'Ready', phases: ['verified'] },
]

type FocusView = 'flow' | 'trust' | 'done' | 'domain_page'

const TRUST_STEP = { label: 'Trust', phases: [] as SetupPhase[] }

function StepIndicator({ phase, trust, view }: { phase: SetupPhase; trust: TrustKey; view: FocusView }): JSX.Element {
    const steps = trust === 'step4' ? [...STEPS, TRUST_STEP] : STEPS
    const currentIndex =
        view === 'done' ? steps.length : view === 'trust' ? 3 : steps.findIndex((step) => step.phases.includes(phase))
    return (
        <ol className="m-0 p-0 list-none flex items-center justify-center gap-2 text-xs" aria-label="Setup steps">
            {steps.map((step, index) => {
                const done = index < currentIndex
                const current = index === currentIndex
                return (
                    <li key={step.label} className="flex items-center gap-2">
                        {index > 0 && (
                            <span
                                className={clsx('w-6 border-t', done || current ? 'border-accent' : 'border-primary')}
                            />
                        )}
                        <span
                            className={clsx(
                                'inline-flex items-center justify-center w-5 h-5 rounded-full border font-semibold',
                                done && 'bg-success-highlight border-success text-success',
                                current && 'bg-accent text-white border-accent',
                                !done && !current && 'border-primary text-muted'
                            )}
                            aria-current={current ? 'step' : undefined}
                        >
                            {done ? <IconCheck /> : index + 1}
                        </span>
                        <span className={clsx(current ? 'font-semibold text-primary' : 'text-secondary')}>
                            {step.label}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}

function Question({
    sim,
    view,
    setView,
}: {
    sim: SetupSimulation
    view: FocusView
    setView: (view: FocusView) => void
}): JSX.Element {
    switch (sim.state.phase) {
        case 'domain':
            return <DomainQuestion sim={sim} />
        case 'records':
            return <RecordsQuestion sim={sim} />
        case 'verifying':
            return <VerifyingQuestion sim={sim} />
        case 'verified':
            if (view === 'trust') {
                return <TrustStep sim={sim} onFinish={() => setView('done')} />
            }
            if (view === 'done') {
                return <DoneCard sim={sim} />
            }
            return (
                <VerifiedQuestion
                    sim={sim}
                    onContinueToTrust={() => setView('trust')}
                    onFinish={() => setView('domain_page')}
                />
            )
    }
}

export function FocusVariant({ sim }: { sim: SetupSimulation }): JSX.Element {
    const [view, setView] = useState<FocusView>('flow')
    const verified = sim.state.phase === 'verified'
    useEffect(() => {
        if (!verified) {
            setView('flow')
        }
    }, [verified])
    useEffect(() => setView('flow'), [sim.scenario.trust])

    if (verified && view === 'domain_page') {
        return (
            <div className="flex flex-col items-center px-4 py-8 pb-28">
                <div className="w-full max-w-200">
                    <DomainPagePreview sim={sim} />
                </div>
            </div>
        )
    }
    return (
        <div className="flex flex-col items-center px-4 py-8 @3xl:py-14 pb-28">
            <div className="w-full max-w-160 flex flex-col gap-8">
                <StepIndicator phase={sim.state.phase} trust={sim.scenario.trust} view={view} />
                <Question sim={sim} view={view} setView={setView} />
            </div>
        </div>
    )
}
