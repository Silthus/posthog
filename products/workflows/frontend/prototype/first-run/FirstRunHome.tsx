// PROTOTYPE ONLY (silthus/posthog#212). What a team sees in the Workflows tab before its first workflow,
// in the homepage variant the floating bar picked.
import { useValues } from 'kea'

import { ExampleInboxModal } from './ExampleInboxModal'
import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { HomeAiWalkthrough } from './homes/HomeAiWalkthrough'
import { HomeBrandFirst } from './homes/HomeBrandFirst'
import { HomeExampleFirst } from './homes/HomeExampleFirst'
import { HomeTailoredGallery } from './homes/HomeTailoredGallery'
import { HomeVariant } from './homeVariants'
import { MissingDataHelp } from './shared/MissingDataHelp'

const HOMES: Record<HomeVariant, () => JSX.Element> = {
    F: HomeExampleFirst,
    G: HomeTailoredGallery,
    H: HomeAiWalkthrough,
    I: HomeBrandFirst,
}

export function FirstRunHome(): JSX.Element {
    const { homeVariant, facts } = useValues(firstRunPrototypeLogic)
    const Home = HOMES[homeVariant]

    return (
        <div className="flex flex-col gap-4">
            <MissingDataHelp facts={facts} />
            <Home key={homeVariant} />
            <ExampleInboxModal />
        </div>
    )
}
