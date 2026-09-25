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

/** Optional list columns. Name is always shown. */
export type ColumnKey = 'tags' | 'status' | 'sends' | 'updated' | 'trigger' | 'owner' | 'createdBy' | 'last7' | 'health'

export const COLUMN_LABELS: Record<ColumnKey, string> = {
    tags: 'Tags',
    status: 'Status',
    sends: 'Sends',
    updated: 'Updated',
    trigger: 'Trigger',
    owner: 'Owner',
    createdBy: 'Created by',
    last7: 'Last 7 days',
    health: 'Health',
}

/** Picker order: the default set first, then the optional ones. */
export const COLUMN_ORDER: ColumnKey[] = [
    'tags',
    'status',
    'sends',
    'updated',
    'trigger',
    'owner',
    'createdBy',
    'last7',
    'health',
]
export const DEFAULT_COLUMNS: ColumnKey[] = ['tags', 'status', 'sends', 'updated']

export function normalizeColumns(columns: unknown): ColumnKey[] {
    if (!Array.isArray(columns)) {
        return DEFAULT_COLUMNS
    }
    return COLUMN_ORDER.filter((key) => columns.includes(key))
}

export interface CombinedView {
    id: string
    name: string
    /** The pills, in the same syntax as the `q` URL param. `me` stands for the signed-in person. */
    q: string
    text: string
    /** The scope folder under the Workflows root (`''` is the root). `null` keeps whatever folder is open. */
    folder: string | null
    flat: boolean
    compact: boolean
    columns: ColumnKey[]
    /** The user's uuid. Only they get "Update view". */
    createdBy?: string | null
    builtIn?: boolean
}

/** Saved views from before v2 lack the display settings, so they get the defaults. */
export function normalizeView(raw: Record<string, any>): CombinedView {
    return {
        id: String(raw.id),
        name: String(raw.name ?? 'Untitled view'),
        q: String(raw.q ?? ''),
        text: String(raw.text ?? ''),
        folder: typeof raw.folder === 'string' ? raw.folder : null,
        flat: !!raw.flat,
        compact: raw.compact === undefined ? true : !!raw.compact,
        columns: normalizeColumns(raw.columns),
        createdBy: raw.created_by ?? raw.createdBy ?? null,
        builtIn: !!raw.builtIn,
    }
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
        views: Array.isArray(combinedBlob.views) ? combinedBlob.views.map(normalizeView) : [],
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
        [COMBINED_STORE_KEY]: {
            version: 2,
            tag_colors: store.colors,
            views: store.views.map(({ createdBy, builtIn: _builtIn, ...view }) => ({
                ...view,
                created_by: createdBy ?? null,
            })),
        },
    }
}

const builtIn = (id: string, name: string, q: string, columns: ColumnKey[] = DEFAULT_COLUMNS): CombinedView => ({
    id,
    name,
    q,
    text: '',
    folder: null,
    flat: false,
    compact: true,
    columns: normalizeColumns(columns),
    builtIn: true,
})

/** Built-in views keep whatever folder is open, so browsing the tree doesn't mark them modified. */
export const BUILT_IN_VIEWS: CombinedView[] = [
    builtIn('all', 'All', ''),
    builtIn('templates', 'Templates', 'kind:email-template'),
    builtIn('mine', 'Mine', 'created-by:me'),
    builtIn('needs-attention', 'Needs attention', 'health:failing status:active', [
        'tags',
        'status',
        'sends',
        'last7',
        'health',
        'updated',
    ]),
    builtIn('drafts', 'Drafts', 'status:draft'),
]
