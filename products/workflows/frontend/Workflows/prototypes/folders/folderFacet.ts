// PROTOTYPE (throwaway): a `folder:` facet backed by real project tree folders. It replaces the shared
// `::`-prefix facet. Until the folders variant has loaded the tree, it falls back to name prefixes, so the
// other variants keep a working `folder:` facet.
import { registerWorkflowFacet } from '../shared/workflowFacets'

/** Item id to its folder segments under the Workflows root. An empty array means unfiled. */
let folderSegmentsByItemId: Map<string, string[]> | null = null

export function setItemFolders(folders: Map<string, string[]>): void {
    folderSegmentsByItemId = folders
    registerFolderFacet()
}

export const FOLDER_VALUE_SEPARATOR = ' / '

export function folderValue(segments: string[]): string {
    return segments.join(FOLDER_VALUE_SEPARATOR)
}

function registerFolderFacet(): void {
    registerWorkflowFacet({
        key: 'folder',
        label: 'Folder',
        description: folderSegmentsByItemId
            ? 'Folder in the project tree'
            : 'Name prefix, for example Billing:: dunning::',
        getValues: (item) => {
            const segments = folderSegmentsByItemId ? (folderSegmentsByItemId.get(item.id) ?? []) : item.path
            return segments.map((_, index) => folderValue(segments.slice(0, index + 1)))
        },
        hierarchical: true,
        order: 15,
    })
}

registerFolderFacet()
