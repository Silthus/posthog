// PROTOTYPE (throwaway): the short pause while the branded starter template is created.
import { Spinner } from '@posthog/lemon-ui'

import { HedgehogDeskWizard } from '../shared/hoggies'
import { BrandSimulation } from '../simulation'

export function CreatingState({ sim }: { sim: BrandSimulation }): JSX.Element {
    const name = sim.state.brand.name || 'your'
    return (
        <div
            className="flex flex-col items-center justify-center text-center gap-3 py-24 px-6"
            data-attr="email-brand-page-creating"
        >
            <HedgehogDeskWizard className="w-32" />
            <h2 className="m-0 text-xl font-semibold">Building your starter email</h2>
            <p className="m-0 text-secondary max-w-md">
                Brand saved. Putting {name === 'your' ? 'your' : `${name}'s`} logo, colors and font into a new template.
            </p>
            <Spinner className="text-2xl" />
        </div>
    )
}
