// PROTOTYPE (throwaway, never merged): ticket Silthus/posthog#495, branch prototype/parallel-step-editor.
import clsx from 'clsx'
import { useEffect } from 'react'
import type { CSSProperties, Dispatch, ReactNode } from 'react'

import {
    IconAI,
    IconBolt,
    IconCheck,
    IconChevronLeft,
    IconChevronRight,
    IconDecisionTree,
    IconHourglass,
    IconLeave,
    IconLetter,
    IconPlay,
    IconPause,
    IconPlus,
    IconRewindPlay,
    IconTrash,
    IconWarning,
    IconWebhooks,
    IconX,
} from '@posthog/icons'
import {
    LemonBanner,
    LemonButton,
    LemonInput,
    LemonMenu,
    LemonSegmentedButton,
    LemonSwitch,
    LemonTag,
    Spinner,
} from '@posthog/lemon-ui'

import { LemonRadio } from 'lib/lemon-ui/LemonRadio'

import { getHogFlowBranchColor } from '../HogFlowBranchSelection'
import {
    Action,
    JoinSummary,
    MAX_PATHS,
    MIN_PATHS,
    Path,
    PrototypeState,
    RESULT_PREVIEW,
    STEP_KIND_COLOR,
    STEP_KIND_LABEL,
    Scenario,
    StepKind,
    ValidationIssue,
    joinSummary,
    stepStatus,
} from './parallelPrototypeModel'

export const pathColor = (index: number): string => getHogFlowBranchColor(index)

export const STEP_ICON: Record<StepKind | 'trigger', JSX.Element> = {
    trigger: <IconBolt />,
    ai_task: <IconAI />,
    delay: <IconHourglass />,
    email: <IconLetter />,
    webhook: <IconWebhooks />,
    conditional_branch: <IconDecisionTree />,
    parallel: <ParallelIcon />,
    exit: <IconLeave />,
}

export function ParallelIcon({ className }: { className?: string }): JSX.Element {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={clsx('w-[1em] h-[1em]', className)}
        >
            <path
                d="M12 3v4M12 7 5 12v5M12 7v10M12 7l7 5v5M5 17l7 4 7-4M12 17v4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

export type StepVisualStatus = ReturnType<typeof stepStatus>

const STATUS_RING: Record<StepVisualStatus, string> = {
    idle: '',
    pending: 'opacity-60',
    running: 'ring-2 ring-[var(--warning)] animate-pulse',
    succeeded: 'ring-2 ring-[var(--success)]',
    failed: 'ring-2 ring-[var(--danger)]',
    skipped: 'opacity-40 line-through',
}

export function StatusDot({ status }: { status: StepVisualStatus }): JSX.Element | null {
    if (status === 'running') {
        return <Spinner className="text-xs" />
    }
    if (status === 'succeeded') {
        return <IconCheck className="text-success text-sm" />
    }
    if (status === 'failed') {
        return <IconX className="text-danger text-sm" />
    }
    return null
}

/** Mimics the graph editor's StepView node at a readable size. */
export function StepChip({
    kind,
    name,
    description,
    selected,
    status = 'idle',
    hasError,
    hasWarning,
    onClick,
    width = 184,
    accent,
}: {
    kind: StepKind | 'trigger'
    name: string
    description?: string
    selected?: boolean
    status?: StepVisualStatus
    hasError?: boolean
    hasWarning?: boolean
    onClick?: () => void
    width?: number | string
    accent?: string
}): JSX.Element {
    const color = kind === 'trigger' ? '#1d4aff' : STEP_KIND_COLOR[kind]
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation()
                onClick?.()
            }}
            className={clsx(
                'relative flex items-start gap-1.5 rounded border bg-surface-primary p-1.5 text-left transition-all hover:-translate-y-px',
                STATUS_RING[status],
                hasError && 'border-danger'
            )}
            // eslint-disable-next-line react/forbid-dom-props
            style={{
                width,
                borderColor: hasError ? undefined : selected ? color : `${color}40`,
                boxShadow: `0 2px 0 0 ${color}20`,
                borderLeft: accent ? `3px solid ${accent}` : undefined,
            }}
        >
            <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                // eslint-disable-next-line react/forbid-dom-props
                style={{ backgroundColor: `${color}20`, color }}
            >
                {STEP_ICON[kind]}
            </span>
            <span className="flex min-w-0 flex-1 flex-col pr-4">
                <span className="truncate text-xs font-semibold">{name}</span>
                {description ? <span className="truncate text-[0.65rem] text-muted">{description}</span> : null}
            </span>
            <span className="absolute right-1 top-1 flex items-center gap-0.5">
                {hasError ? (
                    <IconWarning className="text-danger text-sm" />
                ) : hasWarning ? (
                    <IconWarning className="text-warning text-sm" />
                ) : null}
                <StatusDot status={status} />
            </span>
        </button>
    )
}

export function AddStepMenu({
    onAdd,
    children,
}: {
    onAdd: (kind: StepKind) => void
    children: ReactNode
}): JSX.Element {
    const kinds: StepKind[] = ['ai_task', 'delay', 'email', 'webhook', 'conditional_branch', 'parallel', 'exit']
    return (
        <LemonMenu
            items={kinds.map((kind) => ({
                label: STEP_KIND_LABEL[kind],
                icon: STEP_ICON[kind],
                onClick: () => onAdd(kind),
            }))}
        >
            {children}
        </LemonMenu>
    )
}

export function issuesFor(issues: ValidationIssue[], filter: Partial<ValidationIssue>): ValidationIssue[] {
    return issues.filter((issue) =>
        Object.entries(filter).every(([key, value]) => issue[key as keyof ValidationIssue] === value)
    )
}

export function IssueList({ issues }: { issues: ValidationIssue[] }): JSX.Element | null {
    if (!issues.length) {
        return null
    }
    return (
        <div className="flex flex-col gap-2">
            {issues.map((issue, i) => (
                <LemonBanner key={i} type={issue.level === 'error' ? 'error' : 'warning'}>
                    {issue.message}
                </LemonBanner>
            ))}
        </div>
    )
}

function ParallelSettings({
    state,
    dispatch,
    issues,
}: {
    state: PrototypeState
    dispatch: Dispatch<Action>
    issues: ValidationIssue[]
}): JSX.Element {
    return (
        <div className="flex flex-col gap-3">
            <p className="m-0 text-secondary">
                Every path runs at the same time. The join below waits until every path has finished, then the run
                continues.
            </p>
            <IssueList issues={issuesFor(issues, { target: 'parallel' })} />
            {state.paths.map((path, index) => (
                <PathCard key={path.id} path={path} index={index} state={state} dispatch={dispatch} issues={issues} />
            ))}
            <LemonButton
                type="secondary"
                icon={<IconPlus />}
                onClick={() => dispatch({ type: 'addPath' })}
                disabledReason={
                    state.paths.length >= MAX_PATHS ? `A parallel step has at most ${MAX_PATHS} paths.` : undefined
                }
            >
                Add path
            </LemonButton>
            <LemonButton
                type="tertiary"
                status="danger"
                icon={<IconTrash />}
                onClick={() => dispatch({ type: 'removeParallel' })}
            >
                Remove parallel step and its paths
            </LemonButton>
        </div>
    )
}

export function PathCard({
    path,
    index,
    state,
    dispatch,
    issues,
    compact,
}: {
    path: Path
    index: number
    state: PrototypeState
    dispatch: Dispatch<Action>
    issues: ValidationIssue[]
    compact?: boolean
}): JSX.Element {
    const color = pathColor(index)
    const pathIssues = issuesFor(issues, { pathId: path.id })
    return (
        <div
            className="flex flex-col gap-2 rounded border p-3"
            // eslint-disable-next-line react/forbid-dom-props
            style={{ borderColor: color }}
            onClick={() => dispatch({ type: 'select', selection: { type: 'path', pathId: path.id } })}
        >
            <div className="flex items-center gap-2">
                <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    // eslint-disable-next-line react/forbid-dom-props
                    style={{ backgroundColor: color }}
                />
                <LemonInput
                    size="small"
                    className="flex-1"
                    value={path.name}
                    onChange={(name) => dispatch({ type: 'renamePath', pathId: path.id, name })}
                    aria-label={`Path ${index + 1} name`}
                />
                <LemonButton
                    size="xsmall"
                    icon={<IconX />}
                    onClick={() => dispatch({ type: 'removePath', pathId: path.id })}
                    disabledReason={
                        state.paths.length <= MIN_PATHS
                            ? `A parallel step needs at least ${MIN_PATHS} paths.`
                            : undefined
                    }
                />
            </div>
            {!compact ? (
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                    <span>Result name</span>
                    <LemonInput
                        size="xsmall"
                        className="w-40 font-mono"
                        value={path.resultKey}
                        onChange={(resultKey) => dispatch({ type: 'setResultKey', pathId: path.id, resultKey })}
                        aria-label={`Path ${index + 1} result name`}
                    />
                    <span className="font-mono">→ {`{join.${path.resultKey}.output}`}</span>
                </div>
            ) : null}
            <div className="text-xs text-muted">
                {path.steps.length
                    ? path.steps.map((s) => s.name).join(' → ')
                    : 'No steps yet. Add them on the canvas.'}
            </div>
            <IssueList issues={pathIssues} />
        </div>
    )
}

export function JoinSettings({
    state,
    dispatch,
    summary,
}: {
    state: PrototypeState
    dispatch: Dispatch<Action>
    summary?: JoinSummary
}): JSX.Element {
    return (
        <div className="flex flex-col gap-3">
            <p className="m-0 text-secondary">
                The join waits until every path has finished, whether it succeeded or failed.
            </p>
            <div className="flex flex-col gap-1">
                <div className="font-semibold">If any path failed</div>
                <LemonRadio
                    value={state.onPathFailed}
                    onChange={(policy) => dispatch({ type: 'setPolicy', policy })}
                    options={[
                        {
                            value: 'continue',
                            label: 'Continue the run',
                            description: "Later steps can check each path's status.",
                        },
                        {
                            value: 'stop',
                            label: 'Stop the run',
                            description:
                                'Other paths still finish first. Work they already did, like AI tasks, is not undone.',
                        },
                    ]}
                />
            </div>
            <div className="flex flex-col gap-1">
                <div className="font-semibold">Path results</div>
                <p className="m-0 text-xs text-muted">Steps after the join can use these.</p>
                {state.paths.map((path, index) => {
                    const status = state.run?.paths[path.id]?.status
                    return (
                        <div key={path.id} className="rounded border p-2">
                            <div className="flex items-center gap-2 text-xs">
                                <span
                                    className="h-2 w-2 rounded-full"
                                    // eslint-disable-next-line react/forbid-dom-props
                                    style={{ backgroundColor: pathColor(index) }}
                                />
                                <span className="font-semibold">{path.name}</span>
                                <code className="ml-auto truncate">{`{join.${path.resultKey}}`}</code>
                            </div>
                            {state.run ? (
                                <pre className="m-0 mt-1 overflow-x-auto text-[0.65rem]">
                                    {RESULT_PREVIEW(path, status)}
                                </pre>
                            ) : null}
                        </div>
                    )
                })}
            </div>
            {summary && state.run?.phase === 'paths' ? (
                <LemonBanner type="info">Waiting for {summary.waitingFor.map((p) => p.name).join(', ')}.</LemonBanner>
            ) : null}
        </div>
    )
}

function StepSettings({
    state,
    dispatch,
    issues,
    pathId,
    stepId,
}: {
    state: PrototypeState
    dispatch: Dispatch<Action>
    issues: ValidationIssue[]
    pathId: string
    stepId: string
}): JSX.Element | null {
    const path = state.paths.find((p) => p.id === pathId)
    const step = path?.steps.find((s) => s.id === stepId)
    if (!path || !step) {
        return null
    }
    return (
        <div className="flex flex-col gap-3">
            <div className="text-xs text-muted">
                In path <strong>{path.name}</strong>
            </div>
            <IssueList issues={issuesFor(issues, { stepId })} />
            {step.kind === 'ai_task' ? (
                <div className="flex flex-col gap-1">
                    <div className="font-semibold">Save output to variable</div>
                    <LemonInput
                        className="font-mono"
                        placeholder="Leave empty to read it from the join"
                        value={step.outputVariable ?? ''}
                        onChange={(outputVariable) =>
                            dispatch({ type: 'setOutputVariable', pathId, stepId, outputVariable })
                        }
                    />
                    <IssueList
                        issues={issuesFor(issues, { pathId, target: 'path' }).filter((i) =>
                            i.message.includes('both save')
                        )}
                    />
                </div>
            ) : (
                <p className="m-0 text-secondary">The real step settings would show here.</p>
            )}
            <LemonButton
                type="secondary"
                status="danger"
                icon={<IconTrash />}
                onClick={() => dispatch({ type: 'removeStep', pathId, stepId })}
            >
                Remove step
            </LemonButton>
        </div>
    )
}

export function SettingsPanel({
    state,
    dispatch,
    issues,
}: {
    state: PrototypeState
    dispatch: Dispatch<Action>
    issues: ValidationIssue[]
}): JSX.Element {
    const sel = state.selected
    const title =
        sel.type === 'parallel'
            ? 'Parallel step'
            : sel.type === 'join'
              ? 'Join'
              : sel.type === 'path'
                ? (state.paths.find((p) => p.id === sel.pathId)?.name ?? 'Path')
                : sel.type === 'step'
                  ? (state.paths.find((p) => p.id === sel.pathId)?.steps.find((s) => s.id === sel.stepId)?.name ??
                    'Step')
                  : 'Workflow'
    return (
        <div className="flex min-w-0 flex-col gap-3 border-l bg-surface-primary p-3 @max-[48rem]/proto:border-l-0 @max-[48rem]/proto:border-t">
            <div className="flex items-center justify-between">
                <h3 className="m-0 text-base font-semibold">{title}</h3>
                {sel.type !== 'none' ? (
                    <LemonButton
                        size="xsmall"
                        icon={<IconX />}
                        onClick={() => dispatch({ type: 'select', selection: { type: 'none' } })}
                    />
                ) : null}
            </div>
            {sel.type === 'parallel' ? <ParallelSettings state={state} dispatch={dispatch} issues={issues} /> : null}
            {sel.type === 'join' ? (
                <JoinSettings state={state} dispatch={dispatch} summary={joinSummary(state)} />
            ) : null}
            {sel.type === 'path'
                ? state.paths.map((path, index) =>
                      path.id === sel.pathId ? (
                          <PathCard
                              key={path.id}
                              path={path}
                              index={index}
                              state={state}
                              dispatch={dispatch}
                              issues={issues}
                          />
                      ) : null
                  )
                : null}
            {sel.type === 'step' ? (
                <StepSettings
                    state={state}
                    dispatch={dispatch}
                    issues={issues}
                    pathId={sel.pathId}
                    stepId={sel.stepId}
                />
            ) : null}
            {sel.type === 'none' ? (
                <div className="flex flex-col gap-2">
                    <p className="m-0 text-secondary">Select a step to edit it.</p>
                    <div className="flex flex-col gap-1">
                        <div className="font-semibold">Max AI tasks in flight</div>
                        <LemonSegmentedButton
                            size="small"
                            value={state.maxParallelAiTasks}
                            onChange={(value) => dispatch({ type: 'setMaxParallelAiTasks', value })}
                            options={[2, 3, 5, 10].map((value) => ({ value, label: String(value) }))}
                        />
                        <span className="text-xs text-muted">Workflow setting, shared by all runs. Default 5.</span>
                    </div>
                </div>
            ) : null}
        </div>
    )
}

export function TestRunBar({ state, dispatch }: { state: PrototypeState; dispatch: Dispatch<Action> }): JSX.Element {
    const run = state.run
    const summary = joinSummary(state)
    const phaseLabel = !run
        ? 'Not running'
        : run.phase === 'trigger'
          ? 'Trigger fired'
          : run.phase === 'paths'
            ? `${summary.arrived.length} of ${state.paths.length} paths at the join`
            : run.phase === 'after_join'
              ? 'Past the join'
              : run.phase === 'stopped'
                ? 'Stopped at the join: a path failed'
                : 'Run finished'
    return (
        <div className="flex flex-wrap items-center gap-2 border-b bg-surface-primary px-3 py-2">
            <span className="font-semibold">Test run</span>
            {!run ? (
                <LemonButton
                    size="small"
                    type="primary"
                    icon={<IconPlay />}
                    onClick={() => dispatch({ type: 'startRun' })}
                    disabledReason={!state.hasParallel ? 'Add a parallel step first' : undefined}
                >
                    Run test
                </LemonButton>
            ) : (
                <>
                    <LemonButton
                        size="small"
                        type="secondary"
                        icon={run.playing ? <IconPause /> : <IconPlay />}
                        onClick={() => dispatch({ type: 'togglePlay' })}
                        disabledReason={run.phase === 'done' || run.phase === 'stopped' ? 'Run is over' : undefined}
                    >
                        {run.playing ? 'Pause' : 'Resume'}
                    </LemonButton>
                    <LemonButton
                        size="small"
                        type="secondary"
                        icon={<IconRewindPlay />}
                        onClick={() => dispatch({ type: 'resetRun' })}
                    >
                        Reset
                    </LemonButton>
                </>
            )}
            <LemonTag
                type={
                    run?.phase === 'stopped' ? 'danger' : run?.phase === 'done' ? 'success' : run ? 'warning' : 'muted'
                }
            >
                {phaseLabel}
            </LemonTag>
            {state.hasParallel ? (
                <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted">
                    Make a path fail:
                    {state.paths.map((path, index) => (
                        <LemonSwitch
                            key={path.id}
                            size="small"
                            bordered
                            label={
                                <span className="flex items-center gap-1">
                                    <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: pathColor(index) } as CSSProperties}
                                    />
                                    {path.name}
                                </span>
                            }
                            checked={state.failingPathIds.includes(path.id)}
                            onChange={() => dispatch({ type: 'toggleFailing', pathId: path.id })}
                        />
                    ))}
                </span>
            ) : null}
        </div>
    )
}

export function ScenarioBar({ dispatch }: { dispatch: Dispatch<Action> }): JSX.Element {
    const scenarios: { key: Scenario; label: string }[] = [
        { key: 'happy', label: '3 AI paths' },
        { key: 'invalid', label: 'Validation errors' },
        { key: 'five_ai_paths', label: '5 AI paths' },
    ]
    return (
        <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted">Load:</span>
            {scenarios.map((s) => (
                <LemonButton
                    key={s.key}
                    size="xsmall"
                    type="tertiary"
                    onClick={() => dispatch({ type: 'loadScenario', scenario: s.key })}
                >
                    {s.label}
                </LemonButton>
            ))}
        </div>
    )
}

/** Floating variant switcher. Not part of the design being evaluated. */
export function PrototypeSwitcher({
    variants,
    current,
    onChange,
}: {
    variants: { key: string; name: string }[]
    current: string
    onChange: (key: string) => void
}): JSX.Element {
    const index = Math.max(
        0,
        variants.findIndex((v) => v.key === current)
    )
    const go = (delta: number): void => onChange(variants[(index + delta + variants.length) % variants.length].key)
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            const target = e.target as HTMLElement
            if (target.closest('input, textarea, [contenteditable]')) {
                return
            }
            if (e.key === 'ArrowLeft') {
                go(-1)
            } else if (e.key === 'ArrowRight') {
                go(1)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    })
    return (
        <div className="fixed bottom-4 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#111] px-2 py-1 text-white shadow-lg">
            <button
                type="button"
                className="rounded-full p-1 hover:bg-white/20"
                onClick={() => go(-1)}
                aria-label="Previous variant"
            >
                <IconChevronLeft />
            </button>
            <span className="text-xs font-semibold whitespace-nowrap">
                {variants[index].key} ({variants[index].name}) · PROTOTYPE
            </span>
            <button
                type="button"
                className="rounded-full p-1 hover:bg-white/20"
                onClick={() => go(1)}
                aria-label="Next variant"
            >
                <IconChevronRight />
            </button>
        </div>
    )
}

export function Connector({
    height = 24,
    color = 'var(--border)',
    dashed,
}: {
    height?: number
    color?: string
    dashed?: boolean
}): JSX.Element {
    return (
        <div
            className="mx-auto w-0"
            // eslint-disable-next-line react/forbid-dom-props
            style={{ height, borderLeft: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }}
        />
    )
}
