// PROTOTYPE ONLY (silthus/posthog#212). What a team sees in the Workflows tab before its first workflow,
// in the homepage variant the floating bar picked.
import { useValues } from 'kea'

import { ExampleInboxModal } from './ExampleInboxModal'
import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { HomeAiDraft } from './homes/HomeAiDraft'
import { HomeFirstWeek } from './homes/HomeFirstWeek'
import { HomeOneButton } from './homes/HomeOneButton'
import { HomePitchAndPreview } from './homes/HomePitchAndPreview'
import { HomeRecentSignups } from './homes/HomeRecentSignups'
import { HomeVariant } from './homeVariants'

const HOMES: Record<HomeVariant, () => JSX.Element> = {
    A: HomePitchAndPreview,
    B: HomeRecentSignups,
    C: HomeOneButton,
    D: HomeFirstWeek,
    E: HomeAiDraft,
}

export function FirstRunHome(): JSX.Element {
    const { homeVariant } = useValues(firstRunPrototypeLogic)
    const Home = HOMES[homeVariant]

    return (
        <>
            <Home key={homeVariant} />
            <ExampleInboxModal />
        </>
    )
}
