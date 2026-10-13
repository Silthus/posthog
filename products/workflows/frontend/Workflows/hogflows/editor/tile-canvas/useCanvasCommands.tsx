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

type PanelDefinition = Omit<PanelCommand, 'run'>

const PANELS: PanelDefinition[] = [
    { id: 'test', mode: 'test', label: 'Test', hint: 'Run the workflow for one person', icon: <IconPlay /> },
    { id: 'logs', mode: 'logs', label: 'Logs', hint: 'Recent runs, newest first', icon: <IconList /> },
    {
        id: 'variables',
        mode: 'variables',
        label: 'Variables',
        hint: 'Values the steps can read and write',
        icon: <IconBrackets />,
    },
]

const METRICS_PANEL: PanelDefinition = {
    id: 'metrics',
    mode: 'metrics',
    label: 'Metrics',
    hint: 'How many people each step reached',
    icon: <IconGraph />,
}

const HISTORY_PANEL: PanelDefinition = {
    id: 'history',
    mode: 'history',
    label: 'History',
    hint: 'See and restore previous versions',
    icon: <IconClock />,
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
    const hasPaths = pathGroups.length > 0

    return useMemo((): CanvasCommands => {
        const openable = (panel: PanelDefinition): PanelCommand =>
            tracked({ ...panel, run: () => openPanel(panel.mode) })
        const pathsCommand: CanvasCommand = {
            id: 'paths',
            label: allPathsCollapsed ? 'Open all paths' : 'Collapse all paths',
            icon: allPathsCollapsed ? <IconExpand /> : <IconCollapse />,
            run: toggleAllPaths,
        }
        const fitCommand: CanvasCommand = {
            id: 'fit',
            label: 'Fit to screen',
            hint: 'Show the whole workflow',
            icon: <IconScreen />,
            run: requestFit,
        }
        return {
            panel: PANELS.map(openable),
            morePanels: [METRICS_PANEL, ...(hasHistory ? [HISTORY_PANEL] : [])].map(openable),
            view: [...(hasPaths ? [pathsCommand] : []), fitCommand].map(tracked),
        }
    }, [openPanel, hasHistory, hasPaths, allPathsCollapsed, toggleAllPaths, requestFit])
}
