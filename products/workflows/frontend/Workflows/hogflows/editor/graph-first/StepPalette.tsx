// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// Quick add: one search box over every step kind (and, in the command variant, canvas commands).
// It opens with the first typed letter, so adding a step never starts with hunting for a button.
import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'

import { LemonInput } from '@posthog/lemon-ui'

import type { CreateActionType } from '../../hogFlowEditorLogic'
import {
    ACTION_NODES_TO_SHOW,
    DELAY_NODES_TO_SHOW,
    LOGIC_NODES_TO_SHOW,
    POSTHOG_NODES_TO_SHOW,
} from '../../panel/HogFlowEditorPanelBuild'
import { useHogFlowStep } from '../../steps/HogFlowSteps'
import type { HogFlowAction } from '../../types'

const AI_NODES: CreateActionType[] = [
    {
        type: 'function',
        name: 'Create AI task',
        description: 'Hand the work to an AI agent and wait for its result.',
        config: { template_id: 'template-posthog-create-task', inputs: {} },
    },
    {
        type: 'function',
        name: 'Run scout',
        description: 'Let an AI scout investigate and report back.',
        config: { template_id: 'template-posthog-run-scout', inputs: {} },
    },
]

const STEP_SECTIONS: { title: string; steps: CreateActionType[] }[] = [
    { title: 'Send', steps: ACTION_NODES_TO_SHOW },
    { title: 'Wait', steps: DELAY_NODES_TO_SHOW },
    { title: 'Split', steps: LOGIC_NODES_TO_SHOW },
    { title: 'AI', steps: AI_NODES },
    { title: 'PostHog', steps: POSTHOG_NODES_TO_SHOW },
]

export type PaletteCommand = { id: string; label: string; hint?: string; icon: React.ReactNode; run: () => void }

type Item =
    | { kind: 'step'; key: string; section: string; step: CreateActionType }
    | { kind: 'command'; key: string; section: string; command: PaletteCommand }

function StepIcon({ step }: { step: CreateActionType }): JSX.Element {
    const Step = useHogFlowStep(step as HogFlowAction)
    return (
        <span
            className="flex size-6 shrink-0 items-center justify-center rounded text-[14px]"
            style={{ color: Step?.color, backgroundColor: `${Step?.color ?? '#888'}1a` }}
        >
            {Step?.icon}
        </span>
    )
}

const matches = (query: string, ...texts: (string | undefined)[]): boolean =>
    !query || texts.some((text) => text?.toLowerCase().includes(query.toLowerCase()))

export function StepPalette({
    initialQuery = '',
    commands = [],
    placeholder = 'Search steps',
    trigger,
    onSelect,
    onClose,
}: {
    initialQuery?: string
    commands?: PaletteCommand[]
    placeholder?: string
    /** The element that toggles this palette. Clicks on it are left to its own handler. */
    trigger?: React.RefObject<HTMLElement>
    onSelect: (step: CreateActionType) => void
    onClose: () => void
}): JSX.Element {
    const [query, setQuery] = useState(initialQuery)
    const [active, setActive] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)
    const rootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const onPointerDown = (e: PointerEvent): void => {
            const target = e.target as HTMLElement
            const onTrigger = trigger ? !!trigger.current?.contains(target) : !!target.closest('[data-palette-trigger]')
            if (!rootRef.current?.contains(target) && !onTrigger) {
                onClose()
            }
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => document.removeEventListener('pointerdown', onPointerDown, true)
    }, [onClose, trigger])

    const items = useMemo((): Item[] => {
        const steps = STEP_SECTIONS.flatMap(({ title, steps }) =>
            steps
                .filter((step) => matches(query, step.name, step.description, title))
                .map(
                    (step): Item => ({
                        kind: 'step',
                        key: `${title}:${step.name}`,
                        section: `Add step · ${title}`,
                        step,
                    })
                )
        )
        const commandItems = commands
            .filter((command) => matches(query, command.label, command.hint))
            .map((command): Item => ({ kind: 'command', key: command.id, section: 'Commands', command }))
        return query ? [...steps, ...commandItems] : [...commandItems, ...steps]
    }, [query, commands])

    useEffect(() => setActive(0), [query])
    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
    }, [active])

    const choose = (item: Item | undefined): void => {
        if (!item) {
            return
        }
        if (item.kind === 'step') {
            onSelect(item.step)
        } else {
            item.command.run()
        }
        onClose()
    }

    return (
        <div
            ref={rootRef}
            className="flex w-[380px] flex-col overflow-hidden rounded-xl border bg-surface-primary shadow-xl"
            onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setActive(Math.min(active + 1, items.length - 1))
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setActive(Math.max(active - 1, 0))
                } else if (e.key === 'Enter') {
                    e.preventDefault()
                    choose(items[active])
                } else if (e.key === 'Escape') {
                    onClose()
                }
            }}
        >
            <div className="border-b p-2">
                <LemonInput autoFocus fullWidth placeholder={placeholder} value={query} onChange={setQuery} />
            </div>
            <div ref={listRef} className="max-h-[360px] overflow-y-auto p-1">
                {items.length === 0 && <div className="p-3 text-sm text-secondary">Nothing matches “{query}”.</div>}
                {items.map((item, index) => {
                    const showSection = index === 0 || items[index - 1].section !== item.section
                    return (
                        <div key={item.key}>
                            {showSection && (
                                <div className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-secondary">
                                    {item.section}
                                </div>
                            )}
                            <button
                                type="button"
                                data-index={index}
                                className={clsx(
                                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left',
                                    index === active ? 'bg-surface-secondary' : 'hover:bg-surface-secondary'
                                )}
                                onMouseEnter={() => setActive(index)}
                                onClick={() => choose(item)}
                            >
                                {item.kind === 'step' ? (
                                    <StepIcon step={item.step} />
                                ) : (
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-surface-secondary text-[14px]">
                                        {item.command.icon}
                                    </span>
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-semibold">
                                        {item.kind === 'step' ? item.step.name : item.command.label}
                                    </span>
                                    <span className="block truncate text-[11.5px] text-secondary">
                                        {item.kind === 'step' ? item.step.description : item.command.hint}
                                    </span>
                                </span>
                            </button>
                        </div>
                    )
                })}
            </div>
            <div className="flex gap-3 border-t px-3 py-1.5 text-[11px] text-secondary">
                <span>↑↓ to move</span>
                <span>Enter to choose</span>
                <span>Esc to close</span>
            </div>
        </div>
    )
}
