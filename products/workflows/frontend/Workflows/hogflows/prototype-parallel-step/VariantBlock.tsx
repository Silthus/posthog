// PROTOTYPE (throwaway, never merged): ticket Silthus/posthog#495, branch prototype/parallel-step-editor.
// Variant B: the parallel step is one block on the canvas with a row per path. Open a path to edit its steps.
import clsx from 'clsx'
import { useState } from 'react'
import type { Dispatch } from 'react'

import { IconArrowLeft, IconChevronRight, IconPlus } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { InsertParallelStep } from './InsertParallelStep'
import {
    Action,
    PrototypeState,
    ValidationIssue,
    joinSummary,
    pathDuration,
    stepStatus,
} from './parallelPrototypeModel'
import {
    AddStepMenu,
    Connector,
    ParallelIcon,
    StatusDot,
    StepChip,
    issuesFor,
    pathColor,
} from './ParallelPrototypeShared'

function PathProgress({ state, pathId }: { state: PrototypeState; pathId: string }): JSX.Element | null {
    const run = state.run
    const path = state.paths.find((p) => p.id === pathId)
    const pathRun = run?.paths[pathId]
    if (!run || !path) {
        return null
    }
    const total = Math.max(1, pathDuration(path))
    const done = pathRun
        ? pathRun.status === 'succeeded'
            ? total
            : path.steps
                  .slice(0, pathRun.stepIndex)
                  .reduce((s, st) => s + (st.kind === 'ai_task' ? 6 : st.kind === 'delay' ? 3 : 1), 0) +
              pathRun.ticksIntoStep
        : 0
    const current = pathRun?.status === 'running' ? path.steps[pathRun.stepIndex]?.name : undefined
    return (
        <div className="flex w-full flex-col gap-0.5">
            <div className="h-1.5 w-full overflow-hidden rounded bg-border">
                <div
                    className={clsx('h-full transition-all', pathRun?.status === 'failed' ? 'bg-danger' : 'bg-success')}
                    // eslint-disable-next-line react/forbid-dom-props
                    style={{ width: `${Math.min(100, (done / total) * 100)}%` }}
                />
            </div>
            <span className="text-[0.65rem] text-muted">
                {pathRun?.status === 'failed'
                    ? 'Failed · waiting at the join'
                    : pathRun?.status === 'succeeded'
                      ? 'Done · waiting at the join'
                      : current
                        ? `Running: ${current}`
                        : 'Not started'}
            </span>
        </div>
    )
}

export function VariantBlock({
    state,
    dispatch,
    issues,
}: {
    state: PrototypeState
    dispatch: Dispatch<Action>
    issues: ValidationIssue[]
}): JSX.Element {
    const [openPathId, setOpenPathId] = useState<string | null>(null)
    const run = state.run
    const summary = joinSummary(state)
    const sel = state.selected
    const openPath = state.paths.find((p) => p.id === openPathId)
    const openIndex = state.paths.findIndex((p) => p.id === openPathId)

    if (openPath) {
        const color = pathColor(openIndex)
        return (
            <div className="flex min-w-max flex-col items-center px-6 py-4">
                <div className="mb-4 flex w-full max-w-[520px] items-center gap-2 rounded border bg-surface-primary px-2 py-1 text-sm">
                    <LemonButton size="xsmall" icon={<IconArrowLeft />} onClick={() => setOpenPathId(null)}>
                        Workflow
                    </LemonButton>
                    <IconChevronRight className="text-muted" />
                    <span className="flex items-center gap-1 text-muted">
                        <ParallelIcon /> Parallel step
                    </span>
                    <IconChevronRight className="text-muted" />
                    <span className="flex items-center gap-1 font-semibold">
                        <span
                            className="h-2.5 w-2.5 rounded-full"
                            // eslint-disable-next-line react/forbid-dom-props
                            style={{ backgroundColor: color }}
                        />
                        {openPath.name}
                    </span>
                    <span className="ml-auto text-xs text-muted">
                        Path {openIndex + 1} of {state.paths.length}
                    </span>
                </div>
                <div
                    className="rounded-full px-3 py-0.5 text-xs font-semibold text-white"
                    // eslint-disable-next-line react/forbid-dom-props
                    style={{ backgroundColor: color }}
                >
                    Path starts
                </div>
                <Connector color={color} />
                {openPath.steps.map((step, stepIndex) => (
                    <div key={step.id} className="flex flex-col items-center">
                        <StepChip
                            kind={step.kind}
                            name={step.name}
                            description={step.outputVariable ? `→ {variables.${step.outputVariable}}` : undefined}
                            selected={sel.type === 'step' && sel.stepId === step.id}
                            status={stepStatus(state, openPath.id, stepIndex)}
                            hasError={issuesFor(issues, { stepId: step.id, level: 'error' }).length > 0}
                            width={240}
                            onClick={() =>
                                dispatch({
                                    type: 'select',
                                    selection: { type: 'step', pathId: openPath.id, stepId: step.id },
                                })
                            }
                        />
                        <Connector color={color} />
                    </div>
                ))}
                <AddStepMenu onAdd={(kind) => dispatch({ type: 'addStep', pathId: openPath.id, kind })}>
                    <LemonButton size="small" type="secondary" icon={<IconPlus />}>
                        Add step to {openPath.name}
                    </LemonButton>
                </AddStepMenu>
                <Connector color={color} dashed />
                <div
                    className="rounded-full border-2 border-dashed px-3 py-0.5 text-xs text-muted"
                    style={{ borderColor: color }}
                >
                    Path ends at the join
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-w-max flex-col items-center px-6 py-8">
            <StepChip
                kind="trigger"
                name="Account health digest"
                description="Every Monday 09:00"
                status={run ? 'succeeded' : 'idle'}
            />
            <Connector />
            {!state.hasParallel ? (
                <>
                    <InsertParallelStep dispatch={dispatch} />
                    <Connector />
                    <StepChip kind="exit" name="Exit" />
                </>
            ) : (
                <>
                    <div
                        className={clsx(
                            'w-[420px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-lg border-2 bg-surface-primary',
                            sel.type === 'parallel' || sel.type === 'join' || sel.type === 'path'
                                ? 'border-[#0e9f6e]'
                                : 'border-[#0e9f6e40]'
                        )}
                    >
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 border-b px-3 py-2 text-left"
                            onClick={() => dispatch({ type: 'select', selection: { type: 'parallel' } })}
                        >
                            <span className="flex h-6 w-6 items-center justify-center rounded bg-[#0e9f6e20] text-[#0e9f6e]">
                                <ParallelIcon />
                            </span>
                            <span className="flex flex-col">
                                <span className="text-sm font-semibold">Parallel step</span>
                                <span className="text-xs text-muted">
                                    {state.paths.length} paths run at the same time
                                </span>
                            </span>
                            {issuesFor(issues, { target: 'parallel' }).length ? (
                                <span className="ml-auto text-warning">⚠</span>
                            ) : null}
                        </button>
                        {state.paths.map((path, index) => {
                            const pathRun = run?.paths[path.id]
                            const hasError = issuesFor(issues, { pathId: path.id, level: 'error' }).length > 0
                            return (
                                <div
                                    key={path.id}
                                    data-proto-selectable
                                    className={clsx(
                                        'flex items-center gap-2 border-b px-3 py-2 hover:bg-fill-button-tertiary-hover',
                                        sel.type === 'path' && sel.pathId === path.id && 'bg-fill-button-tertiary-hover'
                                    )}
                                    // eslint-disable-next-line react/forbid-dom-props
                                    style={{ borderLeft: `4px solid ${pathColor(index)}` }}
                                    onClick={() =>
                                        dispatch({ type: 'select', selection: { type: 'path', pathId: path.id } })
                                    }
                                >
                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <div className="flex items-center gap-1">
                                            <span className="truncate text-sm font-semibold">{path.name}</span>
                                            {hasError ? <span className="text-danger">⚠</span> : null}
                                            <span className="ml-auto">
                                                <StatusDot status={pathRun?.status ?? 'idle'} />
                                            </span>
                                        </div>
                                        {run ? (
                                            <PathProgress state={state} pathId={path.id} />
                                        ) : (
                                            <span className="truncate text-xs text-muted">
                                                {path.steps.length
                                                    ? path.steps.map((s) => s.name).join(' → ')
                                                    : 'Empty path'}
                                            </span>
                                        )}
                                    </div>
                                    <LemonButton
                                        size="xsmall"
                                        type="secondary"
                                        sideIcon={<IconChevronRight />}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setOpenPathId(path.id)
                                        }}
                                    >
                                        {path.steps.length} {path.steps.length === 1 ? 'step' : 'steps'}
                                    </LemonButton>
                                </div>
                            )
                        })}
                        {state.paths.length < 5 ? (
                            <button
                                type="button"
                                className="flex w-full items-center gap-1 border-b px-3 py-1.5 text-xs text-muted hover:bg-fill-button-tertiary-hover"
                                onClick={() => dispatch({ type: 'addPath' })}
                            >
                                <IconPlus /> Add path
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className={clsx(
                                'flex w-full items-center gap-2 bg-[color-mix(in_oklab,#0e9f6e_6%,transparent)] px-3 py-2 text-left',
                                sel.type === 'join' && 'ring-2 ring-inset ring-[#0e9f6e]'
                            )}
                            onClick={() => dispatch({ type: 'select', selection: { type: 'join' } })}
                        >
                            <ParallelIcon className="rotate-180 text-[#0e9f6e]" />
                            <span className="flex flex-col">
                                <span className="text-sm font-semibold">
                                    Join
                                    {run ? ` · ${summary.arrived.length} of ${state.paths.length} arrived` : ''}
                                </span>
                                <span className="text-xs text-muted">
                                    {run?.phase === 'paths'
                                        ? `Waiting for ${summary.waitingFor.map((p) => p.name).join(', ')}`
                                        : run?.phase === 'stopped'
                                          ? 'A path failed, run stopped'
                                          : `Waits for every path · if one fails: ${state.onPathFailed === 'continue' ? 'continue' : 'stop the run'}`}
                                </span>
                            </span>
                        </button>
                    </div>
                    <Connector />
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
                    />
                    <Connector />
                    <StepChip
                        kind="exit"
                        name="Exit"
                        status={run?.phase === 'done' ? 'succeeded' : run ? 'pending' : 'idle'}
                    />
                </>
            )}
        </div>
    )
}
