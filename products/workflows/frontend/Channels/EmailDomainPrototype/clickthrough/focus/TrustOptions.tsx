// PROTOTYPE (throwaway): four ways to hand the user the sender trust ladder once the domain is verified.
import clsx from 'clsx'
import { useState } from 'react'

import { IconArrowRight, IconCheck, IconPlus } from '@posthog/icons'
import {
    LemonBanner,
    LemonButton,
    LemonCollapse,
    LemonInput,
    LemonSwitch,
    LemonTag,
    lemonToast,
} from '@posthog/lemon-ui'

import { LADDER_RUNGS, SenderSecurityLadder } from '../../SenderSecurityLadder'
import { HedgehogClimber, HedgehogLevelUp, HedgehogSuccess } from '../shared/hoggies'
import { SetupSimulation } from '../simulation'
import { BigAction, QuestionHeading, RecordRows } from './pieces'

interface TrustTask {
    key: 'report' | 'quarantine' | 'unsubscribe'
    title: string
    time: string
    why: string
    done: boolean
}

const tasksFor = (sim: SetupSimulation): TrustTask[] => [
    {
        key: 'report',
        title: 'Add a report address',
        time: '2 min',
        why: 'We update your DMARC record for you. Reports show who else sends as your domain.',
        done: Boolean(sim.state.reportAddress),
    },
    {
        key: 'quarantine',
        title: 'Send fakes to spam',
        time: 'After a week of reports',
        why: 'Wait for a week of reports first, so nothing real gets caught. Then flip this.',
        done: sim.state.dmarcPolicy === 'quarantine',
    },
    {
        key: 'unsubscribe',
        title: 'Turn on one-click unsubscribe',
        time: '1 click',
        why: 'Gmail and Yahoo require it for bulk senders. Workflows adds the headers for you.',
        done: sim.state.oneClickUnsubscribe,
    },
]

function TaskControl({ sim, task }: { sim: SetupSimulation; task: TrustTask }): JSX.Element {
    const { state, actions } = sim
    const [draft, setDraft] = useState(`dmarc@${state.rootDomain ?? 'acme.com'}`)
    switch (task.key) {
        case 'report':
            return (
                <div className="flex flex-wrap items-center gap-2">
                    <LemonInput
                        className="w-64 max-w-full"
                        value={draft}
                        onChange={setDraft}
                        placeholder={`dmarc@${state.rootDomain}`}
                        type="email"
                    />
                    <LemonButton
                        type="primary"
                        icon={<IconPlus />}
                        disabledReason={!draft.includes('@') ? 'Enter an email address' : undefined}
                        onClick={() => {
                            actions.setReportAddress(draft)
                            lemonToast.success('Report address added. First reports arrive within a day.')
                        }}
                    >
                        Add report address
                    </LemonButton>
                </div>
            )
        case 'quarantine':
            return (
                <LemonButton type="primary" className="self-start" onClick={() => actions.setDmarcPolicy('quarantine')}>
                    Send fakes to spam
                </LemonButton>
            )
        case 'unsubscribe':
            return (
                <LemonSwitch
                    checked={state.oneClickUnsubscribe}
                    onChange={actions.setOneClickUnsubscribe}
                    label="One-click unsubscribe on every email"
                />
            )
    }
}

export function NextRungCard({ sim, onLater }: { sim: SetupSimulation; onLater?: () => void }): JSX.Element {
    const task = tasksFor(sim).find((t) => !t.done)
    const next = LADDER_RUNGS.find((rung) => rung.level === sim.derived.ladderLevel + 1)
    if (!task || !next) {
        return (
            <div className="flex items-center gap-3 rounded-lg border border-success bg-success-highlight p-4">
                <HedgehogSuccess className="w-16 shrink-0" />
                <p className="m-0 text-sm">This is as high as it goes. Your emails have the best possible start.</p>
            </div>
        )
    }
    return (
        <div className="rounded-lg border border-accent bg-gradient-to-br from-accent-highlight-secondary to-surface-primary p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-secondary">Next: {next.name}</span>
                <LemonTag size="small">{task.time}</LemonTag>
            </div>
            <div className="flex flex-col gap-0.5">
                <h3 className="m-0 text-base font-semibold">{task.title}</h3>
                <p className="m-0 text-sm text-secondary">{task.why}</p>
            </div>
            <TaskControl sim={sim} task={task} />
            {onLater && (
                <button
                    type="button"
                    className="self-start text-xs text-secondary underline cursor-pointer"
                    onClick={onLater}
                >
                    I'll do this later
                </button>
            )}
        </div>
    )
}

export function TrustInline({ sim }: { sim: SetupSimulation }): JSX.Element {
    const [later, setLater] = useState(false)
    return (
        <section className="flex flex-col gap-4">
            <SenderSecurityLadder level={sim.derived.ladderLevel} />
            {later ? (
                <p className="m-0 text-sm text-secondary text-center">
                    You can raise sender trust any time from the domain page.
                </p>
            ) : (
                <NextRungCard sim={sim} onLater={() => setLater(true)} />
            )}
        </section>
    )
}

export function TrustChecklist({ sim }: { sim: SetupSimulation }): JSX.Element {
    const tasks = tasksFor(sim)
    const doneCount = tasks.filter((t) => t.done).length
    const current = tasks.find((t) => !t.done)
    return (
        <section className="rounded-lg border bg-surface-primary p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                    <h2 className="m-0 text-lg font-semibold">3 things that get more email delivered</h2>
                    <p className="m-0 text-sm text-secondary">
                        {doneCount === tasks.length
                            ? 'All done. Nice.'
                            : `${doneCount} of ${tasks.length} done. None of them is required today.`}
                    </p>
                </div>
                {doneCount === tasks.length ? (
                    <HedgehogSuccess className="w-16 shrink-0" />
                ) : (
                    <HedgehogClimber className="w-16 shrink-0" />
                )}
            </div>
            <ol className="m-0 p-0 list-none flex flex-col gap-2">
                {tasks.map((task) => {
                    const active = task === current
                    return (
                        <li
                            key={task.key}
                            className={clsx(
                                'rounded border p-3 flex flex-col gap-2',
                                task.done && 'bg-success-highlight border-success',
                                active && 'border-accent bg-accent-highlight-secondary',
                                !task.done && !active && 'opacity-60'
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className={clsx(
                                        'inline-flex items-center justify-center w-5 h-5 rounded-full border shrink-0',
                                        task.done ? 'bg-success text-white border-success' : 'border-primary'
                                    )}
                                >
                                    {task.done && <IconCheck />}
                                </span>
                                <span className={clsx('font-medium', task.done && 'line-through text-secondary')}>
                                    {task.title}
                                </span>
                                <LemonTag size="small" className="ml-auto">
                                    {task.time}
                                </LemonTag>
                            </div>
                            {active && (
                                <div className="pl-7 flex flex-col gap-2">
                                    <p className="m-0 text-sm text-secondary">{task.why}</p>
                                    <TaskControl sim={sim} task={task} />
                                </div>
                            )}
                        </li>
                    )
                })}
            </ol>
        </section>
    )
}

export function TrustStep({ sim, onFinish }: { sim: SetupSimulation; onFinish: () => void }): JSX.Element {
    const { derived } = sim
    return (
        <div className="flex flex-col gap-8">
            <QuestionHeading
                Hoggie={HedgehogLevelUp}
                title="Make inboxes trust you even more"
                lead={`You are at level ${derived.ladderLevel} of 5 already. Each level means more of your emails land in the inbox instead of spam.`}
            />
            <SenderSecurityLadder level={derived.ladderLevel} />
            <NextRungCard sim={sim} />
            <div className="flex flex-col items-center gap-2">
                <BigAction icon={<IconArrowRight />} onClick={onFinish}>
                    Finish setup
                </BigAction>
                <span className="text-xs text-secondary">You can come back to this from the domain page.</span>
            </div>
        </div>
    )
}

export function DoneCard({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { derived } = sim
    return (
        <div className="rounded-xl border border-success bg-gradient-to-br from-success-highlight via-surface-primary to-accent-highlight-secondary p-6 @md:p-8 flex flex-col items-center text-center gap-4">
            <HedgehogSuccess className="w-32" />
            <h2 className="m-0 text-2xl font-semibold">All set</h2>
            <p className="m-0 text-secondary">
                <span className="font-mono">{derived.sendingDomain}</span> is ready. Sender trust is at level{' '}
                {derived.ladderLevel} of 5.
            </p>
            <LemonButton type="primary" onClick={() => lemonToast.info('Would open the domain page')}>
                Go to the domain page
            </LemonButton>
        </div>
    )
}

export function DomainPagePreview({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived } = sim
    const [nudgeOpen, setNudgeOpen] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const task = tasksFor(sim).find((t) => !t.done)
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="m-0 text-2xl font-semibold font-mono break-all">{derived.sendingDomain}</h1>
                <LemonTag type="success">Verified</LemonTag>
                <span className="text-sm text-secondary">
                    {state.host?.name ?? 'Your DNS host'} · {derived.records.length} settings in place
                </span>
            </div>
            {task && !dismissed && (
                <LemonBanner
                    type="info"
                    onClose={() => setDismissed(true)}
                    action={nudgeOpen ? undefined : { children: task.title, onClick: () => setNudgeOpen(true) }}
                >
                    <div className="flex flex-col gap-2">
                        <span>
                            Sender trust is at level {derived.ladderLevel} of 5. {task.why}
                        </span>
                        {nudgeOpen && <TaskControl sim={sim} task={task} />}
                    </div>
                </LemonBanner>
            )}
            <section className="rounded-lg border bg-surface-primary p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="m-0 text-lg font-semibold">Senders</h2>
                    <LemonButton type="secondary" size="small" icon={<IconPlus />}>
                        Add sender
                    </LemonButton>
                </div>
                <div className="flex items-center justify-between gap-3 rounded bg-fill-primary border px-3 py-2 text-sm">
                    <span className="min-w-0 break-all">
                        <span className="font-medium">{state.senderName || 'Acme'}</span>{' '}
                        <span className="text-secondary font-mono">&lt;{derived.fromAddress}&gt;</span>
                    </span>
                    <LemonTag type="success" size="small">
                        Default
                    </LemonTag>
                </div>
            </section>
            <LemonCollapse
                panels={[
                    {
                        key: 'trust',
                        header: `Sender trust · level ${derived.ladderLevel} of 5`,
                        content: (
                            <div className="flex flex-col gap-4">
                                <SenderSecurityLadder level={derived.ladderLevel} />
                                <NextRungCard sim={sim} />
                            </div>
                        ),
                    },
                    {
                        key: 'records',
                        header: `DNS settings · ${derived.records.length} of ${derived.records.length} verified`,
                        content: <RecordRows records={derived.records} showStatus />,
                    },
                ]}
            />
        </div>
    )
}
