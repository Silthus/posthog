import { useActions, useValues } from 'kea'
import { useMemo } from 'react'

import { IconBrackets, IconCollapse, IconExpand, IconList, IconPlay, IconScreen } from '@posthog/icons'

import type { HogFlowEditorMode } from '../../hogFlowEditorLogic'
import type { CanvasCommand } from './StepPalette'
import { tileCanvasLogic } from './tileCanvasLogic'

export interface PanelCommand extends CanvasCommand {
    mode: HogFlowEditorMode
}

export interface CanvasCommands {
    panel: PanelCommand[]
    view: CanvasCommand[]
}

export function useCanvasCommands(): CanvasCommands {
    const { pathGroups, allPathsCollapsed } = useValues(tileCanvasLogic)
    const { openPanel, toggleAllPaths, requestFit } = useActions(tileCanvasLogic)

    return useMemo(
        (): CanvasCommands => ({
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
        }),
        [openPanel, pathGroups.length, allPathsCollapsed, toggleAllPaths, requestFit]
    )
}
