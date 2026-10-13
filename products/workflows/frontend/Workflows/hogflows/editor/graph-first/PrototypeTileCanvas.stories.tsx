// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// The tile canvas: n8n-style tiles, hover cards that grow out of the tile, and three ways to connect them.
import type { Meta, StoryFn } from '@storybook/react'
import { BindLogic } from 'kea'

import { workflowLogic } from '../../../workflowLogic'
import { TILE_WORKFLOWS } from '../../tree/prototypeTileWorkflows'
import type { HogFlow, HogFlowAction } from '../../types'
import { workflowEditorStoryDecorator } from '../workflowEditorStoryFixtures'
import { sampleMetrics } from './graphFirstModel'
import { Frame } from './prototypeStoryFrame'
import { TILE_HOVERS, TileFlow, TileHover, TileNode } from './TileNode'

const meta: Meta = {
    title: 'Prototypes/Workflows/Tile canvas',
    parameters: {
        layout: 'fullscreen',
        testOptions: { waitForSelector: '.react-flow__node', viewport: { width: 1440, height: 900 } },
    },
    decorators: [workflowEditorStoryDecorator],
}
export default meta

const byId = Object.fromEntries(TILE_WORKFLOWS.map((flow) => [flow.id, flow]))

function tiles(
    id: string,
    flow: TileFlow = 'down',
    options: { aiPanel?: boolean; chat?: { ask: string; answer: string } } = {}
): StoryFn {
    const Story: StoryFn = () => (
        <Frame
            id={id}
            aiPanel={options.aiPanel}
            chat={options.chat}
            editor={{
                initialNodeStyle: 'tiles',
                initialTileFlow: flow,
                initialTileHover: 'mixed',
                showStyleSwitch: false,
            }}
        />
    )
    return Story
}

export const WelcomeSequence = tiles('prototype-tile-welcome-sequence')
export const WelcomeSequenceRight = tiles('prototype-tile-welcome-sequence', 'right')
export const WelcomeSequenceRail = tiles('prototype-tile-welcome-sequence', 'rail')
export const TicketToSlack = tiles('prototype-tile-ticket-to-slack')
export const NegativeSurveyAlert = tiles('prototype-tile-negative-survey')
export const TrialToPaid = tiles('prototype-tile-trial-to-paid')
export const TrialToPaidRight = tiles('prototype-tile-trial-to-paid', 'right')
export const AbandonedCheckout = tiles('prototype-tile-abandoned-checkout')
export const PaymentFailed = tiles('prototype-tile-payment-failed', 'rail')
export const AiIncidentInvestigator = tiles('prototype-tile-sre-investigator')
export const WeeklyReport = tiles('prototype-tile-weekly-report', 'right')
export const AiSupportTriage = tiles('prototype-tile-ai-triage')
export const AiSupportTriageWithAiPanel = tiles('prototype-tile-ai-triage', 'down', {
    aiPanel: true,
    chat: {
        ask: 'Triage new support tickets with AI. Answer how-to questions, route bugs and billing.',
        answer: 'I built a flow where an AI step sorts each ticket. How-to questions get an AI reply, and a person checks the unsure ones. Bugs go to engineering, billing tickets to billing.',
    },
})
export const LaunchAbTestWithAiPanel: StoryFn = () => (
    <Frame
        id="prototype-larkspur-launch-ab-test"
        aiPanel
        editor={{ initialNodeStyle: 'tiles', initialTileHover: 'mixed', showStyleSwitch: false }}
    />
)

// --- Galleries ---

const STEP_KINDS: [string, string][] = [
    ['prototype-tile-welcome-sequence', 'trigger_node'],
    ['prototype-tile-weekly-report', 'trigger_node'],
    ['prototype-tile-payment-failed', 'trigger_node'],
    ['prototype-tile-negative-survey', 'trigger_node'],
    ['prototype-tile-welcome-sequence', 'welcome'],
    ['prototype-tile-ticket-to-slack', 'urgent_slack'],
    ['prototype-tile-ai-triage', 'classify'],
    ['prototype-tile-ai-triage', 'draft_reply'],
    ['prototype-tile-sre-investigator', 'investigate'],
    ['prototype-tile-negative-survey', 'summarize_replay'],
    ['prototype-tile-weekly-report', 'run_insights'],
    ['prototype-tile-ai-triage', 'send_reply'],
    ['prototype-tile-ai-triage', 'save_note'],
    ['prototype-tile-ai-triage', 'tag_bug'],
    ['prototype-tile-payment-failed', 'mark_past_due'],
    ['prototype-tile-sre-investigator', 'page_oncall'],
    ['prototype-tile-ai-triage', 'by_category'],
    ['prototype-tile-welcome-sequence', 'wait_three_days'],
    ['prototype-tile-abandoned-checkout', 'wait_order'],
    ['prototype-tile-ticket-to-slack', 'business_hours'],
    ['prototype-tile-trial-to-paid', 'exit_converted'],
]

function lookup(pairs: [string, string][]): { workflow: HogFlow; action: HogFlowAction }[] {
    return pairs.flatMap(([workflowId, actionId]) => {
        const workflow = byId[workflowId]
        const action = workflow?.actions.find((candidate) => candidate.id === actionId)
        return workflow && action ? [{ workflow, action }] : []
    })
}

function Bound({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <BindLogic logic={workflowLogic} props={{ id: 'prototype-tile-ai-triage' }}>
            {children}
        </BindLogic>
    )
}

export const StepKinds: StoryFn = () => {
    const items = lookup(STEP_KINDS)
    return (
        <Bound>
            <div className="flex flex-col gap-6 p-8">
                <h2 className="m-0 text-base font-semibold">
                    Step kinds <span className="text-sm font-normal text-secondary">· hover a tile to open it</span>
                </h2>
                <div className="flex flex-wrap gap-x-4 gap-y-10">
                    {items.map(({ workflow, action }, index) => (
                        <TileNode
                            key={index}
                            action={action}
                            workflow={workflow}
                            hover="mixed"
                            state={{ metrics: index % 3 === 0 ? sampleMetrics(workflow) : null }}
                        />
                    ))}
                </div>
            </div>
        </Bound>
    )
}
StepKinds.parameters = { testOptions: { waitForSelector: 'h2' } }

const HOVER_EXAMPLES: [string, string][] = [
    ['prototype-tile-welcome-sequence', 'welcome'],
    ['prototype-tile-ticket-to-slack', 'urgent_slack'],
    ['prototype-tile-ai-triage', 'classify'],
    ['prototype-tile-negative-survey', 'summarize_replay'],
    ['prototype-tile-weekly-report', 'run_insights'],
    ['prototype-tile-ai-triage', 'by_category'],
    ['prototype-tile-abandoned-checkout', 'wait_order'],
]

function HoverRow({ variant }: { variant: TileHover }): JSX.Element {
    const items = lookup(HOVER_EXAMPLES)
    const meta = TILE_HOVERS.find((hover) => hover.value === variant)!
    return (
        <section className="flex flex-col gap-4">
            <h2 className="m-0 text-base font-semibold">
                {meta.label} <span className="text-sm font-normal text-secondary">· {meta.tooltip}</span>
            </h2>
            <div className="flex flex-wrap gap-6 pb-4 pt-4">
                {items.map(({ workflow, action }, index) => (
                    <div key={index} className="flex min-h-[560px] w-[410px] shrink-0 justify-center pt-4">
                        <TileNode
                            action={action}
                            workflow={workflow}
                            hover={variant}
                            forceOpen
                            state={{ metrics: sampleMetrics(workflow) }}
                        />
                    </div>
                ))}
            </div>
        </section>
    )
}

export const HoverCards: StoryFn = () => (
    <Bound>
        <div className="flex flex-col gap-4 p-8">
            {(['mixed', 'preview', 'fields'] as TileHover[]).map((variant) => (
                <HoverRow key={variant} variant={variant} />
            ))}
        </div>
    </Bound>
)
HoverCards.parameters = { testOptions: { waitForSelector: 'section' } }
