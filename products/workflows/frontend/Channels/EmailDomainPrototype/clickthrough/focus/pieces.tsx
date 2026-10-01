// PROTOTYPE (throwaway): the building blocks the Focus questions share.
import clsx from 'clsx'
import { ComponentType, ReactNode } from 'react'

import { IconCheck, IconCopy, IconHourglass, IconWarning } from '@posthog/icons'
import { LemonButton, LemonTag, Spinner, lemonToast } from '@posthog/lemon-ui'

import { copyToClipboard } from 'lib/utils/copyToClipboard'

import { PrototypeDnsRecord, RECORD_KIND_LABEL } from '../../prototypeData'
import { SetupStep } from '../simulation'

interface QuestionHeadingProps {
    Hoggie: ComponentType<{ className?: string }>
    title: ReactNode
    lead?: ReactNode
    busy?: boolean
}

export function QuestionHeading({ Hoggie, title, lead, busy }: QuestionHeadingProps): JSX.Element {
    return (
        <header className="flex flex-col items-center text-center gap-4">
            <Hoggie className="w-28 @md:w-36" />
            <h1 className="m-0 text-2xl @md:text-3xl font-bold leading-tight text-balance flex items-center justify-center gap-3 flex-wrap">
                {busy && <Spinner className="text-xl" />}
                {title}
            </h1>
            {lead && <p className="m-0 text-base text-secondary max-w-prose text-balance">{lead}</p>}
        </header>
    )
}

export function BigAction({ children, ...props }: React.ComponentProps<typeof LemonButton>): JSX.Element {
    return (
        <LemonButton type="primary" size="large" fullWidth center className="text-base" {...props}>
            {children}
        </LemonButton>
    )
}

const STEP_STATE_ICON: Record<SetupStep['state'], JSX.Element> = {
    done: <IconCheck className="text-success" />,
    active: <Spinner className="text-sm" />,
    todo: <span className="w-2 h-2 rounded-full border border-primary" />,
    stuck: <IconWarning className="text-danger" />,
}

export function StepsStrip({ steps }: { steps: SetupStep[] }): JSX.Element {
    return (
        <ol className="m-0 p-0 list-none grid @md:grid-cols-3 gap-2 text-sm" aria-label="What happens next">
            {steps.map((step) => (
                <li
                    key={step.key}
                    className={clsx(
                        'flex items-start gap-2 rounded border p-2.5 min-w-0',
                        step.state === 'done' && 'bg-success-highlight border-success',
                        step.state === 'active' && 'bg-accent-highlight-secondary border-accent',
                        step.state === 'stuck' && 'bg-danger-highlight border-danger',
                        step.state === 'todo' && 'bg-surface-secondary'
                    )}
                >
                    <span className="shrink-0 w-5 h-5 inline-flex items-center justify-center">
                        {STEP_STATE_ICON[step.state]}
                    </span>
                    <span className="flex flex-col min-w-0">
                        <span className={clsx('font-medium', step.state === 'todo' && 'text-secondary')}>
                            {step.label}
                        </span>
                        <span className="text-xs text-secondary">{step.detail}</span>
                    </span>
                </li>
            ))}
        </ol>
    )
}

const RECORD_STATUS: Record<PrototypeDnsRecord['status'], { label: string; icon: JSX.Element; className: string }> = {
    pending: { label: 'Not found yet', icon: <IconHourglass />, className: 'text-secondary' },
    found: { label: 'Found', icon: <IconCheck />, className: 'text-success' },
    verified: { label: 'Verified', icon: <IconCheck />, className: 'text-success' },
    missing: { label: 'Missing', icon: <IconWarning />, className: 'text-danger' },
    unknown: { label: 'Unknown', icon: <IconHourglass />, className: 'text-muted' },
}

function CopyField({ label, value }: { label: string; value: string }): JSX.Element {
    const copy = async (): Promise<void> => {
        if (await copyToClipboard(value, label, { silent: true })) {
            lemonToast.success(`Copied the ${label.toLowerCase()}`)
        }
    }
    return (
        <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs text-secondary">{label}</span>
            <div className="flex items-start gap-1">
                <code className="font-mono text-xs break-all bg-fill-primary border rounded px-1.5 py-1 flex-1 min-w-0">
                    {value}
                </code>
                <LemonButton
                    size="xsmall"
                    icon={<IconCopy />}
                    tooltip={`Copy ${label.toLowerCase()}`}
                    onClick={() => void copy()}
                />
            </div>
        </div>
    )
}

export function RecordRows({
    records,
    showStatus,
}: {
    records: PrototypeDnsRecord[]
    showStatus: boolean
}): JSX.Element {
    return (
        <ol className="m-0 p-0 list-none flex flex-col gap-2" aria-label="Settings to add">
            {records.map((record, index) => {
                const status = RECORD_STATUS[record.status]
                const missing = record.status === 'missing'
                return (
                    <li
                        key={index}
                        className={clsx(
                            'rounded border bg-surface-primary p-3 flex flex-col gap-2',
                            missing && 'border-danger bg-danger-highlight ring-2 ring-danger/30'
                        )}
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <LemonTag type="default" className="font-mono">
                                {record.type}
                            </LemonTag>
                            <span className="text-sm font-medium">{RECORD_KIND_LABEL[record.kind]}</span>
                            {showStatus && (
                                <span
                                    className={clsx(
                                        'ml-auto inline-flex items-center gap-1 text-xs whitespace-nowrap',
                                        status.className
                                    )}
                                >
                                    {status.icon}
                                    {status.label}
                                </span>
                            )}
                        </div>
                        <div className="grid gap-2 @lg:grid-cols-2">
                            <CopyField label="Name" value={record.name} />
                            <CopyField
                                label={record.priority != null ? `Value (priority ${record.priority})` : 'Value'}
                                value={record.value}
                            />
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}
