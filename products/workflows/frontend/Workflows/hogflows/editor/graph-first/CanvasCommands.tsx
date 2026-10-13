// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// Four ways to place the canvas commands (add a step, test, logs, variables, follow a person, paths, fit).
// Every variant offers the same commands; only where they live changes.
import { Panel } from '@xyflow/react'
import clsx from 'clsx'
import { useLayoutEffect, useSyncExternalStore } from 'react'

import {
    IconBrackets,
    IconCollapse,
    IconEllipsis,
    IconExpand,
    IconList,
    IconPerson,
    IconPlay,
    IconPlus,
    IconScreen,
    IconSearch,
} from '@posthog/icons'
import { LemonButton, LemonMenu, Tooltip } from '@posthog/lemon-ui'

import type { HogFlow } from '../../types'
import { VariablesPopover } from './CanvasDrawer'
import { PaletteCommand } from './StepPalette'

export type ToolbarVariant = 'floating' | 'header' | 'rail' | 'command'

export const TOOLBAR_VARIANTS: { value: ToolbarVariant; label: string; tooltip: string }[] = [
    { value: 'floating', label: 'Floating', tooltip: 'A small toolbar on the canvas, Add step at the bottom right.' },
    { value: 'header', label: 'Header', tooltip: 'Commands sit in the page header next to Publish.' },
    { value: 'rail', label: 'Rail', tooltip: 'A slim icon rail down the left of the canvas.' },
    { value: 'command', label: 'Command', tooltip: 'No buttons: one command bar, or just start typing.' },
]

// The page header lives outside the editor, so the Header variant publishes its buttons into this slot.
const sceneSlot = { node: null as React.ReactNode, listeners: new Set<() => void>() }

function publishSceneActions(node: React.ReactNode): void {
    sceneSlot.node = node
    sceneSlot.listeners.forEach((listener) => listener())
}

export function SceneActionsSlot(): JSX.Element {
    const node = useSyncExternalStore(
        (listener) => {
            sceneSlot.listeners.add(listener)
            return () => sceneSlot.listeners.delete(listener)
        },
        () => sceneSlot.node
    )
    return <>{node}</>
}

export type CanvasCommandState = {
    workflow: HogFlow
    testOpen: boolean
    logsOpen: boolean
    following: boolean
    hasGroups: boolean
    allCollapsed: boolean
    toggleTest: () => void
    toggleLogs: () => void
    toggleFollow: () => void
    toggleCollapse: () => void
    fit: () => void
    openPalette: (query?: string) => void
}

export function paletteCommands(state: CanvasCommandState): PaletteCommand[] {
    return [
        {
            id: 'test',
            label: 'Test run',
            hint: 'Run the workflow for one person',
            icon: <IconPlay />,
            run: state.toggleTest,
        },
        {
            id: 'follow',
            label: 'Follow a person',
            hint: 'Pick answers and see their path',
            icon: <IconPerson />,
            run: state.toggleFollow,
        },
        {
            id: 'logs',
            label: 'Show logs',
            hint: 'Recent runs, newest first',
            icon: <IconList />,
            run: state.toggleLogs,
        },
        ...(state.hasGroups
            ? [
                  {
                      id: 'paths',
                      label: state.allCollapsed ? 'Open all paths' : 'Collapse all paths',
                      icon: state.allCollapsed ? <IconExpand /> : <IconCollapse />,
                      run: state.toggleCollapse,
                  },
              ]
            : []),
        { id: 'fit', label: 'Fit to screen', icon: <IconScreen />, run: state.fit },
    ]
}

function overflowItems(state: CanvasCommandState): { label: string; onClick: () => void }[] {
    return [
        { label: state.following ? 'Stop following' : 'Follow a person', onClick: state.toggleFollow },
        ...(state.hasGroups
            ? [{ label: state.allCollapsed ? 'Open all paths' : 'Collapse all paths', onClick: state.toggleCollapse }]
            : []),
        { label: 'Fit to screen', onClick: state.fit },
    ]
}

function AddStepFab({ state }: { state: CanvasCommandState }): JSX.Element {
    return (
        <Panel position="bottom-right" className="!m-4">
            <LemonButton
                type="primary"
                icon={<IconPlus />}
                onClick={() => state.openPalette()}
                tooltip="Or just start typing on the canvas"
            >
                Add step
            </LemonButton>
        </Panel>
    )
}

function FloatingToolbar({ state }: { state: CanvasCommandState }): JSX.Element {
    return (
        <>
            <Panel position="top-left" className="!m-3">
                <div className="flex items-center gap-0.5 rounded-lg border bg-surface-primary p-1 shadow-sm">
                    <LemonButton size="small" icon={<IconPlay />} active={state.testOpen} onClick={state.toggleTest}>
                        Test
                    </LemonButton>
                    <LemonButton size="small" icon={<IconList />} active={state.logsOpen} onClick={state.toggleLogs}>
                        Logs
                    </LemonButton>
                    <VariablesPopover workflow={state.workflow} />
                    <LemonMenu items={overflowItems(state)}>
                        <LemonButton size="small" icon={<IconEllipsis />} tooltip="More" />
                    </LemonMenu>
                </div>
            </Panel>
            <AddStepFab state={state} />
        </>
    )
}

function HeaderActions({ state }: { state: CanvasCommandState }): JSX.Element {
    const actions = (
        <div className="flex items-center gap-1 border-r pr-2">
            <LemonButton size="small" icon={<IconPlay />} active={state.testOpen} onClick={state.toggleTest}>
                Test
            </LemonButton>
            <LemonButton size="small" icon={<IconList />} active={state.logsOpen} onClick={state.toggleLogs}>
                Logs
            </LemonButton>
            <VariablesPopover workflow={state.workflow} />
            <LemonMenu items={overflowItems(state)}>
                <LemonButton size="small" icon={<IconEllipsis />} tooltip="More" />
            </LemonMenu>
        </div>
    )
    useLayoutEffect(() => publishSceneActions(actions))
    useLayoutEffect(() => () => publishSceneActions(null), [])
    return <AddStepFab state={state} />
}

function RailButton({
    icon,
    label,
    active,
    primary,
    onClick,
}: {
    icon: React.ReactNode
    label: string
    active?: boolean
    primary?: boolean
    onClick: () => void
}): JSX.Element {
    return (
        <Tooltip title={label} placement="right">
            <button
                type="button"
                aria-label={label}
                onClick={onClick}
                className={clsx(
                    'flex size-9 cursor-pointer items-center justify-center rounded-lg text-lg transition-colors',
                    primary
                        ? 'bg-[var(--color-accent)] text-white hover:opacity-90'
                        : active
                          ? 'bg-surface-secondary text-[var(--color-accent)]'
                          : 'text-secondary hover:bg-surface-secondary hover:text-primary'
                )}
            >
                {icon}
            </button>
        </Tooltip>
    )
}

function RailToolbar({ state }: { state: CanvasCommandState }): JSX.Element {
    return (
        <Panel position="top-left" className="!m-3">
            <div className="flex flex-col items-center gap-1 rounded-xl border bg-surface-primary p-1 shadow-sm">
                <RailButton
                    icon={<IconPlus />}
                    label="Add step (or start typing)"
                    primary
                    onClick={() => state.openPalette()}
                />
                <RailButton
                    icon={<IconSearch />}
                    label="Search steps and commands"
                    onClick={() => state.openPalette()}
                />
                <div className="my-0.5 h-px w-6 bg-border" />
                <RailButton icon={<IconPlay />} label="Test run" active={state.testOpen} onClick={state.toggleTest} />
                <RailButton
                    icon={<IconPerson />}
                    label="Follow a person"
                    active={state.following}
                    onClick={state.toggleFollow}
                />
                <RailButton icon={<IconList />} label="Logs" active={state.logsOpen} onClick={state.toggleLogs} />
                <VariablesPopover
                    workflow={state.workflow}
                    trigger={(open, toggle) => (
                        <RailButton icon={<IconBrackets />} label="Variables" active={open} onClick={toggle} />
                    )}
                />
                <div className="my-0.5 h-px w-6 bg-border" />
                {state.hasGroups && (
                    <RailButton
                        icon={state.allCollapsed ? <IconExpand /> : <IconCollapse />}
                        label={state.allCollapsed ? 'Open all paths' : 'Collapse all paths'}
                        onClick={state.toggleCollapse}
                    />
                )}
                <RailButton icon={<IconScreen />} label="Fit to screen" onClick={state.fit} />
            </div>
        </Panel>
    )
}

function CommandBar({ state }: { state: CanvasCommandState }): JSX.Element {
    return (
        <Panel position="bottom-center" className="!mb-5">
            <button
                type="button"
                onClick={() => state.openPalette()}
                className="flex w-[420px] cursor-pointer items-center gap-2 rounded-full border bg-surface-primary px-3 py-2 text-left text-sm shadow-lg hover:border-[var(--color-accent)]"
            >
                <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-accent)] text-white">
                    <IconPlus />
                </span>
                <span className="flex-1 text-secondary">Add a step or run a command…</span>
                <span className="rounded border px-1.5 text-[11px] text-secondary">type anywhere</span>
            </button>
            <div className="absolute -right-2 top-1/2 translate-x-full -translate-y-1/2 rounded-full border bg-surface-primary p-0.5 shadow-sm">
                <VariablesPopover workflow={state.workflow} />
            </div>
        </Panel>
    )
}

export function CanvasCommands({
    variant,
    state,
}: {
    variant: ToolbarVariant
    state: CanvasCommandState
}): JSX.Element {
    switch (variant) {
        case 'header':
            return <HeaderActions state={state} />
        case 'rail':
            return <RailToolbar state={state} />
        case 'command':
            return <CommandBar state={state} />
        default:
            return <FloatingToolbar state={state} />
    }
}
