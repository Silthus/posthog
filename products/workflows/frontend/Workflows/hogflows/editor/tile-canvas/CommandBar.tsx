import { useActions, useValues } from 'kea'
import { useMemo, useRef } from 'react'

import { IconPlus } from '@posthog/icons'

import { CanvasCommand, StepPalette } from './StepPalette'
import { tileCanvasLogic } from './tileCanvasLogic'
import { useCanvasCommands } from './useCanvasCommands'

export function CommandBar(): JSX.Element {
    const triggerRef = useRef<HTMLButtonElement>(null)
    const { commandPaletteQuery, paletteSections } = useValues(tileCanvasLogic)
    const { openCommandPalette, closeCommandPalette, startPlacing } = useActions(tileCanvasLogic)
    const { panel, morePanels, view } = useCanvasCommands()
    const commands = useMemo((): CanvasCommand[] => [...panel, ...morePanels, ...view], [panel, morePanels, view])

    return (
        <div className="relative">
            {commandPaletteQuery !== null && (
                <div className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2">
                    <StepPalette
                        key={commandPaletteQuery}
                        sections={paletteSections}
                        commands={commands}
                        initialQuery={commandPaletteQuery}
                        placeholder="Add a step or run a command"
                        trigger={triggerRef}
                        onSelectStep={startPlacing}
                        onClose={closeCommandPalette}
                    />
                </div>
            )}
            <button
                type="button"
                ref={triggerRef}
                data-attr="workflow-tile-command-bar"
                onClick={() => (commandPaletteQuery !== null ? closeCommandPalette() : openCommandPalette())}
                className="flex w-105 cursor-pointer items-center gap-2 rounded-full border bg-surface-primary px-3 py-2 text-left text-sm shadow-lg hover:border-[var(--color-accent)]"
            >
                <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-accent)] text-white">
                    <IconPlus />
                </span>
                <span className="flex-1 text-secondary">Add a step or run a command…</span>
                <span className="rounded border px-1.5 text-[11px] text-secondary">Type anywhere</span>
            </button>
        </div>
    )
}
