import { useActions, useValues } from 'kea'
import { useMemo, useRef } from 'react'

import { IconBrackets, IconCollapse, IconExpand, IconList, IconPlay, IconPlus, IconScreen } from '@posthog/icons'

import { CanvasCommand, StepPalette } from './StepPalette'
import { tileCanvasLogic } from './tileCanvasLogic'

export function CommandBar(): JSX.Element {
    const triggerRef = useRef<HTMLButtonElement>(null)
    const { commandPaletteQuery, paletteSections, pathGroups, allPathsCollapsed } = useValues(tileCanvasLogic)
    const { openCommandPalette, closeCommandPalette, startPlacing, openPanel, toggleAllPaths, requestFit } =
        useActions(tileCanvasLogic)

    const commands = useMemo(
        (): CanvasCommand[] => [
            {
                id: 'test',
                label: 'Test',
                hint: 'Run the workflow for one person',
                icon: <IconPlay />,
                run: () => openPanel('test'),
            },
            {
                id: 'logs',
                label: 'Logs',
                hint: 'Recent runs, newest first',
                icon: <IconList />,
                run: () => openPanel('logs'),
            },
            {
                id: 'variables',
                label: 'Variables',
                hint: 'Values the steps can read and write',
                icon: <IconBrackets />,
                run: () => openPanel('variables'),
            },
            ...(pathGroups.length
                ? [
                      {
                          id: 'paths',
                          label: allPathsCollapsed ? 'Open all paths' : 'Collapse all paths',
                          icon: allPathsCollapsed ? <IconExpand /> : <IconCollapse />,
                          run: toggleAllPaths,
                      },
                  ]
                : []),
            {
                id: 'fit',
                label: 'Fit to screen',
                hint: 'Show the whole workflow',
                icon: <IconScreen />,
                run: requestFit,
            },
        ],
        [openPanel, pathGroups.length, allPathsCollapsed, toggleAllPaths, requestFit]
    )

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
