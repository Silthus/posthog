// PROTOTYPE (throwaway): the shared pill search with the open folder as its first pill (`in: Billing ×`). Search and
// filters cover that folder and everything below it. Removing the pill searches everywhere.
import { useActions, useValues } from 'kea'

import { WorkflowsSearchBar } from '../shared/WorkflowsSearchBar'
import { combinedVariantLogic } from './combinedVariantLogic'

export function ScopedSearchBar(): JSX.Element {
    const { allItems, scope } = useValues(combinedVariantLogic)
    const { setScope } = useActions(combinedVariantLogic)
    return (
        <WorkflowsSearchBar
            items={allItems}
            scope={scope.length ? { label: scope.join(' / '), onRemove: () => setScope([]) } : null}
        />
    )
}
