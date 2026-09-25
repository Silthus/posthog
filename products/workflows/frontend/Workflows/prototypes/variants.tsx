// PROTOTYPE (throwaway): every workflows list variant, switchable with `?variant=` on the Workflows tab.
// Variant workers edit only their own directory. This registry already points at each of them.
import { WorkflowsTable } from '../WorkflowsTable'
import { EmailsVariant } from './emails'
import { FoldersVariant } from './folders'
import { SearchVariant } from './search'
import { TagsVariant } from './tags'
import { TilesVariant } from './tiles'

export interface WorkflowsListVariant {
    key: string
    label: string
    description: string
    Component: () => JSX.Element
}

export const WORKFLOWS_LIST_VARIANTS: WorkflowsListVariant[] = [
    { key: 'baseline', label: 'Baseline', description: "Today's list, unchanged", Component: WorkflowsTable },
    {
        key: 'search',
        label: 'Search',
        description: "Today's columns, driven by one search bar with filter pills",
        Component: SearchVariant,
    },
    { key: 'folders', label: 'Folders', description: 'Folders and files', Component: FoldersVariant },
    { key: 'tags', label: 'Tags', description: 'Tags to filter and group by', Component: TagsVariant },
    { key: 'tiles', label: 'Tiles', description: 'List and tile switch', Component: TilesVariant },
    { key: 'emails', label: 'Emails', description: 'Which emails each workflow sends', Component: EmailsVariant },
]

export const DEFAULT_WORKFLOWS_LIST_VARIANT = 'baseline'
