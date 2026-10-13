import { ProductSetupButton } from 'lib/components/ProductSetup'

import { SceneTitlePanelButton } from '~/layout/scenes/components/SceneTitlePanelButton'

export function WorkflowSceneTabActions(): JSX.Element {
    return (
        <div className="flex items-center gap-1.5">
            <ProductSetupButton />
            <SceneTitlePanelButton />
        </div>
    )
}
