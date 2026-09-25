// PROTOTYPE (throwaway): tags, saved views and group-by in a dense table (Silthus/posthog#150).
// Importing workflowTagFacets registers the real `tag:` facet and a `health:` facet for every variant.
import './workflowTagFacets'

import { WorkflowsSearchBar } from '../shared/WorkflowsSearchBar'
import { BulkTagBar } from './BulkTagBar'
import { SavedViewTabs } from './SavedViewTabs'
import { TagsVariantToolbar } from './TagsVariantToolbar'
import { WorkflowsTagsTable } from './WorkflowsTagsTable'

export function TagsVariant(): JSX.Element {
    return (
        <div data-attr="workflows-prototype-tags-variant">
            <SavedViewTabs />
            <div className="mb-2">
                <WorkflowsSearchBar />
            </div>
            <TagsVariantToolbar />
            <BulkTagBar />
            <WorkflowsTagsTable />
        </div>
    )
}
