import { useActions, useValues } from 'kea'
import posthog from 'posthog-js'
import { useMemo } from 'react'

import {
    IconBrackets,
    IconClock,
    IconCollapse,
    IconExpand,
    IconGraph,
    IconList,
    IconPlay,
    IconScreen,
} from '@posthog/icons'

import { tileCanvasLogic, TileCanvasPanelMode } from './tileCanvasLogic'
import type { PaletteCommand } from './tileCanvasModel'

export interface CanvasCommand extends PaletteCommand {
    icon: JSX.Element
    run: () => void
}

export interface PanelCommand extends CanvasCommand {
    mode: TileCanvasPanelMode
}

export interface CanvasCommands {
    panel: PanelCommand[]
    morePanels: PanelCommand[]
    view: CanvasCommand[]
}

function tracked<Command extends CanvasCommand>(command: Command): Command {
    return {
        ...command,
        run: () => {
            posthog.capture('workflows tile canvas command run', { command: command.id })
            command.run()
        },
    }
}

export function useCanvasCommands(): CanvasCommands {
    const { pathGroups, allPathsCollapsed, hasHistory } = useValues(tileCanvasLogic)
    const { openPanel, toggleAllPaths, requestFit } = useActions(tileCanvasLogic)

    return useMemo((): CanvasCommands => {
        const commands: CanvasCommands = {
            panel: [
                {
                    id: 'test',
                    mode: 'test',
                    label: 'Test',
                    hint: 'Run the workflow for one person',
                    icon: <IconPlay />,
                    run: () => openPanel('test'),
                },
                {
                    id: 'logs',
                    mode: 'logs',
                    label: 'Logs',
                    hint: 'Recent runs, newest first',
                    icon: <IconList />,
                    run: () => openPanel('logs'),
                },
                {
                    id: 'variables',
                    mode: 'variables',
                    label: 'Variables',
                    hint: 'Values the steps can read and write',
                    icon: <IconBrackets />,
                    run: () => openPanel('variables'),
                },
            ],
            morePanels: [
                {
                    id: 'metrics',
                    mode: 'metrics',
                    label: 'Metrics',
                    hint: 'How many people each step reached',
                    icon: <IconGraph />,
                    run: () => openPanel('metrics'),
                },
                ...(hasHistory
                    ? [
                          {
                              id: 'history',
                              mode: 'history' as const,
                              label: 'History',
                              hint: 'See and restore previous versions',
                              icon: <IconClock />,
                              run: () => openPanel('history'),
                          },
                      ]
                    : []),
            ],
            view: [
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
        }
        return {
            panel: commands.panel.map(tracked),
            morePanels: commands.morePanels.map(tracked),
            view: commands.view.map(tracked),
        }
    }, [openPanel, hasHistory, pathGroups.length, allPathsCollapsed, toggleAllPaths, requestFit])
}
