// PROTOTYPE ONLY (silthus/posthog#212). What a team sees in the Workflows tab before its first workflow.
import { useValues } from 'kea'

import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { MissingDataHelp } from './shared/MissingDataHelp'
import { TemplateGallery } from './TemplateGallery'

export function FirstRunHome(): JSX.Element {
    const { facts } = useValues(firstRunPrototypeLogic)

    return (
        <div className="flex flex-col gap-4">
            <MissingDataHelp facts={facts} />
            <TemplateGallery />
        </div>
    )
}
