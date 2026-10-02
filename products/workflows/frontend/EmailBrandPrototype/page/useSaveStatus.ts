// PROTOTYPE (throwaway): fakes the save request and tracks unsaved edits, which the simulation does not.
import { useState } from 'react'

import { lemonToast } from '@posthog/lemon-ui'

import { BrandSimulation } from '../simulation'

export interface SaveStatus {
    saving: boolean
    neverSaved: boolean
    dirty: boolean
    save: () => void
}

export function useSaveStatus(sim: BrandSimulation): SaveStatus {
    const current = JSON.stringify(sim.state.brand)
    const [savedSnapshot, setSavedSnapshot] = useState<string | null>(() => (sim.state.brandSaved ? current : null))
    const [saving, setSaving] = useState(false)

    const save = (): void => {
        setSaving(true)
        setTimeout(() => {
            sim.actions.saveBrand()
            setSavedSnapshot(current)
            setSaving(false)
            lemonToast.success('Email brand saved')
        }, 700 / sim.scenario.speed)
    }

    return {
        saving,
        neverSaved: savedSnapshot === null,
        dirty: savedSnapshot !== null && savedSnapshot !== current,
        save,
    }
}
