// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
// The tile canvas: n8n-style tiles, hover cards that grow out of the tile, and three ways to connect them.
import type { Meta, StoryFn } from '@storybook/react'
import { BindLogic } from 'kea'

import { workflowLogic } from '../../../workflowLogic'
import { TILE_WORKFLOWS } from '../../tree/prototypeTileWorkflows'
import type { HogFlow, HogFlowAction } from '../../types'
import { workflowEditorStoryDecorator } from '../workflowEditorStoryFixtures'
import type { ToolbarVariant } from './CanvasCommands'
import { sampleMetrics } from './graphFirstModel'
import type { GroupStyle } from './PrototypeGraphFirstEditor'
import { Frame } from './prototypeStoryFrame'
import { PeekDetail, TileFlow, TileNode } from './TileNode'

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

type TileOptions = {
    flow?: TileFlow
    open?: boolean
    aiPanel?: boolean
    chat?: { ask: string; answer: string }
    groups?: GroupStyle
    peek?: PeekDetail
    toolbar?: ToolbarVariant
}

function tiles(id: string, options: TileOptions = {}): StoryFn {
    const Story: StoryFn = () => (
        <Frame
            id={id}
            aiPanel={options.aiPanel}
            chat={options.chat}
            editor={{
                initialNodeStyle: 'tiles',
                initialTileFlow: options.flow ?? 'rail',
                initialGroupStyle: options.groups,
                initialCollapsed: options.open ? 'auto' : 'all',
                initialPeek: options.peek,
                initialToolbar: options.toolbar,
                showStyleSwitch: false,
            }}
        />
    )
    return Story
}

const TRIAGE_CHAT = {
    ask: 'Triage new support tickets with AI. Answer how-to questions, route bugs and billing.',
    answer: 'I built a flow where an AI step sorts each ticket. How-to questions get an AI reply, and a person checks the unsure ones. Bugs go to engineering, billing tickets to billing.',
}

export const AiSupportTriageWithAiPanel = tiles('prototype-tile-ai-triage', { aiPanel: true, chat: TRIAGE_CHAT })
export const AiSupportTriage = tiles('prototype-tile-ai-triage')
export const ToolbarFloating = tiles('prototype-tile-trial-to-paid', { toolbar: 'floating' })
export const ToolbarHeader = tiles('prototype-tile-trial-to-paid', { toolbar: 'header' })
export const ToolbarRail = tiles('prototype-tile-trial-to-paid', { toolbar: 'rail' })
export const ToolbarCommand = tiles('prototype-tile-trial-to-paid', { toolbar: 'command' })
export const AiSupportTriageOpen = tiles('prototype-tile-ai-triage', { open: true })
export const WelcomeSequence = tiles('prototype-tile-welcome-sequence')
export const SpringDripCampaign = tiles('prototype-tile-spring-drip')
export const BlackFriday = tiles('prototype-tile-black-friday')
export const AutoFixCiFailures = tiles('prototype-tile-ci-autofix')
export const AutoFixCiFailuresPeekUnfold = tiles('prototype-tile-ci-autofix', { peek: 'unfold' })
export const FeatureFlagRolloutPeekUnfold = tiles('prototype-tile-flag-rollout', { peek: 'unfold' })
export const AutoFixCiFailuresOpen = tiles('prototype-tile-ci-autofix', { open: true })
export const FeatureFlagRollout = tiles('prototype-tile-flag-rollout')
export const FeatureFlagRolloutWithAiPanel = tiles('prototype-tile-flag-rollout', {
    aiPanel: true,
    chat: {
        ask: 'Roll out new-checkout over three weeks. Roll back if errors go up, and keep #releases posted.',
        answer: 'I built a rollout that goes 10%, 50%, then 100%, one week apart. Before each step it checks the checkout error rate. At 2% or more it rolls back to 0% and tells #releases.',
    },
})
export const TicketToSlack = tiles('prototype-tile-ticket-to-slack')
export const NegativeSurveyAlert = tiles('prototype-tile-negative-survey')
export const TrialToPaid = tiles('prototype-tile-trial-to-paid')
export const TrialToPaidDown = tiles('prototype-tile-trial-to-paid', { flow: 'down', open: true })
export const AbandonedCheckout = tiles('prototype-tile-abandoned-checkout')
export const PaymentFailed = tiles('prototype-tile-payment-failed')
export const AiIncidentInvestigator = tiles('prototype-tile-sre-investigator')
export const WeeklyReportRight = tiles('prototype-tile-weekly-report', { flow: 'right' })
export const LaunchAbTestWithAiPanel: StoryFn = () => (
    <Frame
        id="prototype-larkspur-launch-ab-test"
        aiPanel
        editor={{ initialNodeStyle: 'tiles', initialTileFlow: 'rail', initialCollapsed: 'all', showStyleSwitch: false }}
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
                            hover
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

export const HoverCards: StoryFn = () => (
    <Bound>
        <div className="flex flex-wrap gap-6 p-8">
            {lookup(HOVER_EXAMPLES).map(({ workflow, action }, index) => (
                <div key={index} className="flex min-h-[560px] w-[410px] shrink-0 justify-center pt-4">
                    <TileNode
                        action={action}
                        workflow={workflow}
                        hover
                        forceOpen
                        state={{ metrics: sampleMetrics(workflow) }}
                    />
                </div>
            ))}
        </div>
    </Bound>
)
HoverCards.parameters = { testOptions: { waitForSelector: '[data-tile-anchor]' } }
