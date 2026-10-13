import { ProductSetupButton } from 'lib/components/ProductSetup'

import { SceneTitlePanelButton } from '~/layout/scenes/components/SceneTitlePanelButton'

/** Beside the tabs of a narrow scene, Quick start shows only its icon, so it never covers the last tab. */
export function WorkflowSceneTabActions(): JSX.Element {
    return (
        <div className="flex items-center gap-1.5">
            <span title="Quick start" className="@max-[48rem]/workflow-scene:[&_.LemonButton\_\_content]:sr-only">
                <ProductSetupButton />
            </span>
            <SceneTitlePanelButton />
        </div>
    )
}
