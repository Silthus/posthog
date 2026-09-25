// PROTOTYPE (throwaway): the count line, group-by picker, collapse controls and the compact switch.
import { useActions, useValues } from 'kea'

import { IconCollapse, IconExpand } from '@posthog/icons'
import { LemonButton, LemonSelect, LemonSwitch } from '@posthog/lemon-ui'

import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { GROUP_BY_OPTIONS } from './workflowGrouping'
import { workflowsTagsVariantLogic } from './workflowsTagsVariantLogic'

export function TagsVariantToolbar(): JSX.Element {
    const { filteredItems, workflowItems, templateItems, hasLoaded, hasActiveQuery } =
        useValues(workflowsPrototypeLogic)
    const { clearAll } = useActions(workflowsPrototypeLogic)
    const { groupBy, groups, collapsed, compact } = useValues(workflowsTagsVariantLogic)
    const { setGroupBy, collapseAll, expandAll, setCompact } = useActions(workflowsTagsVariantLogic)
    const total = workflowItems.length + templateItems.length
    const allCollapsed = groups.length > 0 && groups.every((group) => collapsed[group.key])

    return (
        <div className="flex flex-wrap items-center gap-2 mb-2 min-h-7 text-sm">
            {hasLoaded ? (
                <span className="text-secondary" translate="no">
                    {hasActiveQuery ? `${filteredItems.length} of ${total} match` : `${total} workflows and templates`}
                    {groupBy.key !== 'none' ? ` in ${groups.length} groups` : ''}
                </span>
            ) : (
                <span className="text-secondary">Loading workflows…</span>
            )}
            {hasActiveQuery && (
                <LemonButton size="xsmall" type="tertiary" onClick={clearAll} data-attr="workflows-tags-clear-all">
                    Clear filters
                </LemonButton>
            )}
            <div className="flex flex-wrap items-center gap-2 ml-auto">
                <LemonSelect
                    size="small"
                    value={groupBy.key}
                    onChange={(value) => value && setGroupBy(value)}
                    dropdownMatchSelectWidth={false}
                    options={GROUP_BY_OPTIONS.map((option) => ({
                        value: option.key,
                        label: option.key === 'none' ? option.label : `Group by ${option.label.toLowerCase()}`,
                    }))}
                    data-attr="workflows-tags-group-by"
                />
                {groupBy.key !== 'none' && (
                    <LemonButton
                        size="small"
                        type="secondary"
                        icon={allCollapsed ? <IconExpand /> : <IconCollapse />}
                        onClick={() => (allCollapsed ? expandAll() : collapseAll(groups.map((group) => group.key)))}
                        data-attr="workflows-tags-collapse-all"
                    >
                        {allCollapsed ? 'Expand all' : 'Collapse all'}
                    </LemonButton>
                )}
                <LemonSwitch
                    bordered
                    size="small"
                    label="Compact rows"
                    checked={compact}
                    onChange={setCompact}
                    data-attr="workflows-tags-compact"
                />
            </div>
        </div>
    )
}
