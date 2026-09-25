// PROTOTYPE (throwaway): where the tags variant keeps workflow tags and saved views without a migration.
// HogFlow has no tags field, so everything lives in one JSON blob on the project's `extra_settings`.
// The shape follows upstream drafts PostHog/posthog#103019 and #103021: lowercase tag names per workflow,
// plus the pinned project tags people pick from.

export const TAGS_STORE_KEY = 'workflows_list_prototype' // pinned: seed_tags.py writes this key

export type GroupByKey = 'none' | 'tag' | 'prefix' | 'trigger' | 'channel' | 'status' | 'owner' | 'created-by'

export interface SavedView {
    id: string
    name: string
    /** The pills, in the same syntax as the `q` URL param. `me` stands for the signed-in person. */
    q: string
    text: string
    group: GroupByKey
}

export interface WorkflowTagsStore {
    version: 1
    pinned_tags: string[]
    tags: Record<string, string[]>
    views: SavedView[]
}

export const EMPTY_TAGS_STORE: WorkflowTagsStore = { version: 1, pinned_tags: [], tags: {}, views: [] }

/** The same normalization as `tagify` in posthog/models/tag.py. */
export function normalizeTag(tag: string): string {
    return tag.trim().toLowerCase()
}

export function normalizeTags(tags: string[]): string[] {
    return Array.from(new Set(tags.map(normalizeTag).filter(Boolean)))
}

export function readTagsStore(extraSettings: Record<string, any> | null | undefined): WorkflowTagsStore {
    const raw = extraSettings?.[TAGS_STORE_KEY]
    if (!raw || typeof raw !== 'object') {
        return EMPTY_TAGS_STORE
    }
    return {
        version: 1,
        pinned_tags: Array.isArray(raw.pinned_tags) ? raw.pinned_tags : [],
        tags: raw.tags && typeof raw.tags === 'object' ? raw.tags : {},
        views: Array.isArray(raw.views) ? raw.views : [],
    }
}
