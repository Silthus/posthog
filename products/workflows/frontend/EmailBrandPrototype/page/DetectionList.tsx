// PROTOTYPE (throwaway): the compact live list of files PostHog reads while detecting.
import { IconCheck, IconMinus } from '@posthog/icons'
import { Spinner } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { BRAND_FIELD_LABELS, BRAND_FIELD_ORDER, BrandSimulation, DetectionStep } from '../simulation'

export function DetectionList({ sim }: { sim: BrandSimulation }): JSX.Element {
    const steps = sim.state.detectionSteps
    const read = steps.filter((step) => step.status === 'found' || step.status === 'empty').length
    return (
        <div className="flex flex-col gap-2" data-attr="email-brand-page-detection">
            <div className="flex items-center gap-2 text-sm flex-wrap">
                <Spinner className="text-base" />
                <span>
                    Reading <code>{repoLabel(sim)}</code>
                </span>
                <span className="text-secondary">
                    {read} of {steps.length} files
                </span>
            </div>
            <ul className="m-0 p-0 list-none flex flex-col rounded border divide-y">
                {steps.map((step) => (
                    <li
                        key={step.file}
                        className={cn(
                            'flex items-center gap-2 px-2.5 py-1.5 text-xs',
                            step.status === 'todo' && 'opacity-50'
                        )}
                    >
                        <StepIcon status={step.status} />
                        <span className="font-mono truncate min-w-0 grow">{step.file}</span>
                        <span className="text-secondary text-right shrink-0 max-w-[50%]">{stepNote(sim, step)}</span>
                    </li>
                ))}
            </ul>
            <div className="text-xs text-secondary">
                Values fill in below as they turn up. You can keep editing while this runs.
            </div>
        </div>
    )
}

export function repoLabel(sim: BrandSimulation): string {
    const { selectedRepo, selectedApp } = sim.state
    return selectedApp ? `${selectedRepo} › ${selectedApp}` : (selectedRepo ?? '')
}

function stepNote(sim: BrandSimulation, step: DetectionStep): string {
    if (step.status === 'todo') {
        return step.label
    }
    if (step.status === 'reading') {
        return 'Reading'
    }
    if (step.status === 'empty') {
        return 'Nothing here'
    }
    const found = BRAND_FIELD_ORDER.filter((key) => sim.state.sources[key]?.file === step.file).map(
        (key) => BRAND_FIELD_LABELS[key]
    )
    return found.length ? found.join(', ') : 'Found'
}

function StepIcon({ status }: { status: DetectionStep['status'] }): JSX.Element {
    if (status === 'reading') {
        return <Spinner className="text-sm shrink-0" />
    }
    if (status === 'found') {
        return <IconCheck className="text-success text-sm shrink-0" />
    }
    if (status === 'empty') {
        return <IconMinus className="text-secondary text-sm shrink-0" />
    }
    return <span className="w-3.5 h-3.5 rounded-full border shrink-0" />
}
