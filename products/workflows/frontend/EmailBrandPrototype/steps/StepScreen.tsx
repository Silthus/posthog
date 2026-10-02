// PROTOTYPE (throwaway): the full-screen, centred shell every Steps screen shares, with the progress strip on top.
import { ComponentType, ReactNode } from 'react'

import { IconCheck } from '@posthog/icons'

import type { HoggiePngProps } from 'lib/brand/hoggies'
import { cn } from 'lib/utils/css-classes'

import { BrandPhase } from '../simulation'

const STRIP: { label: string; phases: BrandPhase[] }[] = [
    { label: 'Connect', phases: ['connect'] },
    { label: 'Repo', phases: ['repo', 'app'] },
    { label: 'Detect', phases: ['detecting'] },
    { label: 'Review', phases: ['review'] },
    { label: 'Template', phases: ['creating', 'editor'] },
]

export function ProgressStrip({ phase }: { phase: BrandPhase }): JSX.Element {
    const current = STRIP.findIndex((step) => step.phases.includes(phase))
    return (
        <ol className="flex gap-2 m-0 p-0 list-none w-full max-w-3xl mx-auto" aria-label="Progress">
            {STRIP.map((step, index) => {
                const done = index < current
                const active = index === current
                return (
                    <li
                        key={step.label}
                        className="flex-1 flex flex-col gap-1.5 min-w-0"
                        aria-current={active ? 'step' : undefined}
                    >
                        <span className={cn('h-1 rounded-full', done || active ? 'bg-accent' : 'bg-border')} />
                        <span
                            className={cn(
                                'text-xs truncate flex items-center gap-1',
                                active ? 'font-semibold text-primary' : done ? 'text-secondary' : 'text-tertiary'
                            )}
                        >
                            {done && <IconCheck className="text-success shrink-0" />}
                            {step.label}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}

interface StepScreenProps {
    phase: BrandPhase
    hoggie: ComponentType<HoggiePngProps>
    title: ReactNode
    subtitle?: ReactNode
    children?: ReactNode
    primary?: ReactNode
    secondary?: ReactNode
}

export function StepScreen({
    phase,
    hoggie: Hoggie,
    title,
    subtitle,
    children,
    primary,
    secondary,
}: StepScreenProps): JSX.Element {
    return (
        <div className="flex flex-col min-h-full px-4 py-5 @md:px-8 gap-6" data-attr={`email-brand-steps-${phase}`}>
            <ProgressStrip phase={phase} />
            <div className="grow flex flex-col items-center justify-center">
                <div className="w-full max-w-xl flex flex-col items-center text-center gap-5 py-6">
                    <Hoggie className="w-28 h-28 @md:w-32 @md:h-32" loading="eager" />
                    <div className="flex flex-col gap-2">
                        <h1 className="m-0 text-2xl @md:text-3xl font-bold leading-tight">{title}</h1>
                        {subtitle && <p className="m-0 text-base @md:text-lg text-secondary">{subtitle}</p>}
                    </div>
                    {children && <div className="w-full text-left">{children}</div>}
                    {primary && <div className="w-full flex flex-col items-center gap-3 pt-2">{primary}</div>}
                    {secondary && (
                        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">{secondary}</div>
                    )}
                </div>
            </div>
        </div>
    )
}
