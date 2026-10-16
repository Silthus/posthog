// PROTOTYPE (throwaway, never merged): ticket Silthus/posthog#495, branch prototype/parallel-step-editor.
// Question: how does a workflow author add, configure and follow a parallel step in the editor?
// Three structurally different variants of the graph editor, switchable with the floating bar,
// ←/→ or ?variant=A|B|C. State is in memory; the test run is simulated.
import type { Meta, StoryFn } from '@storybook/react'
import { useState } from 'react'

import { LemonTag } from '@posthog/lemon-ui'

import { usePrototypeState } from './parallelPrototypeModel'
import { PrototypeSwitcher, ScenarioBar, SettingsPanel, TestRunBar } from './ParallelPrototypeShared'
import { VariantBlock } from './VariantBlock'
import { VariantLanes } from './VariantLanes'
import { VariantSwimlanes } from './VariantSwimlanes'

const VARIANTS = [
    { key: 'A', name: 'Lanes on the canvas', Component: VariantLanes },
    { key: 'B', name: 'One block, open a path', Component: VariantBlock },
    { key: 'C', name: 'Swimlanes into a barrier', Component: VariantSwimlanes },
]

const readVariant = (fallback: string): string => {
    const fromUrl = new URLSearchParams(window.location.search).get('variant')
    return VARIANTS.some((v) => v.key === fromUrl) ? (fromUrl as string) : fallback
}

function ParallelStepPrototype({
    initialVariant = 'A',
    startWithParallel = true,
    width,
}: {
    initialVariant?: string
    startWithParallel?: boolean
    width?: string
}): JSX.Element {
    const [variant, setVariantState] = useState(() => readVariant(initialVariant))
    const [state, dispatch, issues] = usePrototypeState(startWithParallel)
    const setVariant = (key: string): void => {
        const url = new URL(window.location.href)
        url.searchParams.set('variant', key)
        window.history.replaceState(null, '', url)
        setVariantState(key)
    }
    const { Component } = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0]
    const errorCount = issues.filter((i) => i.level === 'error').length
    const warningCount = issues.length - errorCount

    return (
        <div className="h-screen bg-[var(--color-bg-3000)]" style={width ? { width } : undefined}>
            <div className="@container/proto flex h-full flex-col">
                <div className="flex flex-wrap items-center gap-2 border-b bg-surface-primary px-3 py-2">
                    <span className="font-semibold">Account health digest</span>
                    <LemonTag type="muted">Draft</LemonTag>
                    {errorCount ? <LemonTag type="danger">{errorCount} to fix before saving</LemonTag> : null}
                    {warningCount ? (
                        <LemonTag type="warning">
                            {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
                        </LemonTag>
                    ) : null}
                    <span className="ml-auto">
                        <ScenarioBar dispatch={dispatch} />
                    </span>
                </div>
                <TestRunBar state={state} dispatch={dispatch} />
                <div className="flex min-h-0 flex-1 @max-[48rem]/proto:flex-col @max-[48rem]/proto:overflow-y-auto">
                    <div
                        className="min-h-0 min-w-0 flex-1 overflow-auto @max-[48rem]/proto:min-h-[420px] @max-[48rem]/proto:flex-none"
                        style={{
                            backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
                            backgroundSize: '16px 16px',
                        }}
                        onClick={(e) => {
                            if (!(e.target as HTMLElement).closest('button, [data-proto-selectable], [role=menu]')) {
                                dispatch({ type: 'select', selection: { type: 'none' } })
                            }
                        }}
                    >
                        <Component state={state} dispatch={dispatch} issues={issues} />
                    </div>
                    <div className="w-[26rem] shrink-0 overflow-y-auto pb-16 @max-[48rem]/proto:w-full">
                        <SettingsPanel state={state} dispatch={dispatch} issues={issues} />
                    </div>
                </div>
            </div>
            <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />
        </div>
    )
}

const meta: Meta = {
    title: 'Products/Workflows/Editor/Prototype: parallel step',
    parameters: {
        layout: 'fullscreen',
        testOptions: { skip: true },
    },
    tags: ['test-skip'],
}
export default meta

export const Playground: StoryFn = () => <ParallelStepPrototype />
export const AddingAParallelStep: StoryFn = () => <ParallelStepPrototype startWithParallel={false} />
export const LanesOnTheCanvas: StoryFn = () => <ParallelStepPrototype initialVariant="A" />
export const OneBlockOpenAPath: StoryFn = () => <ParallelStepPrototype initialVariant="B" />
export const SwimlanesIntoABarrier: StoryFn = () => <ParallelStepPrototype initialVariant="C" />
export const Narrow: StoryFn = () => <ParallelStepPrototype width="32rem" />
