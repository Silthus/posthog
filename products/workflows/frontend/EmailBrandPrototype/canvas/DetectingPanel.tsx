// PROTOTYPE (throwaway): the panel while PostHog reads the repo, as a live list of signals.
import { IconCheckCircle, IconMinus, IconWarning } from '@posthog/icons'
import { Spinner } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { BRAND_FIELD_LABELS, BrandFieldKey, BrandSimulation, DetectionStep } from '../simulation'
import { FieldGlyph } from './FieldGlyph'
import { PanelLayout } from './PanelLayout'
import { fieldValueLabel } from './previewModel'

export function DetectingPanel({
    sim,
    landedByFile,
}: {
    sim: BrandSimulation
    landedByFile: Record<string, BrandFieldKey[]>
}): JSX.Element {
    const { state, derived } = sim
    const target = state.selectedApp ? `${state.selectedRepo}/${state.selectedApp}` : state.selectedRepo
    return (
        <PanelLayout
            title={`Reading ${target}`}
            description="Watch the email: each thing we find lands on it right away."
        >
            <div className="h-1.5 rounded-full bg-surface-secondary overflow-hidden">
                <div
                    className="h-full bg-accent transition-[width] duration-500"
                    style={{ width: `${Math.round(derived.detectionProgress * 100)}%` }}
                />
            </div>
            <ol className="m-0 p-0 list-none flex flex-col gap-1" aria-live="polite">
                {state.detectionSteps.map((step) => (
                    <SignalRow key={step.file} sim={sim} step={step} landed={landedByFile[step.file] ?? []} />
                ))}
            </ol>
        </PanelLayout>
    )
}

function SignalRow({
    sim,
    step,
    landed,
}: {
    sim: BrandSimulation
    step: DetectionStep
    landed: BrandFieldKey[]
}): JSX.Element {
    const conflicts = sim.state.conflicts.filter((conflict) => conflict.file === step.file)
    return (
        <li
            className={cn(
                'flex gap-2 rounded px-2 py-1.5',
                step.status === 'todo' && 'opacity-40',
                step.status === 'reading' && 'bg-surface-secondary'
            )}
        >
            <span className="flex w-4 h-5 items-center justify-center shrink-0">
                <StatusIcon status={step.status} />
            </span>
            <div className="flex flex-col gap-1 min-w-0 grow">
                <div className="flex items-baseline justify-between gap-2 min-w-0">
                    <span className="font-mono text-xs truncate" title={step.file}>
                        {step.file}
                    </span>
                    <span className="text-xs text-secondary shrink-0">
                        {step.status === 'empty' ? 'Nothing here' : step.label}
                    </span>
                </div>
                {(landed.length > 0 || conflicts.length > 0) && (
                    <div className="flex flex-wrap gap-1">
                        {landed.map((key) => (
                            <span
                                key={key}
                                className="flex items-center gap-1 rounded-full border bg-surface-primary px-1.5 py-0.5 text-xs animate-fade-in"
                            >
                                <FieldGlyph fieldKey={key} brand={sim.state.brand} />
                                {BRAND_FIELD_LABELS[key]}
                                <span className="text-secondary font-mono">
                                    {fieldValueLabel(key, sim.state.brand)}
                                </span>
                            </span>
                        ))}
                        {conflicts.map((conflict) => (
                            <span
                                key={conflict.key}
                                className="flex items-center gap-1 rounded-full border border-warning px-1.5 py-0.5 text-xs animate-fade-in"
                            >
                                <IconWarning className="text-warning" />
                                {BRAND_FIELD_LABELS[conflict.key]} differs from yours
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </li>
    )
}

function StatusIcon({ status }: { status: DetectionStep['status'] }): JSX.Element {
    if (status === 'reading') {
        return <Spinner className="text-sm" />
    }
    if (status === 'found') {
        return <IconCheckCircle className="text-success text-base" />
    }
    if (status === 'empty') {
        return <IconMinus className="text-tertiary text-base" />
    }
    return <span className="w-1.5 h-1.5 rounded-full bg-border-primary" />
}
