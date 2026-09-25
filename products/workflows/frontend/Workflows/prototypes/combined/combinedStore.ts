// PROTOTYPE (throwaway): what the combined variant keeps in the project's `extra_settings`, with no migration.
// Tags stay in the tags variant's blob, so the `tag:` facet agrees across variants. Tag colors and saved views
// live under their own key, because the tags variant rewrites its blob without fields it doesn't know.
import { TAGS_STORE_KEY, normalizeTag } from '../tags/workflowTagsStore'

export { TAGS_STORE_KEY }
export const COMBINED_STORE_KEY = 'workflows_list_prototype_combined' // pinned: seed_combined.py writes this key

/** Tag colors map onto the data color tokens, so they follow the theme. */
export const TAG_COLORS = {
    blue: 'data-color-1',
    purple: 'data-color-2',
    teal: 'data-color-3',
    magenta: 'data-color-4',
    red: 'data-color-5',
    brown: 'data-color-6',
    green: 'data-color-7',
    orange: 'data-color-12',
    yellow: 'data-color-13',
    violet: 'data-color-14',
} as const

export type TagColor = keyof typeof TAG_COLORS
export const TAG_COLOR_NAMES = Object.keys(TAG_COLORS) as TagColor[]
export const TAG_GROUP_SEPARATOR = '/'

export function randomTagColor(): TagColor {
    return TAG_COLOR_NAMES[Math.floor(Math.random() * TAG_COLOR_NAMES.length)]
}

/** Tags stored before colors existed get a stable color from their name. */
export function fallbackTagColor(tag: string): TagColor {
    let hash = 0
    for (const char of tag) {
        hash = (hash * 31 + char.charCodeAt(0)) | 0
    }
    return TAG_COLOR_NAMES[Math.abs(hash) % TAG_COLOR_NAMES.length]
}

export function tagGroup(tag: string): string | null {
    const index = tag.indexOf(TAG_GROUP_SEPARATOR)
    return index > 0 ? tag.slice(0, index) : null
}

/** Trims each group segment too, so `team / marketing` becomes `team/marketing`. */
export function normalizeTagName(tag: string): string {
    return normalizeTag(tag)
        .split(TAG_GROUP_SEPARATOR)
        .map((part) => part.trim())
        .filter(Boolean)
        .join(TAG_GROUP_SEPARATOR)
}

export interface CombinedView {
    id: string
    name: string
    /** The pills, in the same syntax as the `q` URL param. `me` stands for the signed-in person. */
    q: string
    text: string
    /** Folder path under the Workflows root (`''` is the root). `null` keeps whatever folder is open. */
    folder: string | null
    flat?: boolean
    compact?: boolean
    builtIn?: boolean
}

export interface CombinedStore {
    tags: Record<string, string[]>
    pinnedTags: string[]
    colors: Record<string, TagColor>
    views: CombinedView[]
}

export function readCombinedStore(extraSettings: Record<string, any> | null | undefined): CombinedStore {
    const tagsBlob = extraSettings?.[TAGS_STORE_KEY] ?? {}
    const combinedBlob = extraSettings?.[COMBINED_STORE_KEY] ?? {}
    const colors: Record<string, TagColor> = {}
    for (const [tag, color] of Object.entries(combinedBlob.tag_colors ?? {})) {
        if (TAG_COLOR_NAMES.includes(color as TagColor)) {
            colors[tag] = color as TagColor
        }
    }
    return {
        tags: tagsBlob.tags && typeof tagsBlob.tags === 'object' ? tagsBlob.tags : {},
        pinnedTags: Array.isArray(tagsBlob.pinned_tags) ? tagsBlob.pinned_tags : [],
        colors,
        views: Array.isArray(combinedBlob.views) ? combinedBlob.views : [],
    }
}

/** Merges the store into the latest settings. Keys the combined variant doesn't own are kept as they are. */
export function writeCombinedStore(
    extraSettings: Record<string, any> | null | undefined,
    store: CombinedStore
): Record<string, any> {
    const tagsBlob = extraSettings?.[TAGS_STORE_KEY] ?? {}
    return {
        ...extraSettings,
        [TAGS_STORE_KEY]: {
            version: 1,
            views: [],
            ...tagsBlob,
            tags: store.tags,
            pinned_tags: store.pinnedTags,
        },
        [COMBINED_STORE_KEY]: { version: 1, tag_colors: store.colors, views: store.views },
    }
}

export const BUILT_IN_VIEWS: CombinedView[] = [
    { id: 'all', name: 'All', q: '', text: '', folder: null, builtIn: true },
    { id: 'templates', name: 'Templates', q: 'kind:email-template', text: '', folder: null, flat: true, builtIn: true },
    { id: 'mine', name: 'Mine', q: 'created-by:me', text: '', folder: null, flat: true, builtIn: true },
    {
        id: 'needs-attention',
        name: 'Needs attention',
        q: 'health:failing status:active',
        text: '',
        folder: null,
        flat: true,
        builtIn: true,
    },
    { id: 'drafts', name: 'Drafts', q: 'status:draft', text: '', folder: null, flat: true, builtIn: true },
]
