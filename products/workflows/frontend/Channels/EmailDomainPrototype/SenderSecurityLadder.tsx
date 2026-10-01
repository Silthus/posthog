import clsx from 'clsx'

import * as climberPng from '@posthog/brand/hoggies/png/climber-1'
import * as successPng from '@posthog/brand/hoggies/png/success'
import { IconCheck, IconLock } from '@posthog/icons'
import { LemonButton, Tooltip } from '@posthog/lemon-ui'

import { pngHoggie } from 'lib/brand/hoggies'

const HedgehogClimber = pngHoggie(climberPng)
const HedgehogSuccess = pngHoggie(successPng)

export type LadderLevel = 0 | 1 | 2 | 3 | 4 | 5

interface LadderRung {
    level: LadderLevel
    name: string
    requirement: string
    benefit: string
    action: string | null
}

export const LADDER_RUNGS: LadderRung[] = [
    {
        level: 1,
        name: 'Connected',
        requirement: 'Domain verified and emails signed (DKIM)',
        benefit: 'You can send from your own domain. Inboxes can tell the emails really came from you.',
        action: null,
    },
    {
        level: 2,
        name: 'Aligned',
        requirement: 'Bounce subdomain set up (MAIL FROM)',
        benefit: 'Bounces and the hidden sender address use your domain too. Two independent checks vouch for you.',
        action: null,
    },
    {
        level: 3,
        name: 'Monitored',
        requirement: 'DMARC record with a report address',
        benefit:
            'Gmail and Yahoo expect this from anyone sending in volume. You start to see who else sends as your domain.',
        action: 'Add report address',
    },
    {
        level: 4,
        name: 'Protected',
        requirement: 'DMARC policy set to quarantine or reject',
        benefit: 'Emails pretending to be you go to spam or get blocked. Needed for your logo in the inbox.',
        action: 'Review DMARC reports',
    },
    {
        level: 5,
        name: 'Trusted',
        requirement: 'One-click unsubscribe on, spam rate under 0.1%',
        benefit: 'You meet the Gmail and Yahoo bulk sender rules and keep complaints low.',
        action: null,
    },
]

const RUNG_HEIGHT: Record<LadderLevel, string> = {
    0: 'h-6',
    1: 'h-9',
    2: 'h-12',
    3: 'h-15',
    4: 'h-18',
    5: 'h-21',
}

export interface SenderSecurityLadderProps {
    level: LadderLevel
    onLevelChange?: (level: LadderLevel) => void
}

export function SenderSecurityLadder({ level, onLevelChange }: SenderSecurityLadderProps): JSX.Element {
    const current = LADDER_RUNGS.find((rung) => rung.level === level) ?? null
    const next = LADDER_RUNGS.find((rung) => rung.level === level + 1) ?? null
    const Hedgehog = level >= 5 ? HedgehogSuccess : HedgehogClimber

    return (
        <section className="rounded border bg-surface-primary p-4 flex flex-col gap-4 @container">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                    <h3 className="m-0 text-base font-semibold">Sender security</h3>
                    <p className="m-0 text-sm text-secondary">
                        {current ? `Level ${current.level} of 5: ${current.name}.` : 'Not connected yet.'}{' '}
                        {next ? `Next: ${next.name}.` : 'This is as high as it goes.'}
                    </p>
                </div>
                {next?.action && onLevelChange && (
                    <LemonButton
                        type="secondary"
                        size="small"
                        onClick={() => onLevelChange(next.level)}
                        data-attr="email-domain-ladder-next"
                    >
                        {next.action}
                    </LemonButton>
                )}
            </div>

            <ol className="m-0 p-0 list-none grid grid-cols-5 gap-1 items-end" aria-label="Sender security levels">
                {LADDER_RUNGS.map((rung) => {
                    const reached = rung.level <= level
                    const isCurrent = rung.level === level
                    const isNext = rung.level === level + 1
                    return (
                        <li key={rung.level} className="flex flex-col items-center gap-1 min-w-0">
                            <div className="h-24 flex items-end justify-center w-full">
                                {isCurrent && (
                                    <Hedgehog
                                        className="h-20 w-auto motion-safe:transition-transform"
                                        title={`Max is at level ${rung.level}`}
                                        loading="eager"
                                    />
                                )}
                            </div>
                            <Tooltip
                                title={
                                    <div className="flex flex-col gap-1">
                                        <span className="font-semibold">
                                            {rung.name}: {rung.requirement}
                                        </span>
                                        <span>{rung.benefit}</span>
                                    </div>
                                }
                            >
                                <button
                                    type="button"
                                    onClick={() => onLevelChange?.(rung.level)}
                                    className={clsx(
                                        'w-full rounded-t border border-b-0 flex items-start justify-center pt-1.5 transition-colors motion-reduce:transition-none',
                                        reached
                                            ? 'bg-success-highlight border-success'
                                            : 'bg-fill-primary border-primary',
                                        isNext && 'border-dashed',
                                        RUNG_HEIGHT[rung.level]
                                    )}
                                    aria-label={`${rung.name}, level ${rung.level}${reached ? ', reached' : ''}`}
                                >
                                    {reached ? (
                                        <IconCheck className="text-success" />
                                    ) : (
                                        <IconLock className="text-muted text-xs" />
                                    )}
                                </button>
                            </Tooltip>
                            <span
                                className={clsx(
                                    'text-xs text-center truncate w-full',
                                    reached ? 'font-medium' : 'text-secondary'
                                )}
                            >
                                {rung.name}
                            </span>
                        </li>
                    )
                })}
            </ol>

            {next && (
                <div className="rounded bg-fill-primary border p-3 text-sm flex flex-col gap-1">
                    <span className="font-medium">
                        To reach {next.name}: {next.requirement}
                    </span>
                    <span className="text-secondary">{next.benefit}</span>
                </div>
            )}
        </section>
    )
}
