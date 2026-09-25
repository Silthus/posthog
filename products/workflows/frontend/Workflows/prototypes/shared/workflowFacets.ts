// PROTOTYPE (throwaway): the facet registry behind the smart search bar. A variant that brings new data
// (tags, real folders) calls `registerWorkflowFacet` at module load, and the bar, the URL and the
// filtering pick it up. Registering an existing key replaces that facet.
import { CHANNEL_LABELS, WorkflowChannel, WorkflowListItem } from './workflowListItems'

export interface WorkflowFacet {
    /** What the user types before the colon, for example `status`. */
    key: string
    /** Other keys that resolve to this facet, for example `subject` for `sends`. */
    aliases?: string[]
    label: string
    description: string
    /** Every value this item has for the facet. An item matches a pill when this list contains the pill value. */
    getValues: (item: WorkflowListItem) => string[]
    formatValue?: (value: string) => string
    /** Values that match their prefix too, so `folder:Billing` also matches `Billing / Dunning`. */
    hierarchical?: boolean
    /** Lower sorts first in the facet list. */
    order?: number
    /** Values that contain this separator belong to a group, so `team/marketing` sits under `team`. */
    groupSeparator?: string
}

export interface FacetFilter {
    facet: string
    value: string
    negated: boolean
}

export interface WorkflowQuery {
    filters: FacetFilter[]
    search: string
}

const facetRegistry = new Map<string, WorkflowFacet>()
const facetExtensions = new Map<string, Partial<WorkflowFacet>>()
const listeners = new Set<() => void>()

export function registerWorkflowFacet(facet: WorkflowFacet): void {
    facetRegistry.set(facet.key, { ...facet, ...facetExtensions.get(facet.key) })
    listeners.forEach((listener) => listener())
}

/** Adds options to a facet that another module owns. They survive when that module registers the facet again. */
export function extendWorkflowFacet(key: string, extension: Partial<WorkflowFacet>): void {
    facetExtensions.set(key, { ...facetExtensions.get(key), ...extension })
    const existing = facetRegistry.get(key)
    if (existing) {
        registerWorkflowFacet(existing)
    }
}

// --- value groups ---------------------------------------------------------------------------------

const GROUP_WILDCARD = '*'

/** The pill value that matches every value in a group, for example `team/*`. */
export function groupFilterValue(facet: WorkflowFacet, group: string): string {
    return `${group}${facet.groupSeparator ?? '/'}${GROUP_WILDCARD}`
}

/** The group a value belongs to, or null. For `team/*` it returns `team` too. */
export function groupOfValue(facet: WorkflowFacet | undefined, value: string): string | null {
    const separator = facet?.groupSeparator
    if (!separator) {
        return null
    }
    const index = value.indexOf(separator)
    return index > 0 ? value.slice(0, index) : null
}

export function isGroupFilterValue(facet: WorkflowFacet | undefined, value: string): boolean {
    return !!facet?.groupSeparator && value.endsWith(`${facet.groupSeparator}${GROUP_WILDCARD}`)
}

export function onWorkflowFacetsChanged(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function getWorkflowFacets(): WorkflowFacet[] {
    return Array.from(facetRegistry.values()).sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
}

export function findWorkflowFacet(key: string): WorkflowFacet | undefined {
    const lower = key.toLowerCase()
    return facetRegistry.get(lower) ?? getWorkflowFacets().find((facet) => facet.aliases?.includes(lower))
}

export function formatFacetValue(facet: WorkflowFacet | undefined, value: string): string {
    if (isGroupFilterValue(facet, value)) {
        return `any ${groupOfValue(facet, value)}${facet?.groupSeparator ?? '/'}`
    }
    return facet?.formatValue ? facet.formatValue(value) : value
}

const capitalize = (value: string): string => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value)

const TRIGGER_LABELS: Record<string, string> = {
    event: 'Event',
    schedule: 'Schedule',
    manual: 'Manual',
    batch: 'Batch',
    webhook: 'Webhook',
    tracking_pixel: 'Tracking pixel',
    'data-warehouse-table': 'Data warehouse table',
    'data-warehouse-view': 'Data warehouse view',
    'internal-event': 'Internal event',
}

registerWorkflowFacet({
    key: 'status',
    label: 'Status',
    description: 'Active, draft or archived',
    getValues: (item) => (item.kind === 'workflow' ? [item.status] : []),
    formatValue: capitalize,
    order: 10,
})
registerWorkflowFacet({
    key: 'type',
    label: 'Type',
    description: 'Messaging, automation or loop',
    getValues: (item) => [item.type],
    formatValue: capitalize,
    order: 20,
})
registerWorkflowFacet({
    key: 'trigger',
    label: 'Trigger',
    description: 'What starts the workflow',
    getValues: (item) => [item.triggerType],
    formatValue: (value) => TRIGGER_LABELS[value] ?? capitalize(value),
    order: 30,
})
registerWorkflowFacet({
    key: 'channel',
    label: 'Channel',
    description: 'Email, SMS, push, Slack or webhook',
    getValues: (item) => item.channels,
    formatValue: (value) => CHANNEL_LABELS[value as WorkflowChannel] ?? value,
    order: 40,
})
registerWorkflowFacet({
    key: 'sends',
    aliases: ['subject'],
    label: 'Sends',
    description: 'Email subject line',
    getValues: (item) => item.emailSteps.map((step) => step.subject).filter(Boolean),
    order: 50,
})
registerWorkflowFacet({
    key: 'from',
    label: 'From',
    description: 'Sender email address',
    getValues: (item) => item.emailSteps.map((step) => step.fromAddress).filter((value): value is string => !!value),
    order: 55,
})
registerWorkflowFacet({
    key: 'library',
    label: 'Library template',
    description: 'Email template from the Library',
    getValues: (item) =>
        item.emailSteps.map((step) => step.libraryTemplateName).filter((value): value is string => !!value),
    order: 58,
})
registerWorkflowFacet({
    key: 'folder',
    label: 'Folder',
    description: 'Name prefix, for example Billing:: dunning::',
    getValues: (item) => item.path.map((_, index) => item.path.slice(0, index + 1).join(' / ')),
    hierarchical: true,
    order: 60,
})
registerWorkflowFacet({
    key: 'tag',
    label: 'Tag',
    description: 'Tags on workflow templates',
    getValues: (item) => item.tags,
    order: 65,
})
registerWorkflowFacet({
    key: 'owner',
    label: 'Owner',
    description: 'Owner named in the description, or the creator',
    getValues: (item) => item.owners,
    formatValue: (value) => `@${value}`,
    order: 70,
})
registerWorkflowFacet({
    key: 'created-by',
    label: 'Created by',
    description: 'Who created it',
    getValues: (item) => (item.createdByName ? [item.createdByName] : []),
    order: 75,
})
registerWorkflowFacet({
    key: 'is',
    label: 'Is',
    description: 'Workflow or template',
    getValues: (item) => [item.kind],
    formatValue: capitalize,
    order: 80,
})

// --- query string ---------------------------------------------------------------------------------

function quoteIfNeeded(value: string): string {
    return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

export function serializeFilters(filters: FacetFilter[]): string {
    return filters
        .map((filter) => `${filter.negated ? '-' : ''}${filter.facet}:${quoteIfNeeded(filter.value)}`)
        .join(' ')
}

/** Parses `status:active -status:archived sends:"Your trial ends"` into pills. Unknown facets are dropped. */
export function parseFilters(input: string): FacetFilter[] {
    const filters: FacetFilter[] = []
    const pattern = /(-?)([\w-]+):(?:"((?:[^"\\]|\\.)*)"|(\S+))/g
    for (const match of input.matchAll(pattern)) {
        const facet = findWorkflowFacet(match[2])
        const value = (match[3] ?? match[4] ?? '').replace(/\\"/g, '"')
        if (facet && value) {
            filters.push({ facet: facet.key, value, negated: match[1] === '-' })
        }
    }
    return filters
}

export function filterKey(filter: FacetFilter): string {
    return `${filter.negated ? '-' : ''}${filter.facet}:${filter.value}`
}

// --- matching -------------------------------------------------------------------------------------

function itemHasValue(item: WorkflowListItem, facet: WorkflowFacet, value: string): boolean {
    const target = value.toLowerCase()
    if (isGroupFilterValue(facet, value)) {
        const prefix = target.slice(0, -GROUP_WILDCARD.length)
        return facet.getValues(item).some((candidate) => candidate.toLowerCase().startsWith(prefix))
    }
    return facet.getValues(item).some((candidate) => {
        const lower = candidate.toLowerCase()
        return lower === target || (facet.hierarchical && lower.startsWith(`${target} / `))
    })
}

export function matchesSearch(item: WorkflowListItem, search: string): boolean {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) {
        return true
    }
    const haystack = [
        item.name,
        item.description,
        ...item.emailSteps.flatMap((step) => [step.subject, step.fromAddress ?? '', step.libraryTemplateName ?? '']),
        ...item.actions.map((action) => action.name),
        ...item.tags,
    ]
        .join('\n')
        .toLowerCase()
    return terms.every((term) => haystack.includes(term))
}

/** Same facet ORs its values, different facets AND, negated pills exclude. */
export function matchesFilters(item: WorkflowListItem, filters: FacetFilter[]): boolean {
    const positiveByFacet = new Map<string, string[]>()
    for (const filter of filters) {
        const facet = facetRegistry.get(filter.facet)
        if (!facet) {
            continue
        }
        if (filter.negated) {
            if (itemHasValue(item, facet, filter.value)) {
                return false
            }
        } else {
            positiveByFacet.set(filter.facet, [...(positiveByFacet.get(filter.facet) ?? []), filter.value])
        }
    }
    for (const [facetKey, values] of positiveByFacet) {
        const facet = facetRegistry.get(facetKey)!
        if (!values.some((value) => itemHasValue(item, facet, value))) {
            return false
        }
    }
    return true
}

export function applyWorkflowQuery(items: WorkflowListItem[], query: WorkflowQuery): WorkflowListItem[] {
    return items.filter((item) => matchesFilters(item, query.filters) && matchesSearch(item, query.search))
}

export interface FacetValueCount {
    value: string
    count: number
}

/** Counts each value of a facet across items that match every other facet's pills and the search. */
export function facetValueCounts(items: WorkflowListItem[], facetKey: string, query: WorkflowQuery): FacetValueCount[] {
    const facet = facetRegistry.get(facetKey)
    if (!facet) {
        return []
    }
    const otherFilters = query.filters.filter((filter) => filter.facet !== facetKey)
    const counts = new Map<string, number>()
    for (const item of items) {
        if (!matchesFilters(item, otherFilters) || !matchesSearch(item, query.search)) {
            continue
        }
        const values = new Set(facet.getValues(item))
        for (const value of Array.from(values)) {
            const group = groupOfValue(facet, value)
            if (group) {
                values.add(groupFilterValue(facet, group))
            }
        }
        for (const value of values) {
            counts.set(value, (counts.get(value) ?? 0) + 1)
        }
    }
    return Array.from(counts, ([value, count]) => ({ value, count })).sort(
        (a, b) => b.count - a.count || a.value.localeCompare(b.value)
    )
}
