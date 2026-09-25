// PROTOTYPE (throwaway): the combined variant without the side tree, folders as rows (Silthus/posthog#156).
import { BulkBar } from '../combined/BulkBar'
import { ItemsTable } from '../combined/ItemsTable'
import { ManageTagsModal } from '../combined/ManageTagsModal'
import { ScopedSearchBar } from '../combined/ScopedSearchBar'
import { ViewTabs } from '../combined/ViewTabs'
import { BrowserToolbar } from './BrowserToolbar'
import { FolderRowActions } from './FolderRowActions'
import { useBrowserRowProps } from './useBrowserRowProps'

export function BrowserVariant(): JSX.Element {
    const rowProps = useBrowserRowProps()
    return (
        <div className="@container/variant" data-attr="workflows-prototype-browser-variant">
            <ViewTabs />
            <div className="mb-3">
                <ScopedSearchBar />
            </div>
            <div className="@container">
                <BrowserToolbar />
                <BulkBar />
                <ItemsTable
                    showFolderRows
                    folderRowActions={(folder) => <FolderRowActions folder={folder} />}
                    onRow={rowProps}
                />
            </div>
            <ManageTagsModal />
        </div>
    )
}
