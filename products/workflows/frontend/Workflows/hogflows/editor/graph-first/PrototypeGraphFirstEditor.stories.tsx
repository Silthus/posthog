// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
import type { Meta, StoryFn } from '@storybook/react'
import { BindLogic, useValues } from 'kea'

import { IconSparkles } from '@posthog/icons'
import { LemonButton, LemonTag, SpinnerOverlay } from '@posthog/lemon-ui'

import { workflowLogic } from '../../../workflowLogic'
import { PROTOTYPE_WORKFLOWS } from '../../tree/prototypeWorkflows'
import type { HogFlow, HogFlowAction } from '../../types'
import { workflowEditorStoryDecorator } from '../workflowEditorStoryFixtures'
import { sampleMetrics } from './graphFirstModel'
import { NODE_STYLES, StepNode } from './GraphFirstNodeStyles'
import { PrototypeGraphFirstEditor } from './PrototypeGraphFirstEditor'

const meta: Meta = {
    title: 'Prototypes/Workflows/Graph-first editor',
    parameters: {
        layout: 'fullscreen',
        testOptions: { waitForSelector: '.react-flow__node', viewport: { width: 1440, height: 900 } },
    },
    decorators: [workflowEditorStoryDecorator],
}
export default meta

const SCENE_TABS = ['Workflow', 'Invocations', 'Metrics', 'Assets', 'History']

function SceneChromeMock(): JSX.Element {
    const { originalWorkflow } = useValues(workflowLogic)
    return (
        <div className="shrink-0 border-b bg-surface-primary px-4 pt-3">
            <div className="flex items-center gap-2">
                <h1 className="m-0 text-lg font-semibold">{originalWorkflow?.name}</h1>
                <LemonTag type="muted">Draft</LemonTag>
                <div className="flex-1" />
                <LemonButton size="small" type="secondary">
                    Save draft
                </LemonButton>
                <LemonButton size="small" type="primary">
                    Publish
                </LemonButton>
            </div>
            <div className="mt-2 flex gap-4 text-sm">
                {SCENE_TABS.map((tab, index) => (
                    <span
                        key={tab}
                        className={
                            index === 0
                                ? 'border-b-2 border-[var(--color-accent)] pb-1.5 font-semibold'
                                : 'pb-1.5 text-secondary'
                        }
                    >
                        {tab}
                    </span>
                ))}
            </div>
        </div>
    )
}

function AiPanelMock(): JSX.Element {
    return (
        <aside className="flex w-[420px] shrink-0 flex-col border-l bg-surface-primary">
            <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
                <IconSparkles /> PostHog AI
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4 text-sm">
                <div className="self-end rounded-lg bg-surface-secondary px-3 py-2">
                    Build a launch flow for the Larkspur boot that tests three emails.
                </div>
                <div className="rounded-lg border px-3 py-2 leading-relaxed">
                    I built a workflow with three email variants. Each person gets one launch email in a weekday morning
                    window, then a follow-up if they have not bought within five days.
                </div>
                <div className="mt-auto rounded-lg border px-3 py-2 text-secondary">Ask a follow-up…</div>
            </div>
        </aside>
    )
}

function Frame({ id, aiPanel }: { id: string; aiPanel?: boolean }): JSX.Element {
    return (
        <BindLogic logic={workflowLogic} props={{ id }}>
            <div className="flex h-screen">
                <div className="flex min-w-0 flex-1 flex-col">
                    <SceneChromeMock />
                    <Inner />
                </div>
                {aiPanel && <AiPanelMock />}
            </div>
        </BindLogic>
    )
}

function Inner(): JSX.Element {
    const { originalWorkflow } = useValues(workflowLogic)
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {originalWorkflow ? <PrototypeGraphFirstEditor key={originalWorkflow.id} /> : <SpinnerOverlay />}
        </div>
    )
}

const AB = 'prototype-larkspur-launch-ab-test'
const WELCOME = 'prototype-fernwood-welcome'
const REGIONAL = 'prototype-regional-season-opener'

export const LaunchAbTestWithAiPanel: StoryFn = () => <Frame id={AB} aiPanel />
export const LaunchAbTest: StoryFn = () => <Frame id={AB} />
LaunchAbTest.parameters = { testOptions: { viewport: { width: 1280, height: 900 } } }
export const WelcomeWithAiPanel: StoryFn = () => <Frame id={WELCOME} aiPanel />
export const Welcome: StoryFn = () => <Frame id={WELCOME} />
export const RegionalSeasonOpenerWithAiPanel: StoryFn = () => <Frame id={REGIONAL} aiPanel />
export const RegionalSeasonOpener: StoryFn = () => <Frame id={REGIONAL} />

const GALLERY: [string, string, boolean?][] = [
    [AB, 'trigger_node'],
    [WELCOME, 'trigger_node'],
    [AB, 'route_variant'],
    [WELCOME, 'wait_two_days'],
    [AB, 'story_window'],
    [AB, 'story_email'],
    [AB, 'story_email', true],
    [AB, 'story_wait'],
    [AB, 'exit_node'],
]

function galleryItems(): { workflow: HogFlow; action: HogFlowAction; previews: boolean }[] {
    return GALLERY.flatMap(([workflowId, actionId, previews]) => {
        const workflow = PROTOTYPE_WORKFLOWS[workflowId]
        const action = workflow?.actions.find((candidate) => candidate.id === actionId)
        return workflow && action ? [{ workflow, action, previews: !!previews }] : []
    })
}

function NodeGallery(): JSX.Element {
    const items = galleryItems()
    const metrics = Object.fromEntries(
        Object.values(PROTOTYPE_WORKFLOWS).map((workflow) => [workflow.id, sampleMetrics(workflow)])
    )
    return (
        <div className="flex flex-col gap-8 p-6">
            {NODE_STYLES.map((style) => (
                <section key={style.value} className="flex flex-col gap-3">
                    <h2 className="m-0 text-base font-semibold">
                        {style.label} <span className="text-sm font-normal text-secondary">· {style.tooltip}</span>
                    </h2>
                    <div className="flex flex-wrap items-start gap-5">
                        {items.map(({ workflow, action, previews }, index) => (
                            <StepNode
                                key={index}
                                action={action}
                                workflow={workflow}
                                style={style.value}
                                state={{ previews, metrics: index % 2 === 1 ? metrics[workflow.id] : null }}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    )
}

export const NodeStyles: StoryFn = () => (
    <BindLogic logic={workflowLogic} props={{ id: AB }}>
        <NodeGallery />
    </BindLogic>
)
NodeStyles.parameters = { testOptions: { waitForSelector: 'section' } }
