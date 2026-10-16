import type { FacetDefinition } from './FacetSearchBar/facetQuery'
import { HEALTH_TAGS, STATUS_LABELS, TRIGGER_LABELS, TYPE_LABELS } from './workflowListLabels'
import { WorkflowLibraryRow, WorkflowListRow, workflowLibraryObject } from './workflowListRows'

const HEALTH_LABELS: Record<string, string> = Object.fromEntries(
    Object.entries(HEALTH_TAGS).map(([health, { label }]) => [health, label])
)

const TYPE_AND_TEMPLATE_LABELS: Record<string, string> = { ...TYPE_LABELS, 'email-template': 'Email template' }

const labelFrom =
    (labels: Record<string, string>) =>
    (value: string): string =>
        labels[value] ?? value

const valueFromLabel =
    (labels: Record<string, string>) =>
    (typed: string): string =>
        Object.keys(labels).find((value) => labels[value].toLowerCase() === typed.toLowerCase()) ?? typed

/** Every word of the text must appear in the name or description. */
export function matchesWorkflowListText(row: WorkflowLibraryRow, text: string): boolean {
    return text
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => row.searchText.includes(word))
}

/** `rows` supplies the names shown for creator uuids. */
export function buildWorkflowListFacets(rows: WorkflowLibraryRow[]): FacetDefinition<WorkflowLibraryRow>[] {
    const creatorNames = new Map<string, string>()
    const creatorIds = new Map<string, string | null>()
    for (const row of rows) {
        const workflow = workflowLibraryObject(row)
        if (workflow.created_by) {
            const name = workflow.created_by.first_name || workflow.created_by.email
            const key = name.toLowerCase()
            const known = creatorIds.get(key)
            creatorNames.set(workflow.created_by.uuid, name)
            creatorIds.set(
                key,
                known === undefined || known === workflow.created_by.uuid ? workflow.created_by.uuid : null
            )
        }
    }

    const workflowRows = rows.filter((row): row is WorkflowListRow => row.kind === 'workflow')

    return [
        {
            key: 'tag',
            matchAll: true,
            label: 'Tag',
            description: 'Tags attached to the workflow',
            showOnFocus: true,
            order: 7,
            getValues: (row) => workflowLibraryObject(row).tags ?? [],
            formatValue: (value) => value,
        },
        {
            key: 'status',
            label: 'Status',
            description: 'Draft, active or archived',
            showOnFocus: true,
            order: 1,
            getValues: (row) => (row.kind === 'workflow' ? [row.workflow.status] : []),
            normalizeValue: valueFromLabel(STATUS_LABELS),
            formatValue: labelFrom(STATUS_LABELS),
        },
        {
            key: 'kind',
            label: 'Kind',
            description: 'Messaging, automation or loop',
            showOnFocus: true,
            order: 2,
            getValues: (row) => [row.kind === 'workflow' ? row.workflow.type : 'email-template'],
            normalizeValue: valueFromLabel(TYPE_AND_TEMPLATE_LABELS),
            formatValue: labelFrom(TYPE_AND_TEMPLATE_LABELS),
        },
        {
            key: 'trigger',
            label: 'Trigger',
            description: 'What starts the workflow',
            showOnFocus: true,
            order: 3,
            getValues: (row) => (row.kind === 'workflow' && row.triggerType ? [row.triggerType] : []),
            normalizeValue: valueFromLabel(TRIGGER_LABELS),
            formatValue: labelFrom(TRIGGER_LABELS),
        },
        {
            key: 'owner',
            label: 'Owner',
            description: 'Owner: @name in the description, else the creator',
            freeTextValues: true,
            showOnFocus: true,
            order: 4,
            getValues: (row) => (row.kind === 'workflow' ? row.owners : []),
            normalizeValue: (value) => value.replace(/^@/, ''),
            formatValue: (value) => `@${value}`,
        },
        {
            key: 'health',
            label: 'Health',
            description: 'Failed runs in the last 7 days',
            showOnFocus: true,
            order: 5,
            getValues: (row) => (row.kind === 'workflow' && row.last7Days !== null ? [row.health] : []),
            emptyLabel:
                workflowRows.length > 0 && workflowRows.every((row) => row.last7Days === null)
                    ? 'Health shows once run metrics load'
                    : undefined,
            normalizeValue: valueFromLabel(HEALTH_LABELS),
            formatValue: labelFrom(HEALTH_LABELS),
        },
        {
            key: 'createdBy',
            aliases: ['created-by', 'by', 'author', 'user'],
            label: 'Created by',
            description: 'Who created it',
            freeTextValues: true,
            order: 6,
            getValues: (row) => {
                const createdBy = workflowLibraryObject(row).created_by
                return createdBy ? [createdBy.uuid] : []
            },
            resolveValue: (value) => creatorIds.get(value.toLowerCase()) ?? value,
            formatValue: (value) => creatorNames.get(value) ?? value,
        },
    ]
}
