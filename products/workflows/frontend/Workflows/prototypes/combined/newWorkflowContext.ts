// PROTOTYPE (throwaway): carries the list's folder and tag filter through the usual "New workflow" chooser to the
// moment the editor creates the workflow. The chooser and the editor are separate routes, so the context waits in
// session storage. `workflowLogic` reads it when it creates a workflow, and nowhere else.
import api from 'lib/api'

import { TAGS_STORE_KEY } from './combinedStore'

const STORAGE_KEY = 'workflows-prototype-new-workflow-context'
// A chooser left open this long is abandoned, so a later "New workflow" from elsewhere doesn't inherit it.
const MAX_AGE_MS = 30 * 60 * 1000

export interface NewWorkflowContext {
    /** A project tree folder, for example `Billing/Cards`. `null` files it in `Unfiled/Workflows`. */
    folder: string | null
    tags: string[]
    createdAt: number
}

export function setNewWorkflowContext(folder: string | null, tags: string[]): void {
    const context: NewWorkflowContext = { folder, tags, createdAt: Date.now() }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context))
}

function readContext(): NewWorkflowContext | null {
    try {
        const context = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as NewWorkflowContext | null
        return context && Date.now() - context.createdAt < MAX_AGE_MS ? context : null
    } catch {
        return null
    }
}

/** Extra fields for the create request. */
export function newWorkflowCreateFields(): { _create_in_folder?: string } {
    const folder = readContext()?.folder
    return folder ? { _create_in_folder: folder } : {}
}

/** Tags the new workflow with the list's tag filter, then forgets the context. */
export async function applyNewWorkflowContext(workflowId: string): Promise<void> {
    const context = readContext()
    sessionStorage.removeItem(STORAGE_KEY)
    if (!context?.tags.length) {
        return
    }
    try {
        const team = await api.get('api/environments/@current/')
        const extraSettings = team.extra_settings ?? {}
        const blob = extraSettings[TAGS_STORE_KEY] ?? { version: 1, pinned_tags: [], tags: {}, views: [] }
        await api.update('api/environments/@current/', {
            extra_settings: {
                ...extraSettings,
                [TAGS_STORE_KEY]: { ...blob, tags: { ...blob.tags, [workflowId]: context.tags } },
            },
        })
    } catch (error) {
        console.error('Could not tag the new workflow', error)
    }
}
