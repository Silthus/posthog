// PROTOTYPE (throwaway): the "Steps" variant: one question at a time, full screen, big type, one obvious next button.
import { Spinner } from '@posthog/lemon-ui'

import { EditorStandIn } from '../shared/EditorStandIn'
import { HedgehogRocket } from '../shared/hoggies'
import { BrandSimulation } from '../simulation'
import { ConnectStep } from './ConnectStep'
import { DetectingStep } from './DetectingStep'
import { AppStep, RepoStep } from './RepoStep'
import { ReviewStep } from './ReviewStep'
import { StepScreen } from './StepScreen'

function CreatingStep({ sim }: { sim: BrandSimulation }): JSX.Element {
    return (
        <StepScreen
            phase="creating"
            hoggie={HedgehogRocket}
            title="Building your starter email"
            subtitle={`Brand saved. Now putting ${sim.state.brand.name ? `${sim.state.brand.name}'s` : 'your'} logo, colors and font into a template.`}
            primary={<Spinner className="text-3xl" />}
        />
    )
}

export function StepsVariant({ sim }: { sim: BrandSimulation }): JSX.Element {
    switch (sim.state.phase) {
        case 'connect':
            return <ConnectStep sim={sim} />
        case 'repo':
            return <RepoStep sim={sim} />
        case 'app':
            return <AppStep sim={sim} />
        case 'detecting':
            return <DetectingStep sim={sim} />
        case 'creating':
            return <CreatingStep sim={sim} />
        case 'editor':
            return <EditorStandIn sim={sim} onBack={sim.actions.backToReview} />
        default:
            return <ReviewStep sim={sim} />
    }
}
