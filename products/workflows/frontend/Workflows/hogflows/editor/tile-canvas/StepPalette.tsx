import { RefObject, useEffect, useMemo, useRef, useState } from 'react'

import { LemonButton, LemonInput } from '@posthog/lemon-ui'

import type { CreateActionType } from '../../hogFlowEditorLogic'
import { useHogFlowStep } from '../../steps/HogFlowSteps'
import type { HogFlowAction } from '../../types'
import { filterPaletteItems, PaletteCommand, PaletteItem, PaletteSection, tint } from './tileCanvasModel'

export interface CanvasCommand extends PaletteCommand {
    icon: JSX.Element
    run: () => void
}

function StepIcon({ step }: { step: CreateActionType }): JSX.Element {
    const look = useHogFlowStep(step as HogFlowAction)
    const color = look?.color ?? 'var(--color-text-secondary)'
    return (
        <span
            className="flex size-6 shrink-0 items-center justify-center rounded text-[14px]"
            style={{ color, backgroundColor: tint(color, 10) }}
        >
            {look?.icon}
        </span>
    )
}

/**
 * One search over every step kind, and over canvas commands when it opens from the command bar. It closes
 * on Escape and on a click outside it. A click on `trigger` is left to the trigger, which toggles it.
 */
export function StepPalette({
    sections,
    commands = [],
    initialQuery = '',
    placeholder,
    trigger,
    onSelectStep,
    onClose,
}: {
    sections: PaletteSection[]
    commands?: CanvasCommand[]
    initialQuery?: string
    placeholder: string
    trigger?: RefObject<HTMLElement>
    onSelectStep: (step: CreateActionType) => void
    onClose: () => void
}): JSX.Element {
    const [query, setQuery] = useState(initialQuery)
    const [activeIndex, setActiveIndex] = useState(0)
    const rootRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const items = useMemo(() => filterPaletteItems(query, sections, commands), [query, sections, commands])

    useEffect(() => {
        const onPointerDown = (event: PointerEvent): void => {
            const target = event.target as Node
            if (!rootRef.current?.contains(target) && !trigger?.current?.contains(target)) {
                onClose()
            }
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => document.removeEventListener('pointerdown', onPointerDown, true)
    }, [onClose, trigger])

    useEffect(() => setActiveIndex(0), [query])
    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex])

    const choose = (item: PaletteItem<CanvasCommand> | undefined): void => {
        if (!item) {
            return
        }
        onClose()
        if (item.kind === 'step') {
            onSelectStep(item.step)
        } else {
            item.command.run()
        }
    }

    return (
        <div
            ref={rootRef}
            className="flex w-95 flex-col overflow-hidden rounded-lg border bg-surface-primary shadow-xl"
            data-attr="workflow-step-palette"
            onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setActiveIndex(Math.min(activeIndex + 1, items.length - 1))
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setActiveIndex(Math.max(activeIndex - 1, 0))
                } else if (event.key === 'Enter') {
                    event.preventDefault()
                    choose(items[activeIndex])
                } else if (event.key === 'Escape') {
                    event.stopPropagation()
                    onClose()
                }
            }}
        >
            <div className="border-b p-2">
                <LemonInput autoFocus fullWidth placeholder={placeholder} value={query} onChange={setQuery} />
            </div>
            <div ref={listRef} className="max-h-90 overflow-y-auto p-1">
                {items.length === 0 && <div className="p-3 text-sm text-secondary">Nothing matches your search.</div>}
                {items.map((item, index) => (
                    <div key={item.key}>
                        {(index === 0 || items[index - 1].section !== item.section) && (
                            <div className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-secondary">
                                {item.section}
                            </div>
                        )}
                        <LemonButton
                            fullWidth
                            size="small"
                            data-index={index}
                            active={index === activeIndex}
                            icon={
                                item.kind === 'step' ? (
                                    <StepIcon step={item.step} />
                                ) : (
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-surface-secondary text-[14px]">
                                        {item.command.icon}
                                    </span>
                                )
                            }
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => choose(item)}
                        >
                            <span className="flex min-w-0 flex-col text-left">
                                <span className="text-[13px] font-semibold">{item.label}</span>
                                {item.description && (
                                    <span className="truncate text-[11.5px] font-normal text-secondary">
                                        {item.description}
                                    </span>
                                )}
                            </span>
                        </LemonButton>
                    </div>
                ))}
            </div>
            <div className="flex gap-3 border-t px-3 py-1.5 text-[11px] text-secondary">
                <span>↑↓ to move</span>
                <span>Enter to choose</span>
                <span>Esc to close</span>
            </div>
        </div>
    )
}
