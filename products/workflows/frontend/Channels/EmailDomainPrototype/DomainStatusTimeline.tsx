import clsx from 'clsx'

import { IconCheck, IconWarning, IconX } from '@posthog/icons'
import { Spinner } from '@posthog/lemon-ui'

import { DomainStatus } from './prototypeData'

type StepState = 'done' | 'active' | 'todo' | 'error'

interface TimelineStep {
    label: string
    detail: string | null
    state: StepState
}

export interface DomainStatusTimelineProps {
    status: DomainStatus
    addedAt: string
    recordsFoundAt: string | null
    verifiedAt: string | null
}

const stepsForStatus = ({ status, addedAt, recordsFoundAt, verifiedAt }: DomainStatusTimelineProps): TimelineStep[] => {
    const added: TimelineStep = { label: 'Domain added', detail: addedAt, state: 'done' }
    switch (status) {
        case 'not_started':
        case 'pending':
            return [
                added,
                { label: 'DNS records found', detail: 'Looking for your records', state: 'active' },
                { label: 'Verified', detail: null, state: 'todo' },
            ]
        case 'records_found':
            return [
                added,
                { label: 'DNS records found', detail: recordsFoundAt, state: 'done' },
                { label: 'Verified', detail: 'Waiting for confirmation', state: 'active' },
            ]
        case 'verified':
            return [
                added,
                { label: 'DNS records found', detail: recordsFoundAt, state: 'done' },
                { label: 'Verified', detail: verifiedAt, state: 'done' },
            ]
        case 'temporary_failure':
            return [
                added,
                { label: 'DNS records found', detail: 'A record went missing', state: 'error' },
                { label: 'Verified', detail: verifiedAt, state: 'done' },
            ]
        case 'failed':
            return [
                added,
                { label: 'DNS records found', detail: 'Not found within 72 hours', state: 'error' },
                { label: 'Verified', detail: null, state: 'todo' },
            ]
    }
}

function StepMarker({ state }: { state: StepState }): JSX.Element {
    return (
        <span
            className={clsx(
                'flex items-center justify-center size-6 rounded-full border shrink-0',
                state === 'done' && 'bg-success text-primary-inverse border-success',
                state === 'active' && 'bg-surface-primary border-primary',
                state === 'todo' && 'bg-surface-primary border-primary text-muted',
                state === 'error' && 'bg-danger text-primary-inverse border-danger'
            )}
        >
            {state === 'done' && <IconCheck className="text-sm" />}
            {state === 'active' && <Spinner className="text-sm" />}
            {state === 'error' && <IconWarning className="text-sm" />}
            {state === 'todo' && <IconX className="text-xs opacity-0" />}
        </span>
    )
}

export function DomainStatusTimeline(props: DomainStatusTimelineProps): JSX.Element {
    const steps = stepsForStatus(props)
    return (
        <ol className="m-0 p-0 list-none flex flex-col gap-3 @md:flex-row @md:gap-0 @md:items-start">
            {steps.map((step, index) => (
                <li key={step.label} className="flex @md:flex-1 @md:flex-col @md:items-center gap-3 @md:gap-2 min-w-0">
                    <div className="flex @md:w-full items-center">
                        <div
                            className={clsx(
                                'hidden @md:block flex-1 border-t',
                                index === 0
                                    ? 'border-transparent'
                                    : steps[index - 1].state === 'done'
                                      ? 'border-success'
                                      : 'border-primary'
                            )}
                        />
                        <StepMarker state={step.state} />
                        <div
                            className={clsx(
                                'hidden @md:block flex-1 border-t',
                                index === steps.length - 1
                                    ? 'border-transparent'
                                    : step.state === 'done'
                                      ? 'border-success'
                                      : 'border-primary'
                            )}
                        />
                    </div>
                    <div className="flex flex-col @md:items-center min-w-0 @md:text-center">
                        <span className={clsx('text-sm font-medium', step.state === 'todo' && 'text-muted')}>
                            {step.label}
                        </span>
                        {step.detail && (
                            <span
                                className={clsx('text-xs', step.state === 'error' ? 'text-danger' : 'text-secondary')}
                            >
                                {step.detail}
                            </span>
                        )}
                    </div>
                </li>
            ))}
        </ol>
    )
}
