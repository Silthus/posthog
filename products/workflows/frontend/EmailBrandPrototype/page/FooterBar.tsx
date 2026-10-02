// PROTOTYPE (throwaway): the sticky action bar with save state, "Save brand" and "Create starter template".
import { IconCheck, IconLetter } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { BrandSimulation } from '../simulation'
import { SaveStatus } from './useSaveStatus'

export function FooterBar({ sim, save }: { sim: BrandSimulation; save: SaveStatus }): JSX.Element {
    const blockedReason =
        sim.state.phase === 'detecting'
            ? 'Wait for detection to finish'
            : !sim.state.brand.name.trim()
              ? 'Add a brand name first'
              : undefined
    const saveReason = blockedReason ?? (!save.neverSaved && !save.dirty ? 'No changes to save' : undefined)

    return (
        <div className="sticky bottom-0 z-10 border-t bg-surface-primary" data-attr="email-brand-page-footer">
            <div className="max-w-[76rem] mx-auto px-4 @md:px-6 py-3 flex flex-wrap items-center gap-2">
                <SaveLabel save={save} />
                <div className="ml-auto flex flex-wrap gap-2">
                    <LemonButton type="secondary" onClick={save.save} loading={save.saving} disabledReason={saveReason}>
                        Save brand
                    </LemonButton>
                    <LemonButton
                        type="primary"
                        icon={<IconLetter />}
                        onClick={sim.actions.createTemplate}
                        disabledReason={blockedReason ?? (save.saving ? 'Saving' : undefined)}
                        tooltip="Saves the brand, then opens a new template that uses it"
                    >
                        Create starter template
                    </LemonButton>
                </div>
            </div>
        </div>
    )
}

function SaveLabel({ save }: { save: SaveStatus }): JSX.Element {
    if (save.neverSaved) {
        return <span className="text-xs text-secondary">Not saved yet</span>
    }
    if (save.dirty) {
        return <span className="text-xs text-warning">Unsaved changes</span>
    }
    return (
        <span className="text-xs text-success flex items-center gap-1">
            <IconCheck /> Saved
        </span>
    )
}
