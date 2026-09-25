// PROTOTYPE (throwaway): the blend picked in round 1 (Silthus/posthog#154). Folders are the base, saved views sit
// as tabs above the pill search, and workflows carry colored tags with `/` groups.
import './combinedFacets'

import { useValues } from 'kea'

import { WorkflowsSearchBar } from '../shared/WorkflowsSearchBar'
import { BulkBar } from './BulkBar'
import { CombinedBreadcrumbs } from './CombinedBreadcrumbs'
import { CombinedContents } from './CombinedContents'
import { CombinedFolderTree } from './CombinedFolderTree'
import { combinedVariantLogic } from './combinedVariantLogic'
import { CombinedViewTabs } from './CombinedViewTabs'

export function CombinedVariant(): JSX.Element {
    const { allItems } = useValues(combinedVariantLogic)

    return (
        <div className="@container" data-attr="workflows-prototype-combined-variant">
            <CombinedViewTabs />
            <div className="mb-3">
                <WorkflowsSearchBar items={allItems} />
            </div>
            <div className="flex gap-3 items-start">
                <aside className="hidden @3xl:block w-52 @5xl:w-60 shrink-0 border rounded bg-surface-primary sticky top-0 max-h-[80vh] overflow-y-auto">
                    <CombinedFolderTree />
                </aside>
                <div className="flex-1 min-w-0">
                    <CombinedBreadcrumbs />
                    <BulkBar />
                    <CombinedContents />
                </div>
            </div>
        </div>
    )
}
