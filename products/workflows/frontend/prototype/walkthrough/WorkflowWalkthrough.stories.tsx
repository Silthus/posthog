import type { Meta, StoryFn } from '@storybook/react'
import { BindLogic, useValues } from 'kea'
import { useEffect } from 'react'

import { LemonButton, SpinnerOverlay } from '@posthog/lemon-ui'

import { HogFlowEditor } from '../../Workflows/hogflows/HogFlowEditor'
import { workflowLogic } from '../../Workflows/workflowLogic'
import { WorkflowStatusBar } from '../../Workflows/WorkflowStatusBar'
import { CoachMarksWalkthrough } from './CoachMarksWalkthrough'
import { PostHogAiLeadsPanel } from './PostHogAiLeadsPanel'
import { useWalkthrough } from './useWalkthrough'
import {
    WELCOME_SEQUENCE_WORKFLOW_ID,
    resetSavedWorkflow,
    welcomeSequenceStoryDecorator,
} from './welcomeSequenceWorkflow'

// Prototype, not production: two variants of a guided walkthrough of a user's first workflow.
// "coach-marks" anchors a card to the selected node; "ai-leads" carries the walkthrough as
// PostHog AI messages in a look-alike side panel. See README.md in this directory.

type Variant = 'coach-marks' | 'ai-leads'

interface WalkthroughStoryProps {
    variant: Variant
    chipsEnabled?: boolean
    otherSidePanelOpen?: boolean
}

const meta: Meta<WalkthroughStoryProps> = {
    title: 'Products/Workflows/Prototype/Walkthrough',
    parameters: { layout: 'fullscreen' },
    tags: ['test-skip'],
    decorators: [welcomeSequenceStoryDecorator],
}
export default meta

function FakeNavSidebar(): JSX.Element {
    return <aside className="w-[215px] shrink-0 border-r bg-surface-secondary" />
}

function OtherSidePanel(): JSX.Element {
    return (
        <aside className="flex w-[512px] shrink-0 flex-col border-l bg-surface-secondary">
            <header className="flex h-[50px] items-center border-b px-3 font-medium">Notebooks</header>
        </aside>
    )
}

function WalkthroughScene({
    variant,
    chipsEnabled = true,
    otherSidePanelOpen = false,
}: WalkthroughStoryProps): JSX.Element {
    const { originalWorkflow, hasUnsavedChanges, hasStagedDraft } = useValues(workflowLogic)
    const walkthrough = useWalkthrough()
    const hasDraft = hasUnsavedChanges || hasStagedDraft

    return (
        <div className="flex h-screen w-screen overflow-hidden">
            <FakeNavSidebar />
            <main className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="mb-0 truncate">{originalWorkflow?.name ?? 'Workflow'}</h3>
                    <div className="flex shrink-0 gap-2">
                        <LemonButton
                            type="secondary"
                            size="small"
                            onClick={walkthrough.start}
                            disabledReason={walkthrough.active ? 'The walkthrough is running' : undefined}
                        >
                            Start walkthrough
                        </LemonButton>
                        <LemonButton
                            type="primary"
                            size="small"
                            disabledReason={hasDraft ? undefined : 'No changes staged to publish'}
                        >
                            Publish
                        </LemonButton>
                    </div>
                </div>
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
                    <WorkflowStatusBar
                        id={WELCOME_SEQUENCE_WORKFLOW_ID}
                        editorLayout="advanced"
                        showEditorLayoutToggle={false}
                        onEditorLayoutChange={() => {}}
                    />
                    {originalWorkflow ? (
                        <HogFlowEditor key={originalWorkflow.id} isTreeView={false} />
                    ) : (
                        <SpinnerOverlay />
                    )}
                    {variant === 'coach-marks' && (
                        <CoachMarksWalkthrough walkthrough={walkthrough} chipsEnabled={chipsEnabled} />
                    )}
                </div>
            </main>
            {variant === 'ai-leads' ? (
                <PostHogAiLeadsPanel walkthrough={walkthrough} chipsEnabled={chipsEnabled} />
            ) : (
                otherSidePanelOpen && <OtherSidePanel />
            )}
        </div>
    )
}

const WalkthroughStory: StoryFn<WalkthroughStoryProps> = (props) => {
    useEffect(() => resetSavedWorkflow(), [])
    return (
        <BindLogic logic={workflowLogic} props={{ id: WELCOME_SEQUENCE_WORKFLOW_ID }}>
            <WalkthroughScene {...props} />
        </BindLogic>
    )
}

export const CoachMarks: StoryFn<WalkthroughStoryProps> = WalkthroughStory.bind({})
CoachMarks.args = { variant: 'coach-marks' }

export const CoachMarksBesideSidePanel: StoryFn<WalkthroughStoryProps> = WalkthroughStory.bind({})
CoachMarksBesideSidePanel.args = { variant: 'coach-marks', otherSidePanelOpen: true }

export const CoachMarksWithoutPostHogAi: StoryFn<WalkthroughStoryProps> = WalkthroughStory.bind({})
CoachMarksWithoutPostHogAi.args = { variant: 'coach-marks', chipsEnabled: false }

export const PostHogAiLeads: StoryFn<WalkthroughStoryProps> = WalkthroughStory.bind({})
PostHogAiLeads.args = { variant: 'ai-leads' }
