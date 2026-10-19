import type { Meta, StoryFn } from '@storybook/react'
import { useState } from 'react'

import { mswDecorator } from '~/mocks/browser'

import type { HogFlow } from '../hogflows/types'
import { AiDraftOutcome } from './AiDraftOutcome'
import { PREVIEW_WORKFLOW, PROTOTYPE_WORKFLOWS } from './destinationMoveFixtures'
import { DestinationMoveVariantA } from './DestinationMoveVariantA'
import { DestinationMoveVariantB } from './DestinationMoveVariantB'
import { DestinationMoveVariantC } from './DestinationMoveVariantC'
import { AiDraftOutcome as AiDraftOutcomeKey, MoveStep, MoveVariant, PrototypeSwitcher } from './PrototypeSwitcher'

// Three variants of the destination-to-workflow move, switchable from the floating bar, on mocked destination and workflow pages.

const meta: Meta = {
    title: 'Products/Workflows/Prototype/Destination move',
    parameters: { layout: 'fullscreen' },
    tags: ['test-skip'],
    decorators: [
        mswDecorator({
            get: {
                '/api/projects/:team_id/hog_flow_templates/': { count: 0, results: [] },
                // nosemgrep: no-environments-api-urls-frontend -- api.hogFlows has not migrated to generated project routes.
                '/api/environments/:team_id/hog_flows/:id/': ({ params }) => [
                    200,
                    PROTOTYPE_WORKFLOWS[String(params.id)] ?? PREVIEW_WORKFLOW,
                ],
                // nosemgrep: no-environments-api-urls-frontend -- api.messaging has not migrated to generated project routes.
                '/api/environments/:team_id/messaging_categories': { count: 0, results: [] },
            },
            patch: {
                // nosemgrep: no-environments-api-urls-frontend -- api.hogFlows has not migrated to generated project routes.
                '/api/environments/:team_id/hog_flows/:id/': async ({ request, params }) => [
                    200,
                    {
                        ...(PROTOTYPE_WORKFLOWS[String(params.id)] ?? PREVIEW_WORKFLOW),
                        ...((await request.json()) as Partial<HogFlow>),
                    },
                ],
            },
        }),
    ],
}
export default meta

function Prototype({
    initialVariant,
    initialStep = 'entry',
}: {
    initialVariant: MoveVariant
    initialStep?: MoveStep
}): JSX.Element {
    const [variant, setVariant] = useState<MoveVariant>(initialVariant)
    const [step, setStep] = useState<MoveStep>(initialStep)
    const [aiOutcome, setAiOutcome] = useState<AiDraftOutcomeKey>('plain')
    const VariantComponent = { A: DestinationMoveVariantA, B: DestinationMoveVariantB, C: DestinationMoveVariantC }[
        variant
    ]
    return (
        <div className="@container/main-content flex min-h-screen flex-col p-4 pb-32">
            {step === 'ai' ? (
                <AiDraftOutcome outcome={aiOutcome} />
            ) : (
                <VariantComponent step={step} onStepChange={setStep} />
            )}
            <PrototypeSwitcher
                variant={variant}
                step={step}
                aiOutcome={aiOutcome}
                onVariantChange={setVariant}
                onStepChange={setStep}
                onAiOutcomeChange={setAiOutcome}
            />
        </div>
    )
}

export const VariantA: StoryFn = () => <Prototype initialVariant="A" />
export const VariantB: StoryFn = () => <Prototype initialVariant="B" />
export const VariantC: StoryFn = () => <Prototype initialVariant="C" />
export const PreviewA: StoryFn = () => <Prototype initialVariant="A" initialStep="preview" />
export const PreviewB: StoryFn = () => <Prototype initialVariant="B" initialStep="preview" />
export const PreviewC: StoryFn = () => <Prototype initialVariant="C" initialStep="preview" />
export const AiDraft: StoryFn = () => <Prototype initialVariant="A" initialStep="ai" />
