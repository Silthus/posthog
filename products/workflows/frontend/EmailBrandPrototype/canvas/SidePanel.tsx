// PROTOTYPE (throwaway): the compact panel that drives the flow next to the email.
import { IconPalette } from '@posthog/icons'

import { cn } from 'lib/utils/css-classes'

import { BrandFieldKey, BrandPhase, BrandSimulation } from '../simulation'
import { AppPanel } from './AppPanel'
import { ConnectPanel } from './ConnectPanel'
import { DetectingPanel } from './DetectingPanel'
import { FocusRequest } from './FieldRow'
import { RepoPanel } from './RepoPanel'
import { ReviewPanel } from './ReviewPanel'

const STEPS = ['Connect GitHub', 'Pick a repo', 'Read it', 'Check it over']

const STEP_INDEX: Partial<Record<BrandPhase, number>> = {
    connect: 0,
    repo: 1,
    app: 1,
    detecting: 2,
    review: 3,
    creating: 3,
}

interface SidePanelProps {
    sim: BrandSimulation
    highlighted: BrandFieldKey | null
    focusRequest: FocusRequest | null
    landedByFile: Record<string, BrandFieldKey[]>
    onHover: (key: BrandFieldKey | null) => void
}

export function SidePanel({ sim, highlighted, focusRequest, landedByFile, onHover }: SidePanelProps): JSX.Element {
    const { phase } = sim.state
    const step = STEP_INDEX[phase] ?? 0
    return (
        <>
            <div className="flex flex-col gap-2 px-4 pt-3">
                <div className="flex items-center justify-between gap-2 text-xs text-secondary">
                    <span className="flex items-center gap-1 font-semibold">
                        <IconPalette /> Email brand
                    </span>
                    <span>{STEPS[step]}</span>
                </div>
                <div className="flex gap-1" aria-hidden>
                    {STEPS.map((label, index) => (
                        <span
                            key={label}
                            className={cn(
                                'h-1 grow rounded-full transition-colors',
                                index <= step ? 'bg-accent' : 'bg-surface-secondary'
                            )}
                        />
                    ))}
                </div>
            </div>
            {phase === 'connect' && <ConnectPanel sim={sim} />}
            {phase === 'repo' && <RepoPanel sim={sim} />}
            {phase === 'app' && <AppPanel sim={sim} />}
            {phase === 'detecting' && <DetectingPanel sim={sim} landedByFile={landedByFile} />}
            {(phase === 'review' || phase === 'creating') && (
                <ReviewPanel sim={sim} highlighted={highlighted} focusRequest={focusRequest} onHover={onHover} />
            )}
        </>
    )
}
