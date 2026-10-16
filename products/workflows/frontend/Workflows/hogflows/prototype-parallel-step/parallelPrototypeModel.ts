// PROTOTYPE (throwaway, never merged): ticket Silthus/posthog#495, branch prototype/parallel-step-editor.
// In-memory model for "how does a workflow author add, configure and follow a parallel step in the editor?"
import { useEffect, useMemo, useReducer } from 'react'

export type StepKind = 'ai_task' | 'delay' | 'email' | 'webhook' | 'conditional_branch' | 'parallel' | 'exit'

export const STEP_KIND_LABEL: Record<StepKind, string> = {
    ai_task: 'AI task',
    delay: 'Delay',
    email: 'Email',
    webhook: 'Webhook',
    conditional_branch: 'Conditional branch',
    parallel: 'Parallel step',
    exit: 'Exit',
}

export const STEP_KIND_COLOR: Record<StepKind, string> = {
    ai_task: '#9b51e0',
    delay: '#a46a00',
    email: '#2f80fa',
    webhook: '#2f80fa',
    conditional_branch: '#e2580c',
    parallel: '#0e9f6e',
    exit: '#6b7280',
}

/** Ticks a step takes in the simulated test run. One tick is 600ms. */
const STEP_DURATION: Record<StepKind, number> = {
    ai_task: 6,
    delay: 3,
    email: 1,
    webhook: 1,
    conditional_branch: 1,
    parallel: 1,
    exit: 1,
}

export interface PathStep {
    id: string
    kind: StepKind
    name: string
    outputVariable?: string
}

export interface Path {
    id: string
    name: string
    resultKey: string
    steps: PathStep[]
}

export type JoinFailurePolicy = 'continue' | 'stop'

export interface PrototypeState {
    hasParallel: boolean
    paths: Path[]
    onPathFailed: JoinFailurePolicy
    maxParallelAiTasks: number
    selected: Selection
    run: RunState | null
    /** Path ids whose AI task fails in the simulated test run. */
    failingPathIds: string[]
}

export type Selection =
    | { type: 'none' }
    | { type: 'parallel' }
    | { type: 'join' }
    | { type: 'path'; pathId: string }
    | { type: 'step'; pathId: string; stepId: string }

export type PathRunStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface PathRun {
    status: PathRunStatus
    stepIndex: number
    ticksIntoStep: number
    finishedAtTick?: number
}

export type RunPhase = 'trigger' | 'paths' | 'after_join' | 'done' | 'stopped'

export interface RunState {
    tick: number
    phase: RunPhase
    paths: Record<string, PathRun>
    playing: boolean
}

export const MIN_PATHS = 2
export const MAX_PATHS = 5

let idCounter = 100
const nextId = (prefix: string): string => `${prefix}_${idCounter++}`

export const slugify = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'path'

export const STARTER_PATHS: Path[] = [
    {
        id: 'path_tickets',
        name: 'Support tickets',
        resultKey: 'support_tickets',
        steps: [{ id: 's1', kind: 'ai_task', name: 'Summarize open tickets', outputVariable: 'tickets_summary' }],
    },
    {
        id: 'path_usage',
        name: 'Product usage',
        resultKey: 'product_usage',
        steps: [{ id: 's2', kind: 'ai_task', name: 'Summarize last 30 days', outputVariable: 'usage_summary' }],
    },
    {
        id: 'path_billing',
        name: 'Billing',
        resultKey: 'billing',
        steps: [
            { id: 's3', kind: 'delay', name: 'Wait for invoice sync' },
            { id: 's4', kind: 'ai_task', name: 'Summarize invoices', outputVariable: 'billing_summary' },
        ],
    },
]

const emptyPath = (index: number): Path => {
    const name = `Path ${index + 1}`
    return { id: nextId('path'), name, resultKey: slugify(name), steps: [] }
}

export const initialState = (hasParallel: boolean): PrototypeState => ({
    hasParallel,
    paths: hasParallel ? STARTER_PATHS : [],
    onPathFailed: 'continue',
    maxParallelAiTasks: 5,
    selected: hasParallel ? { type: 'parallel' } : { type: 'none' },
    run: null,
    failingPathIds: [],
})

export type Action =
    | { type: 'addParallel'; pathCount: number }
    | { type: 'removeParallel' }
    | { type: 'addPath' }
    | { type: 'removePath'; pathId: string }
    | { type: 'renamePath'; pathId: string; name: string }
    | { type: 'setResultKey'; pathId: string; resultKey: string }
    | { type: 'addStep'; pathId: string; kind: StepKind }
    | { type: 'removeStep'; pathId: string; stepId: string }
    | { type: 'setOutputVariable'; pathId: string; stepId: string; outputVariable: string }
    | { type: 'setPolicy'; policy: JoinFailurePolicy }
    | { type: 'setMaxParallelAiTasks'; value: number }
    | { type: 'select'; selection: Selection }
    | { type: 'toggleFailing'; pathId: string }
    | { type: 'startRun' }
    | { type: 'togglePlay' }
    | { type: 'resetRun' }
    | { type: 'tick' }
    | { type: 'loadScenario'; scenario: Scenario }

export type Scenario = 'happy' | 'invalid' | 'five_ai_paths'

const scenarioPaths = (scenario: Scenario): Path[] => {
    if (scenario === 'happy') {
        return STARTER_PATHS
    }
    if (scenario === 'invalid') {
        return [
            {
                id: 'path_tickets',
                name: 'Support tickets',
                resultKey: 'support_tickets',
                steps: [{ id: 'i1', kind: 'ai_task', name: 'Summarize open tickets', outputVariable: 'summary' }],
            },
            {
                id: 'path_usage',
                name: 'Product usage',
                resultKey: 'product_usage',
                steps: [
                    { id: 'i2', kind: 'ai_task', name: 'Summarize last 30 days', outputVariable: 'summary' },
                    { id: 'i3', kind: 'exit', name: 'Exit' },
                ],
            },
            {
                id: 'path_billing',
                name: 'Billing',
                resultKey: 'billing',
                steps: [{ id: 'i4', kind: 'parallel', name: 'Parallel step' }],
            },
        ]
    }
    return ['Support tickets', 'Product usage', 'Billing', 'NPS answers', 'Sales notes'].map((name, i) => ({
        id: `path_ai_${i}`,
        name,
        resultKey: slugify(name),
        steps: [{ id: `a${i}`, kind: 'ai_task', name: `Summarize ${name.toLowerCase()}`, outputVariable: '' }],
    }))
}

const updatePath = (state: PrototypeState, pathId: string, update: (path: Path) => Path): PrototypeState => ({
    ...state,
    paths: state.paths.map((path) => (path.id === pathId ? update(path) : path)),
})

const durationOf = (path: Path): number => path.steps.reduce((sum, step) => sum + STEP_DURATION[step.kind], 0)

const advanceRun = (state: PrototypeState): PrototypeState => {
    const run = state.run
    if (!run || !run.playing) {
        return state
    }
    const tick = run.tick + 1
    if (run.phase === 'trigger') {
        if (tick < 2) {
            return { ...state, run: { ...run, tick } }
        }
        const paths: Record<string, PathRun> = {}
        state.paths.forEach((path) => {
            paths[path.id] = { status: 'running', stepIndex: 0, ticksIntoStep: 0 }
        })
        return { ...state, run: { ...run, tick, phase: 'paths', paths } }
    }
    if (run.phase === 'paths') {
        const paths: Record<string, PathRun> = {}
        state.paths.forEach((path) => {
            const pathRun = run.paths[path.id]
            if (!pathRun || pathRun.status !== 'running') {
                paths[path.id] = pathRun
                return
            }
            const step = path.steps[pathRun.stepIndex]
            if (!step) {
                paths[path.id] = { ...pathRun, status: 'succeeded', finishedAtTick: tick }
                return
            }
            const ticksIntoStep = pathRun.ticksIntoStep + 1
            const fails = state.failingPathIds.includes(path.id) && step.kind === 'ai_task'
            if (fails && ticksIntoStep >= Math.ceil(STEP_DURATION[step.kind] / 2)) {
                paths[path.id] = { ...pathRun, ticksIntoStep, status: 'failed', finishedAtTick: tick }
                return
            }
            if (ticksIntoStep >= STEP_DURATION[step.kind]) {
                const stepIndex = pathRun.stepIndex + 1
                const done = stepIndex >= path.steps.length
                paths[path.id] = {
                    status: done ? 'succeeded' : 'running',
                    stepIndex,
                    ticksIntoStep: 0,
                    finishedAtTick: done ? tick : undefined,
                }
                return
            }
            paths[path.id] = { ...pathRun, ticksIntoStep }
        })
        const allArrived = Object.values(paths).every((p) => p.status === 'succeeded' || p.status === 'failed')
        const anyFailed = Object.values(paths).some((p) => p.status === 'failed')
        const phase: RunPhase = !allArrived
            ? 'paths'
            : anyFailed && state.onPathFailed === 'stop'
              ? 'stopped'
              : 'after_join'
        return { ...state, run: { ...run, tick, paths, phase, playing: phase !== 'stopped' } }
    }
    if (run.phase === 'after_join') {
        const joinTick = Math.max(...Object.values(run.paths).map((p) => p.finishedAtTick ?? 0))
        if (tick - joinTick >= 5) {
            return { ...state, run: { ...run, tick, phase: 'done', playing: false } }
        }
        return { ...state, run: { ...run, tick } }
    }
    return state
}

const reducer = (state: PrototypeState, action: Action): PrototypeState => {
    switch (action.type) {
        case 'addParallel': {
            const paths = Array.from({ length: action.pathCount }, (_, i) => emptyPath(i))
            return { ...state, hasParallel: true, paths, selected: { type: 'parallel' }, run: null }
        }
        case 'removeParallel':
            return { ...state, hasParallel: false, paths: [], selected: { type: 'none' }, run: null }
        case 'addPath':
            if (state.paths.length >= MAX_PATHS) {
                return state
            }
            return { ...state, paths: [...state.paths, emptyPath(state.paths.length)] }
        case 'removePath':
            if (state.paths.length <= MIN_PATHS) {
                return state
            }
            return {
                ...state,
                paths: state.paths.filter((p) => p.id !== action.pathId),
                selected: { type: 'parallel' },
            }
        case 'renamePath':
            return updatePath(state, action.pathId, (path) => ({
                ...path,
                name: action.name,
                resultKey: path.resultKey === slugify(path.name) ? slugify(action.name) : path.resultKey,
            }))
        case 'setResultKey':
            return updatePath(state, action.pathId, (path) => ({ ...path, resultKey: slugify(action.resultKey) }))
        case 'addStep': {
            const step: PathStep = {
                id: nextId('step'),
                kind: action.kind,
                name: STEP_KIND_LABEL[action.kind],
                outputVariable: action.kind === 'ai_task' ? '' : undefined,
            }
            return {
                ...updatePath(state, action.pathId, (path) => ({ ...path, steps: [...path.steps, step] })),
                selected: { type: 'step', pathId: action.pathId, stepId: step.id },
            }
        }
        case 'removeStep':
            return {
                ...updatePath(state, action.pathId, (path) => ({
                    ...path,
                    steps: path.steps.filter((s) => s.id !== action.stepId),
                })),
                selected: { type: 'path', pathId: action.pathId },
            }
        case 'setOutputVariable':
            return updatePath(state, action.pathId, (path) => ({
                ...path,
                steps: path.steps.map((s) =>
                    s.id === action.stepId ? { ...s, outputVariable: action.outputVariable } : s
                ),
            }))
        case 'setPolicy':
            return { ...state, onPathFailed: action.policy }
        case 'setMaxParallelAiTasks':
            return { ...state, maxParallelAiTasks: action.value }
        case 'select':
            return { ...state, selected: action.selection }
        case 'toggleFailing':
            return {
                ...state,
                failingPathIds: state.failingPathIds.includes(action.pathId)
                    ? state.failingPathIds.filter((id) => id !== action.pathId)
                    : [...state.failingPathIds, action.pathId],
            }
        case 'startRun':
            return { ...state, run: { tick: 0, phase: 'trigger', paths: {}, playing: true } }
        case 'togglePlay':
            return state.run ? { ...state, run: { ...state.run, playing: !state.run.playing } } : state
        case 'resetRun':
            return { ...state, run: null }
        case 'tick':
            return advanceRun(state)
        case 'loadScenario':
            return {
                ...state,
                hasParallel: true,
                paths: scenarioPaths(action.scenario),
                selected: { type: 'parallel' },
                run: null,
                failingPathIds: [],
            }
    }
}

export interface ValidationIssue {
    level: 'error' | 'warning'
    message: string
    pathId?: string
    stepId?: string
    target: 'parallel' | 'join' | 'path' | 'step'
}

export const validate = (state: PrototypeState): ValidationIssue[] => {
    if (!state.hasParallel) {
        return []
    }
    const issues: ValidationIssue[] = []
    state.paths.forEach((path) => {
        if (path.steps.length === 0) {
            issues.push({
                level: 'warning',
                target: 'path',
                pathId: path.id,
                message: `"${path.name}" has no steps yet. It reaches the join right away.`,
            })
        }
        path.steps.forEach((step) => {
            if (step.kind === 'parallel') {
                issues.push({
                    level: 'error',
                    target: 'step',
                    pathId: path.id,
                    stepId: step.id,
                    message: `A path can't hold another parallel step. Move it below the join, or add a path here instead.`,
                })
            }
            if (step.kind === 'exit') {
                issues.push({
                    level: 'error',
                    target: 'step',
                    pathId: path.id,
                    stepId: step.id,
                    message: `A path can't end the run. Remove the exit from "${path.name}", or move it below the join.`,
                })
            }
        })
    })

    const writers: Record<string, Path[]> = {}
    state.paths.forEach((path) =>
        path.steps.forEach((step) => {
            if (step.outputVariable) {
                writers[step.outputVariable] = [...(writers[step.outputVariable] ?? []), path]
            }
        })
    )
    Object.entries(writers).forEach(([variable, paths]) => {
        const unique = Array.from(new Set(paths))
        if (unique.length > 1) {
            unique.forEach((path) =>
                issues.push({
                    level: 'error',
                    target: 'path',
                    pathId: path.id,
                    message: `${unique.map((p) => `"${p.name}"`).join(' and ')} both save to {variables.${variable}}. Paths run at the same time, so pick a different variable for each, or read each path's output from the join.`,
                })
            )
        }
    })

    const resultKeys: Record<string, number> = {}
    state.paths.forEach((path) => (resultKeys[path.resultKey] = (resultKeys[path.resultKey] ?? 0) + 1))
    state.paths.forEach((path) => {
        if (resultKeys[path.resultKey] > 1) {
            issues.push({
                level: 'error',
                target: 'path',
                pathId: path.id,
                message: `Two paths use the result name "${path.resultKey}". Each path needs its own.`,
            })
        }
    })

    const aiPaths = state.paths.filter((path) => path.steps.some((s) => s.kind === 'ai_task')).length
    if (aiPaths > 1) {
        const runsBeforeQueueing = Math.max(1, Math.floor(state.maxParallelAiTasks / aiPaths))
        issues.push({
            level: 'warning',
            target: 'parallel',
            message:
                aiPaths > state.maxParallelAiTasks
                    ? `${aiPaths} paths start an AI task at once, but this workflow runs at most ${state.maxParallelAiTasks} AI tasks at a time. Some paths wait for a free slot.`
                    : `${aiPaths} paths start an AI task at once. This workflow runs at most ${state.maxParallelAiTasks} AI tasks at a time across all its runs, so from ${runsBeforeQueueing + 1} runs at this step some paths wait for a free slot.`,
        })
    }
    return issues
}

export const pathDuration = durationOf

export interface JoinSummary {
    arrived: Path[]
    waitingFor: Path[]
    failed: Path[]
}

export const joinSummary = (state: PrototypeState): JoinSummary => {
    const run = state.run
    const arrived: Path[] = []
    const waitingFor: Path[] = []
    const failed: Path[] = []
    state.paths.forEach((path) => {
        const status = run?.paths[path.id]?.status
        if (status === 'succeeded') {
            arrived.push(path)
        } else if (status === 'failed') {
            arrived.push(path)
            failed.push(path)
        } else {
            waitingFor.push(path)
        }
    })
    return { arrived, waitingFor, failed }
}

export const stepStatus = (
    state: PrototypeState,
    pathId: string,
    stepIndex: number
): 'idle' | 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' => {
    const run = state.run
    if (!run) {
        return 'idle'
    }
    const pathRun = run.paths[pathId]
    if (!pathRun) {
        return 'pending'
    }
    if (stepIndex < pathRun.stepIndex) {
        return 'succeeded'
    }
    if (stepIndex === pathRun.stepIndex) {
        if (pathRun.status === 'running') {
            return 'running'
        }
        if (pathRun.status === 'failed') {
            return 'failed'
        }
    }
    if (pathRun.status === 'failed') {
        return 'skipped'
    }
    return pathRun.status === 'succeeded' ? 'succeeded' : 'pending'
}

export const usePrototypeState = (
    hasParallel: boolean
): [PrototypeState, React.Dispatch<Action>, ValidationIssue[]] => {
    const [state, dispatch] = useReducer(reducer, hasParallel, initialState)
    useEffect(() => {
        if (!state.run?.playing) {
            return
        }
        const timer = window.setInterval(() => dispatch({ type: 'tick' }), 600)
        return () => window.clearInterval(timer)
    }, [state.run?.playing])
    const issues = useMemo(() => validate(state), [state])
    return [state, dispatch, issues]
}

export const RESULT_PREVIEW = (path: Path, status: PathRunStatus | undefined): string =>
    JSON.stringify(
        {
            status: status === 'failed' ? 'failed' : status === 'succeeded' ? 'succeeded' : '…',
            output:
                status === 'succeeded'
                    ? { summary: `3 bullet points about ${path.name.toLowerCase()}` }
                    : status === 'failed'
                      ? null
                      : '…',
            ...(status === 'failed' ? { error: 'AI task timed out' } : {}),
        },
        null,
        2
    )
