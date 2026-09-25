// PROTOTYPE (throwaway): group-by for the tags variant. A workflow with several values for the grouping
// (tags, channels, owners) appears once under each of them, so a group count is "workflows in this group".
import { findWorkflowFacet, formatFacetValue } from '../shared/workflowFacets'
import { CHANNEL_LABELS, WorkflowChannel, WorkflowListItem } from '../shared/workflowListItems'
import { tagsOfItem } from './workflowTagFacets'
import type { GroupByKey } from './workflowTagsStore'

export interface GroupByOption {
    key: GroupByKey
    label: string
    /** Label of the group for items with no value. */
    emptyLabel: string
    /** The pill that narrows the list to one group, when the group maps onto a facet. */
    facet?: string
    /** Several values mean the item shows in several groups. */
    multiValued?: boolean
    valuesOf: (item: WorkflowListItem) => string[]
    formatGroup?: (value: string) => string
    /** Fixed order of groups. Otherwise the largest group comes first. */
    order?: string[]
}

const STATUS_LABELS: Record<string, string> = {
    active: 'Active',
    draft: 'Draft',
    archived: 'Archived',
    template: 'Templates',
}

export const GROUP_BY_OPTIONS: GroupByOption[] = [
    { key: 'none', label: 'No grouping', emptyLabel: '', valuesOf: () => [] },
    {
        key: 'tag',
        label: 'Tag',
        emptyLabel: 'No tag',
        facet: 'tag',
        multiValued: true,
        valuesOf: tagsOfItem,
    },
    {
        key: 'prefix',
        label: 'Name prefix',
        emptyLabel: 'No prefix',
        facet: 'folder',
        valuesOf: (item) => (item.path.length ? [item.path[0]] : []),
    },
    {
        key: 'trigger',
        label: 'Trigger',
        emptyLabel: 'No trigger',
        facet: 'trigger',
        valuesOf: (item) => [item.triggerType],
        formatGroup: (value) => formatFacetValue(findWorkflowFacet('trigger'), value),
    },
    {
        key: 'channel',
        label: 'Channel',
        emptyLabel: 'Sends nothing',
        facet: 'channel',
        multiValued: true,
        valuesOf: (item) => item.channels,
        formatGroup: (value) => CHANNEL_LABELS[value as WorkflowChannel] ?? value,
    },
    {
        key: 'status',
        label: 'Status',
        emptyLabel: 'No status',
        valuesOf: (item) => [item.status],
        formatGroup: (value) => STATUS_LABELS[value] ?? value,
        order: ['active', 'draft', 'archived', 'template'],
    },
    {
        key: 'owner',
        label: 'Owner',
        emptyLabel: 'No owner',
        facet: 'owner',
        multiValued: true,
        // The shared owner parser keeps a sentence's trailing period ("Questions to @priya."), so trim it here.
        valuesOf: (item) => item.owners.map((owner) => owner.replace(/\.+$/, '')),
        formatGroup: (value) => `@${value}`,
    },
    {
        key: 'created-by',
        label: 'Created by',
        emptyLabel: 'PostHog templates',
        facet: 'created-by',
        valuesOf: (item) => (item.createdByName ? [item.createdByName] : []),
    },
]

export function findGroupBy(key: string | undefined | null): GroupByOption {
    return GROUP_BY_OPTIONS.find((option) => option.key === key) ?? GROUP_BY_OPTIONS[0]
}

export const EMPTY_GROUP = '__none__'

export interface WorkflowGroup {
    key: string
    label: string
    /** The raw value, or null for the "no value" group. */
    value: string | null
    items: WorkflowListItem[]
}

export function groupItems(items: WorkflowListItem[], option: GroupByOption): WorkflowGroup[] {
    const groups = new Map<string, WorkflowListItem[]>()
    for (const item of items) {
        const values = Array.from(new Set(option.valuesOf(item)))
        for (const value of values.length ? values : [EMPTY_GROUP]) {
            groups.set(value, [...(groups.get(value) ?? []), item])
        }
    }
    const result = Array.from(groups, ([value, groupItems]) => ({
        key: value,
        value: value === EMPTY_GROUP ? null : value,
        label: value === EMPTY_GROUP ? option.emptyLabel : option.formatGroup ? option.formatGroup(value) : value,
        items: groupItems,
    }))
    const rank = (group: WorkflowGroup): number =>
        group.value === null ? Number.MAX_SAFE_INTEGER : (option.order?.indexOf(group.value) ?? -1)
    return result.sort((a, b) => {
        if (a.value === null || b.value === null) {
            return a.value === null ? 1 : -1
        }
        if (option.order) {
            return rank(a) - rank(b)
        }
        return b.items.length - a.items.length || a.label.localeCompare(b.label)
    })
}
