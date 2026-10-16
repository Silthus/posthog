// PROTOTYPE (throwaway, never merged): ticket Silthus/posthog#495, branch prototype/parallel-step-editor.
// Variant C: left-to-right swimlanes. Each path is a lane, the join is a barrier every lane runs into.
import clsx from 'clsx'
import type { Dispatch } from 'react'

import { IconArrowRight, IconPlus } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { InsertParallelStep } from './InsertParallelStep'
import { Action, PrototypeState, ValidationIssue, joinSummary, stepStatus } from './parallelPrototypeModel'
import { AddStepMenu, ParallelIcon, StatusDot, StepChip, issuesFor, pathColor } from './ParallelPrototypeShared'

const Arrow = (): JSX.Element => <IconArrowRight className="mx-1 shrink-0 text-muted" />

const HATCH =
    'repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklab, var(--success) 25%, transparent) 6px 12px)'
const HATCH_FAILED =
    'repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklab, var(--danger) 25%, transparent) 6px 12px)'

export function VariantSwimlanes({
    state,
    dispatch,
    issues,
}: {
    state: PrototypeState
    dispatch: Dispatch<Action>
    issues: ValidationIssue[]
}): JSX.Element {
    const run = state.run
    const summary = joinSummary(state)
    const sel = state.selected

    return (
        <div className="flex min-w-max items-center px-6 py-8">
            <StepChip
                kind="trigger"
                name="Account health digest"
                description="Every Monday 09:00"
                status={run ? 'succeeded' : 'idle'}
                width={160}
            />
            <Arrow />
            {!state.hasParallel ? (
                <>
                    <InsertParallelStep dispatch={dispatch} />
                    <Arrow />
                    <StepChip kind="exit" name="Exit" width={100} />
                </>
            ) : (
                <>
                    <button
                        type="button"
                        onClick={() => dispatch({ type: 'select', selection: { type: 'parallel' } })}
                        className={clsx(
                            'flex w-8 shrink-0 flex-col items-center justify-center gap-1 self-stretch rounded-l-lg border-2 bg-[color-mix(in_oklab,#0e9f6e_8%,transparent)] py-2 text-[#0e9f6e]',
                            sel.type === 'parallel' ? 'border-[#0e9f6e]' : 'border-[#0e9f6e40]'
                        )}
                        title="Parallel step"
                    >
                        <ParallelIcon className="-rotate-90" />
                        <span className="text-xs font-semibold [writing-mode:vertical-rl]">Parallel step</span>
                        {issuesFor(issues, { target: 'parallel' }).length ? (
                            <span className="text-warning">⚠</span>
                        ) : null}
                    </button>
                    <div className="flex flex-col border-y-2 border-[#0e9f6e40]">
                        {state.paths.map((path, index) => {
                            const color = pathColor(index)
                            const pathRun = run?.paths[path.id]
                            const arrived = pathRun?.status === 'succeeded' || pathRun?.status === 'failed'
                            const hasError = issuesFor(issues, { pathId: path.id, level: 'error' }).length > 0
                            return (
                                <div
                                    key={path.id}
                                    className={clsx(
                                        'flex min-h-[64px] items-center border-b last:border-b-0',
                                        sel.type === 'path' && sel.pathId === path.id && 'bg-fill-button-tertiary-hover'
                                    )}
                                    // eslint-disable-next-line react/forbid-dom-props
                                    style={{ background: `color-mix(in oklab, ${color} 5%, transparent)` }}
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            dispatch({ type: 'select', selection: { type: 'path', pathId: path.id } })
                                        }
                                        className="sticky left-0 z-10 flex w-36 shrink-0 items-center gap-1.5 self-stretch bg-surface-primary px-2 text-left"
                                        // eslint-disable-next-line react/forbid-dom-props
                                        style={{ borderLeft: `4px solid ${color}` }}
                                    >
                                        <span className="flex min-w-0 flex-col">
                                            <span className="truncate text-xs font-semibold">
                                                {path.name} {hasError ? <span className="text-danger">⚠</span> : null}
                                            </span>
                                            <span className="truncate font-mono text-[0.6rem] text-muted">
                                                join.{path.resultKey}
                                            </span>
                                        </span>
                                        <span className="ml-auto">
                                            <StatusDot status={pathRun?.status ?? 'idle'} />
                                        </span>
                                    </button>
                                    <div className="flex items-center px-2">
                                        {path.steps.map((step, stepIndex) => (
                                            <div key={step.id} className="flex items-center">
                                                {stepIndex > 0 ? <Arrow /> : null}
                                                <StepChip
                                                    kind={step.kind}
                                                    name={step.name}
                                                    description={
                                                        step.outputVariable
                                                            ? `→ {variables.${step.outputVariable}}`
                                                            : undefined
                                                    }
                                                    selected={sel.type === 'step' && sel.stepId === step.id}
                                                    status={stepStatus(state, path.id, stepIndex)}
                                                    hasError={
                                                        issuesFor(issues, { stepId: step.id, level: 'error' }).length >
                                                        0
                                                    }
                                                    width={170}
                                                    onClick={() =>
                                                        dispatch({
                                                            type: 'select',
                                                            selection: {
                                                                type: 'step',
                                                                pathId: path.id,
                                                                stepId: step.id,
                                                            },
                                                        })
                                                    }
                                                />
                                            </div>
                                        ))}
                                        <AddStepMenu
                                            onAdd={(kind) => dispatch({ type: 'addStep', pathId: path.id, kind })}
                                        >
                                            <LemonButton
                                                size="xsmall"
                                                type="tertiary"
                                                icon={<IconPlus />}
                                                tooltip={`Add a step to ${path.name}`}
                                                className="ml-1"
                                            />
                                        </AddStepMenu>
                                    </div>
                                    <div
                                        className="flex flex-1 items-center justify-center self-stretch text-[0.65rem] font-semibold text-muted"
                                        // eslint-disable-next-line react/forbid-dom-props
                                        style={{
                                            minWidth: 80,
                                            background: arrived
                                                ? pathRun?.status === 'failed'
                                                    ? HATCH_FAILED
                                                    : HATCH
                                                : undefined,
                                        }}
                                    >
                                        {arrived && run?.phase === 'paths' ? 'waiting' : null}
                                    </div>
                                </div>
                            )
                        })}
                        {state.paths.length < 5 ? (
                            <button
                                type="button"
                                className="flex items-center gap-1 border-t px-2 py-1 text-xs text-muted hover:bg-fill-button-tertiary-hover"
                                onClick={() => dispatch({ type: 'addPath' })}
                            >
                                <IconPlus /> Add path
                            </button>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={() => dispatch({ type: 'select', selection: { type: 'join' } })}
                        className={clsx(
                            'flex w-24 shrink-0 flex-col items-center justify-center gap-1 self-stretch rounded-r-lg border-2 bg-surface-primary px-1 py-2 text-center',
                            sel.type === 'join' ? 'border-[#0e9f6e]' : 'border-[#0e9f6e40]'
                        )}
                    >
                        <ParallelIcon className="rotate-90 text-[#0e9f6e]" />
                        <span className="text-xs font-semibold">Join</span>
                        <span className="text-lg font-bold">
                            {run ? summary.arrived.length : 0}/{state.paths.length}
                        </span>
                        <span className="text-[0.6rem] text-muted">
                            {!run
                                ? `waits for all · ${state.onPathFailed === 'continue' ? 'continue on fail' : 'stop on fail'}`
                                : run.phase === 'paths' || run.phase === 'trigger'
                                  ? `waiting for ${summary.waitingFor.map((p) => p.name).join(', ')}`
                                  : run.phase === 'stopped'
                                    ? 'run stopped'
                                    : 'all arrived'}
                        </span>
                    </button>
                    <Arrow />
                    <StepChip
                        kind="ai_task"
                        name="Write account digest"
                        description="Uses {join.support_tickets.output} …"
                        status={
                            run?.phase === 'after_join'
                                ? 'running'
                                : run?.phase === 'done'
                                  ? 'succeeded'
                                  : run?.phase === 'stopped'
                                    ? 'skipped'
                                    : run
                                      ? 'pending'
                                      : 'idle'
                        }
                        width={170}
                    />
                    <Arrow />
                    <StepChip
                        kind="exit"
                        name="Exit"
                        width={100}
                        status={run?.phase === 'done' ? 'succeeded' : run ? 'pending' : 'idle'}
                    />
                </>
            )}
        </div>
    )
}
