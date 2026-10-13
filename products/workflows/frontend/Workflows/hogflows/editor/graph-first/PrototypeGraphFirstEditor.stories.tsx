// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
import type { Meta, StoryFn } from '@storybook/react'
import { BindLogic } from 'kea'

import { workflowLogic } from '../../../workflowLogic'
import { PROTOTYPE_WORKFLOWS } from '../../tree/prototypeWorkflows'
import type { HogFlow, HogFlowAction } from '../../types'
import { workflowEditorStoryDecorator } from '../workflowEditorStoryFixtures'
import { sampleMetrics } from './graphFirstModel'
import { NODE_STYLES, StepNode } from './GraphFirstNodeStyles'
import { Frame } from './prototypeStoryFrame'

const meta: Meta = {
    title: 'Prototypes/Workflows/Graph-first editor',
    parameters: {
        layout: 'fullscreen',
        testOptions: { waitForSelector: '.react-flow__node', viewport: { width: 1440, height: 900 } },
    },
    decorators: [workflowEditorStoryDecorator],
}
export default meta

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
