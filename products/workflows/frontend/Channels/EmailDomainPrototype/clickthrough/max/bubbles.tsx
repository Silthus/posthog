// PROTOTYPE (throwaway): the chat chrome for the Max variant: top bar, bubbles, chips, step timeline.
import clsx from 'clsx'
import { ComponentType, ReactNode } from 'react'

import { IconCheck, IconExternal, IconWarning } from '@posthog/icons'
import { LemonButton, Spinner } from '@posthog/lemon-ui'

import { HoggiePngProps } from 'lib/brand/hoggies'

import { HedgehogWizard } from '../shared/hoggies'
import { SetupStep } from '../simulation'

export type Hoggie = ComponentType<HoggiePngProps>

export interface Chip {
    label: string
    onClick?: () => void
    to?: string
    primary?: boolean
    loading?: boolean
    disabledReason?: string | null
}

export function TopBar({ status, ladderLevel }: { status: string; ladderLevel: number | null }): JSX.Element {
    return (
        <div className="sticky top-0 z-10 border-b bg-surface-primary/95 backdrop-blur">
            <div className="max-w-176 mx-auto px-4 h-12 flex items-center gap-3">
                <Avatar hoggie={HedgehogWizard} />
                <div className="flex flex-col leading-tight min-w-0">
                    <span className="font-semibold text-sm">Max</span>
                    <span className="text-xs text-secondary truncate">Sets up email for you</span>
                </div>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border bg-fill-primary px-2.5 py-0.5 text-xs text-secondary whitespace-nowrap">
                    <span
                        className={clsx(
                            'w-1.5 h-1.5 rounded-full',
                            ladderLevel != null ? 'bg-success' : 'bg-accent motion-safe:animate-pulse'
                        )}
                    />
                    {status}
                </span>
                {ladderLevel != null && (
                    <span className="inline-flex items-center gap-1" title={`Sender trust level ${ladderLevel} of 5`}>
                        {[1, 2, 3, 4, 5].map((level) => (
                            <span
                                key={level}
                                className={clsx(
                                    'h-1.5 w-3 rounded-full',
                                    level <= ladderLevel ? 'bg-success' : 'bg-border'
                                )}
                            />
                        ))}
                    </span>
                )}
            </div>
        </div>
    )
}

export function Avatar({ hoggie: Hedgehog, size = 'sm' }: { hoggie: Hoggie; size?: 'sm' | 'md' }): JSX.Element {
    return (
        <span
            className={clsx(
                'shrink-0 rounded-full border bg-gradient-to-br from-accent-highlight-secondary to-surface-primary flex items-center justify-center overflow-hidden',
                size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'
            )}
        >
            <Hedgehog className={clsx('object-contain', size === 'sm' ? 'w-6 h-6' : 'w-8 h-8')} loading="eager" />
        </span>
    )
}

export function MaxBubble({
    hoggie,
    wide,
    children,
}: {
    hoggie: Hoggie
    wide?: boolean
    children: ReactNode
}): JSX.Element {
    return (
        <div className="flex items-end gap-2 animate-fade-in">
            <Avatar hoggie={hoggie} size="md" />
            <div
                className={clsx(
                    'rounded-2xl rounded-bl-md border bg-surface-primary px-4 py-3 flex flex-col gap-3 min-w-0',
                    wide ? 'w-full' : 'max-w-[90%]'
                )}
            >
                {children}
            </div>
        </div>
    )
}

export function UserBubble({ children }: { children: ReactNode }): JSX.Element {
    return (
        <div className="flex justify-end animate-fade-in">
            <div className="rounded-2xl rounded-br-md bg-accent-highlight-secondary px-4 py-2 max-w-[90%] text-sm font-medium">
                {children}
            </div>
        </div>
    )
}

export function Chips({ chips, active }: { chips: Chip[]; active: boolean }): JSX.Element {
    return (
        <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
                <LemonButton
                    key={chip.label}
                    type={chip.primary ? 'primary' : 'secondary'}
                    size="small"
                    onClick={chip.onClick}
                    to={chip.to}
                    targetBlank={!!chip.to}
                    sideIcon={chip.to ? <IconExternal /> : undefined}
                    loading={chip.loading}
                    disabled={!active}
                    disabledReason={active ? chip.disabledReason : undefined}
                    className={active ? undefined : 'opacity-50'}
                    data-attr="email-domain-max-chip"
                >
                    {chip.label}
                </LemonButton>
            ))}
        </div>
    )
}

const STEP_ICON: Record<SetupStep['state'], JSX.Element> = {
    done: (
        <span className="w-6 h-6 rounded-full bg-success text-white flex items-center justify-center">
            <IconCheck className="text-sm" />
        </span>
    ),
    active: (
        <span className="w-6 h-6 rounded-full border border-accent bg-accent-highlight-secondary flex items-center justify-center">
            <Spinner className="text-sm" />
        </span>
    ),
    stuck: (
        <span className="w-6 h-6 rounded-full bg-danger-highlight text-danger flex items-center justify-center">
            <IconWarning className="text-sm" />
        </span>
    ),
    todo: <span className="w-6 h-6 rounded-full border border-dashed bg-fill-primary" />,
}

export function StepsTimeline({ steps }: { steps: SetupStep[] }): JSX.Element {
    return (
        <ol className="m-0 p-0 list-none flex flex-col" aria-label="Setup progress">
            {steps.map((step, index) => (
                <li key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                        {STEP_ICON[step.state]}
                        {index < steps.length - 1 && (
                            <span
                                className={clsx('w-px grow my-1', step.state === 'done' ? 'bg-success' : 'bg-border')}
                            />
                        )}
                    </div>
                    <div className={clsx('flex flex-col pb-3 min-w-0', step.state === 'todo' && 'text-secondary')}>
                        <span className={clsx('text-sm', step.state !== 'todo' && 'font-medium')}>{step.label}</span>
                        <span
                            className={clsx(
                                'text-xs break-words',
                                step.state === 'stuck' ? 'text-danger' : 'text-secondary'
                            )}
                        >
                            {step.detail}
                        </span>
                    </div>
                </li>
            ))}
        </ol>
    )
}
