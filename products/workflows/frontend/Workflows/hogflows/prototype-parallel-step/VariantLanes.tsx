// PROTOTYPE (throwaway, never merged): ticket Silthus/posthog#495, branch prototype/parallel-step-editor.
// Variant A: the parallel step is a framed group on the canvas, one column per path, the join a node below.
import clsx from 'clsx'
import type { Dispatch } from 'react'

import { IconPlus } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { InsertParallelStep } from './InsertParallelStep'
import { Action, PrototypeState, ValidationIssue, joinSummary, stepStatus } from './parallelPrototypeModel'
import {
    AddStepMenu,
    Connector,
    ParallelIcon,
    StatusDot,
    StepChip,
    issuesFor,
    pathColor,
} from './ParallelPrototypeShared'

export function VariantLanes({
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
    const afterJoinStatus =
        run?.phase === 'after_join'
            ? 'running'
            : run?.phase === 'done'
              ? 'succeeded'
              : run?.phase === 'stopped'
                ? 'skipped'
                : run
                  ? 'pending'
                  : 'idle'

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
                </>
            ) : (
                <>
                    <button
                        type="button"
                        onClick={() => dispatch({ type: 'select', selection: { type: 'parallel' } })}
                        className={clsx(
                            'flex items-center gap-2 rounded-full border-2 bg-surface-primary px-3 py-1 text-sm font-semibold',
                            sel.type === 'parallel' ? 'border-[#0e9f6e]' : 'border-[#0e9f6e40]'
                        )}
                    >
                        <ParallelIcon className="text-[#0e9f6e]" />
                        Parallel step · {state.paths.length} paths
                        {issuesFor(issues, { target: 'parallel' }).length ? (
                            <span className="text-warning">⚠</span>
                        ) : null}
                    </button>
                    <div
                        data-proto-selectable
                        className="relative mt-3 rounded-lg border-2 border-dashed border-[#0e9f6e60] bg-[color-mix(in_oklab,#0e9f6e_4%,transparent)] px-4 pb-4 pt-6"
                        onClick={() => dispatch({ type: 'select', selection: { type: 'parallel' } })}
                    >
                        <span className="absolute -top-2.5 left-3 bg-[var(--color-bg-3000)] px-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[#0e9f6e]">
                            Runs at the same time
                        </span>
                        <div className="flex items-start gap-4">
                            {state.paths.map((path, index) => {
                                const color = pathColor(index)
                                const pathRun = run?.paths[path.id]
                                const pathIssues = issuesFor(issues, { pathId: path.id })
                                const isSelected = sel.type === 'path' && sel.pathId === path.id
                                return (
                                    <div key={path.id} className="flex w-[200px] flex-col items-center">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                dispatch({
                                                    type: 'select',
                                                    selection: { type: 'path', pathId: path.id },
                                                })
                                            }}
                                            className={clsx(
                                                'flex w-full items-center gap-1.5 rounded-t border-b-4 bg-surface-primary px-2 py-1 text-left text-xs font-semibold',
                                                isSelected && 'ring-2'
                                            )}
                                            // eslint-disable-next-line react/forbid-dom-props
                                            style={{ borderBottomColor: color }}
                                        >
                                            <span className="truncate">{path.name}</span>
                                            {pathIssues.some((i) => i.level === 'error') ? (
                                                <span className="text-danger">⚠</span>
                                            ) : null}
                                            <span className="ml-auto">
                                                <StatusDot
                                                    status={
                                                        pathRun?.status === 'running'
                                                            ? 'running'
                                                            : (pathRun?.status ?? 'idle')
                                                    }
                                                />
                                            </span>
                                        </button>
                                        <Connector height={16} color={color} />
                                        {path.steps.map((step, stepIndex) => (
                                            <div key={step.id} className="flex flex-col items-center">
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
                                                    accent={color}
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
                                                <Connector height={16} color={color} />
                                            </div>
                                        ))}
                                        <AddStepMenu
                                            onAdd={(kind) => dispatch({ type: 'addStep', pathId: path.id, kind })}
                                        >
                                            <LemonButton
                                                size="xsmall"
                                                type="tertiary"
                                                icon={<IconPlus />}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                Add to path
                                            </LemonButton>
                                        </AddStepMenu>
                                        {run && pathRun && pathRun.status !== 'running' ? (
                                            <div className="mt-1 text-[0.65rem] text-muted">
                                                {pathRun.status === 'failed'
                                                    ? 'Failed, at the join'
                                                    : 'Done, at the join'}
                                            </div>
                                        ) : run && run.phase === 'paths' ? (
                                            <div className="mt-1 text-[0.65rem] text-muted">Running…</div>
                                        ) : null}
                                    </div>
                                )
                            })}
                            {state.paths.length < 5 ? (
                                <LemonButton
                                    size="small"
                                    type="secondary"
                                    icon={<IconPlus />}
                                    className="mt-0.5"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        dispatch({ type: 'addPath' })
                                    }}
                                    tooltip="Add path"
                                />
                            ) : null}
                        </div>
                    </div>
                    <Connector color="#0e9f6e" />
                    <button
                        type="button"
                        onClick={() => dispatch({ type: 'select', selection: { type: 'join' } })}
                        className={clsx(
                            'flex min-w-[260px] flex-col items-center gap-1 rounded-lg border-2 bg-surface-primary px-3 py-2',
                            sel.type === 'join' ? 'border-[#0e9f6e]' : 'border-[#0e9f6e40]',
                            run?.phase === 'paths' && 'animate-pulse'
                        )}
                    >
                        <span className="flex items-center gap-1 text-sm font-semibold">
                            <ParallelIcon className="rotate-180 text-[#0e9f6e]" /> Join
                        </span>
                        <span className="flex gap-1">
                            {state.paths.map((path, index) => {
                                const status = run?.paths[path.id]?.status
                                return (
                                    <span
                                        key={path.id}
                                        title={path.name}
                                        className={clsx(
                                            'h-2.5 w-6 rounded-full border',
                                            status === 'failed' && 'bg-danger'
                                        )}
                                        // eslint-disable-next-line react/forbid-dom-props
                                        style={{
                                            borderColor: pathColor(index),
                                            backgroundColor: status === 'succeeded' ? pathColor(index) : undefined,
                                        }}
                                    />
                                )
                            })}
                        </span>
                        <span className="text-xs text-muted">
                            {!run
                                ? `Waits for all ${state.paths.length} paths · if one fails: ${state.onPathFailed === 'continue' ? 'continue' : 'stop the run'}`
                                : run.phase === 'paths' || run.phase === 'trigger'
                                  ? `Waiting for ${summary.waitingFor.map((p) => p.name).join(', ')}`
                                  : run.phase === 'stopped'
                                    ? `${summary.failed.map((p) => p.name).join(', ')} failed · run stopped`
                                    : summary.failed.length
                                      ? `All arrived · ${summary.failed.length} failed · continued`
                                      : 'All paths arrived'}
                        </span>
                    </button>
                    <Connector />
                    <StepChip
                        kind="ai_task"
                        name="Write account digest"
                        description="Uses {join.support_tickets.output} …"
                        status={afterJoinStatus}
                    />
                    <Connector />
                    <StepChip
                        kind="exit"
                        name="Exit"
                        status={
                            run?.phase === 'done'
                                ? 'succeeded'
                                : afterJoinStatus === 'skipped'
                                  ? 'skipped'
                                  : run
                                    ? 'pending'
                                    : 'idle'
                        }
                    />
                </>
            )}
            {!state.hasParallel ? <StepChip kind="exit" name="Exit" /> : null}
        </div>
    )
}
