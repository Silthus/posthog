// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// Test runs and logs live in a drawer under the canvas, like browser dev tools. The side panel is only
// for the selected step. A test run draws its path on the canvas; a log row opens the step it came from.
import clsx from 'clsx'
import { useMemo, useState } from 'react'

import { IconCheck, IconPlay, IconX } from '@posthog/icons'
import { LemonButton, LemonTag } from '@posthog/lemon-ui'

import { Popover } from 'lib/lemon-ui/Popover'

import type { HogFlow, HogFlowAction } from '../../types'
import { actionById, computeTrace, stepSentence, Trace } from './graphFirstModel'
import { useTileKind } from './tileKinds'

type AnyConfig = Record<string, any>

const PEOPLE = [
    { name: 'Ada Brook', email: 'ada@example.com', note: 'New this week, on the trial' },
    { name: 'Malik Osei', email: 'malik@example.org', note: 'Paying customer, 12 seats' },
    { name: 'Rin Takeda', email: 'rin@example.net', note: 'Inactive for 30 days' },
    { name: 'Lou Varga', email: 'lou@example.com', note: 'Opened every email so far' },
]

function hash(text: string): number {
    let value = 0
    for (const char of text) {
        value = (value * 31 + char.charCodeAt(0)) | 0
    }
    return value >>> 0
}

/** A made-up run: each person takes a stable, person-specific answer at every decision. */
export function simulateRun(workflow: HogFlow, person: string): Trace {
    const choices: Record<string, string> = {}
    let trace = computeTrace(workflow, choices)
    for (let round = 0; round < 12; round++) {
        const open = trace.decisions.find((decision) => !(decision.nodeId in choices))
        if (!open) {
            break
        }
        choices[open.nodeId] = open.options[hash(`${person}:${open.nodeId}`) % open.options.length].key
        trace = computeTrace(workflow, choices)
    }
    return trace
}

function resultText(workflow: HogFlow, action: HogFlowAction, trace: Trace): string {
    const decision = trace.decisions.find((candidate) => candidate.nodeId === action.id)
    if (decision) {
        const chosen = decision.options.find((option) => option.key === decision.chosen)
        return `${action.type === 'wait_until_condition' ? 'Waited' : 'Went'}: ${chosen?.label}`
    }
    if (action.type === 'delay' || action.type === 'wait_until_time_window') {
        return 'Skipped the wait in the test'
    }
    return stepSentence(workflow, action)
}

function StepIcon({ action, workflow }: { action: HogFlowAction; workflow: HogFlow }): JSX.Element {
    const kind = useTileKind(action, workflow)
    return (
        <span
            className="flex size-5 shrink-0 items-center justify-center rounded text-[13px]"
            style={{ color: kind.color, backgroundColor: `${kind.color}1a` }}
        >
            {kind.icon}
        </span>
    )
}

/** Test run on the left of the canvas: pick a person, run, and read their path top to bottom. */
export function TestRunPanel({
    workflow,
    trace,
    onRun,
    onSelectStep,
    onClose,
}: {
    workflow: HogFlow
    trace: Trace | null
    onRun: (trace: Trace | null) => void
    onSelectStep: (id: string) => void
    onClose: () => void
}): JSX.Element {
    const [person, setPerson] = useState(PEOPLE[0].email)
    const byId = actionById(workflow)
    return (
        <div className="flex h-full w-[340px] shrink-0 flex-col overflow-hidden border-r bg-surface-primary">
            <div className="flex items-center gap-2 border-b px-3 py-2">
                <IconPlay className="text-lg" />
                <div className="flex-1">
                    <div className="text-sm font-semibold">Test run</div>
                    <div className="text-xs text-secondary">Runs the workflow for one person</div>
                </div>
                <LemonButton size="small" icon={<IconX />} tooltip="Close" onClick={onClose} />
            </div>
            <div className="flex flex-col gap-1.5 border-b p-3">
                <div className="text-xs font-semibold text-secondary">Run as</div>
                {PEOPLE.map((candidate) => (
                    <button
                        key={candidate.email}
                        type="button"
                        onClick={() => setPerson(candidate.email)}
                        className={clsx(
                            'flex cursor-pointer flex-col rounded-md border px-2.5 py-1 text-left',
                            person === candidate.email
                                ? 'border-[var(--color-accent)] bg-surface-secondary'
                                : 'bg-surface-primary'
                        )}
                    >
                        <span className="text-[13px] font-semibold">{candidate.name}</span>
                        <span className="text-[11px] text-secondary">{candidate.note}</span>
                    </button>
                ))}
                <LemonButton
                    type="primary"
                    size="small"
                    icon={<IconPlay />}
                    center
                    onClick={() => onRun(simulateRun(workflow, person))}
                >
                    Run test
                </LemonButton>
                <div className="text-[11px] leading-snug text-secondary">
                    Test runs skip waits. Emails and messages go to your test inbox, not to the person.
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {trace ? (
                    <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
                        {trace.nodeIds.map((id) => (
                            <li key={id}>
                                <button
                                    type="button"
                                    className="flex w-full cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-left text-[13px] leading-snug hover:bg-surface-secondary"
                                    onClick={() => onSelectStep(id)}
                                >
                                    <IconCheck className="mt-0.5 shrink-0 text-success" />
                                    <StepIcon action={byId[id]} workflow={workflow} />
                                    <span className="min-w-0 flex-1">{resultText(workflow, byId[id], trace)}</span>
                                </button>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <div className="p-4 text-center text-sm text-secondary">
                        Pick a person and run the test. Their path lights up on the canvas.
                    </div>
                )}
            </div>
        </div>
    )
}

export type LogRow = { time: string; person: string; stepId: string; message: string; level: 'info' | 'warn' }

function logRows(workflow: HogFlow): LogRow[] {
    const byId = actionById(workflow)
    const rows: LogRow[] = []
    PEOPLE.forEach((person, personIndex) => {
        const trace = simulateRun(workflow, person.email)
        trace.nodeIds.forEach((id, stepIndex) => {
            const minutes = 9 * 60 + personIndex * 17 + stepIndex * 3
            const action = byId[id]
            const slow = (action.config as AnyConfig).template_id === 'template-webhook' && personIndex === 2
            rows.push({
                time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
                person: person.name,
                stepId: id,
                message: slow ? 'Request took 4.2 s, retried once' : resultText(workflow, action, trace),
                level: slow ? 'warn' : 'info',
            })
        })
    })
    return rows.sort((a, b) => b.time.localeCompare(a.time))
}

export function stepLogRows(workflow: HogFlow, stepId: string): LogRow[] {
    return logRows(workflow).filter((row) => row.stepId === stepId)
}

function LogsTab({ workflow, onSelectStep }: { workflow: HogFlow; onSelectStep: (id: string) => void }): JSX.Element {
    const rows = useMemo(() => logRows(workflow), [workflow])
    const byId = actionById(workflow)
    return (
        <div className="min-h-0 flex-1 overflow-y-auto font-mono text-[12px]">
            {rows.map((row, index) => (
                <button
                    key={index}
                    type="button"
                    className="grid w-full cursor-pointer grid-cols-[48px_110px_20px_1fr_auto] items-center gap-2 border-b px-3 py-1 text-left hover:bg-surface-secondary"
                    onClick={() => onSelectStep(row.stepId)}
                >
                    <span className="text-secondary">{row.time}</span>
                    <span className="truncate font-sans">{row.person}</span>
                    <StepIcon action={byId[row.stepId]} workflow={workflow} />
                    <span className="truncate font-sans">{row.message}</span>
                    {row.level === 'warn' ? (
                        <LemonTag size="small" type="warning">
                            slow
                        </LemonTag>
                    ) : (
                        <span />
                    )}
                </button>
            ))}
        </div>
    )
}

export function LogsDrawer({
    workflow,
    onSelectStep,
    onClose,
}: {
    workflow: HogFlow
    onSelectStep: (id: string) => void
    onClose: () => void
}): JSX.Element {
    return (
        <div className="flex h-[260px] shrink-0 flex-col overflow-hidden border-t bg-surface-primary">
            <div className="flex items-center gap-2 border-b px-3 py-1">
                <span className="text-sm font-semibold">Logs</span>
                <span className="text-xs text-secondary">Last runs, newest first. Click a row to open the step</span>
                <div className="flex-1" />
                <LemonButton size="xsmall" icon={<IconX />} tooltip="Close" onClick={onClose} />
            </div>
            <LogsTab workflow={workflow} onSelectStep={onSelectStep} />
        </div>
    )
}

/** Workflow variables, plus the ones steps write (AI outputs), in a popover instead of the side panel. */
export function VariablesPopover({
    workflow,
    trigger,
}: {
    workflow: HogFlow
    trigger?: (open: boolean, toggle: () => void) => JSX.Element
}): JSX.Element {
    const [open, setOpen] = useState(false)
    const written = workflow.actions.flatMap((action) => {
        const inputs = ((action.config as AnyConfig).inputs ?? {}) as AnyConfig
        const outputs: string[] = [
            ...(inputs.outputs?.value ?? []),
            ...(inputs.output?.value ? [inputs.output.value] : []),
        ]
        return outputs.map((key) => ({ key, step: action }))
    })
    const declared = workflow.variables ?? []
    return (
        <Popover
            visible={open}
            onClickOutside={() => setOpen(false)}
            placement={trigger ? 'right-start' : 'bottom-start'}
            overlay={
                <div className="flex w-80 flex-col gap-3 p-2 text-[13px]">
                    <div>
                        <div className="mb-1 text-xs font-semibold text-secondary">Workflow variables</div>
                        {declared.length ? (
                            declared.map((variable) => (
                                <div key={variable.key} className="flex items-center gap-2 py-0.5">
                                    <code className="text-[12px]">{variable.key}</code>
                                    <span className="text-secondary">{variable.type}</span>
                                    <span className="ml-auto text-secondary">default {String(variable.default)}</span>
                                </div>
                            ))
                        ) : (
                            <div className="text-secondary">None yet.</div>
                        )}
                        <LemonButton size="xsmall" type="secondary" className="mt-1.5">
                            Add variable
                        </LemonButton>
                    </div>
                    {written.length > 0 && (
                        <div>
                            <div className="mb-1 text-xs font-semibold text-secondary">Written by steps</div>
                            {written.map(({ key, step }) => (
                                <WrittenRow
                                    key={`${step.id}:${key}`}
                                    variable={key}
                                    action={step}
                                    workflow={workflow}
                                />
                            ))}
                        </div>
                    )}
                </div>
            }
        >
            {trigger ? (
                trigger(open, () => setOpen(!open))
            ) : (
                <LemonButton size="small" onClick={() => setOpen(!open)} active={open}>
                    Variables
                    {declared.length + written.length > 0 && (
                        <span className="ml-1 text-secondary">{declared.length + written.length}</span>
                    )}
                </LemonButton>
            )}
        </Popover>
    )
}

function WrittenRow({
    variable,
    action,
    workflow,
}: {
    variable: string
    action: HogFlowAction
    workflow: HogFlow
}): JSX.Element {
    const kind = useTileKind(action, workflow)
    return (
        <div className="flex items-center gap-2 py-0.5">
            <code className="text-[12px]">{variable}</code>
            <span className="ml-auto flex items-center gap-1 truncate text-secondary">
                <span style={{ color: kind.color }}>{kind.icon}</span>
                {kind.label}
            </span>
        </div>
    )
}
