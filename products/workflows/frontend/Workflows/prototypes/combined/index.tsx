// PROTOTYPE (throwaway): the combined variant, round 2 (Silthus/posthog#155). This file is only the layout: view
// tabs, the scoped pill search, and the side tree beside the list. Every piece is layout-agnostic, so another layout
// (the browser variant, with folder rows instead of a tree) reuses them with its own shell:
//   ViewTabs, ScopedSearchBar, ListToolbar (or ScopeBreadcrumbs, DisplayOptions, NewWorkflowButton), BulkBar,
//   ItemsTable (`showFolderRows`), ManageTagsModal, all driven by combinedVariantLogic.
import { BulkBar } from './BulkBar'
import { CombinedFolderTree } from './CombinedFolderTree'
import { ItemsTable } from './ItemsTable'
import { ListToolbar } from './ListToolbar'
import { ManageTagsModal } from './ManageTagsModal'
import { ScopedSearchBar } from './ScopedSearchBar'
import { ViewTabs } from './ViewTabs'

export function CombinedVariant(): JSX.Element {
    return (
        <div className="@container/variant" data-attr="workflows-prototype-combined-variant">
            <ViewTabs />
            <div className="mb-3">
                <ScopedSearchBar />
            </div>
            <div className="flex gap-3 items-start">
                <aside className="hidden @4xl/variant:block w-52 @5xl/variant:w-60 shrink-0 border rounded bg-surface-primary sticky top-0 max-h-[80vh] overflow-y-auto">
                    <CombinedFolderTree />
                </aside>
                <div className="flex-1 min-w-0 @container">
                    <ListToolbar folderMenuClassName="@4xl/variant:hidden" />
                    <BulkBar />
                    <ItemsTable />
                </div>
            </div>
            <ManageTagsModal />
        </div>
    )
}
