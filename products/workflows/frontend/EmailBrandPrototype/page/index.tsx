// PROTOTYPE (throwaway): the "Page" variant, an Email brand settings page under Channels you come back to.
import { EditorStandIn } from '../shared/EditorStandIn'
import { BrandSimulation } from '../simulation'
import { BrandPage } from './BrandPage'
import { CreatingState } from './CreatingState'

export function PageVariant({ sim }: { sim: BrandSimulation }): JSX.Element {
    if (sim.state.phase === 'editor') {
        return <EditorStandIn sim={sim} onBack={sim.actions.backToReview} />
    }
    if (sim.state.phase === 'creating') {
        return <CreatingState sim={sim} />
    }
    return <BrandPage sim={sim} />
}
