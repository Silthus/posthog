// PROTOTYPE (throwaway, branch prototype/workflows-list): derives one flat list item per workflow and
// workflow template, so every prototype variant filters and renders the same facts.
import type { IntegrationType, UserBasicType } from '~/types'

import type { MessageTemplate } from '../../../TemplateLibrary/types'
import type { HogFlow, HogFlowAction, HogFlowTemplate } from '../../hogflows/types'

export type WorkflowItemKind = 'workflow' | 'template'
export type WorkflowItemStatus = 'active' | 'draft' | 'archived' | 'template'
export type WorkflowItemType = 'messaging' | 'automation' | 'loop'
export type WorkflowChannel = 'email' | 'sms' | 'push' | 'slack' | 'webhook'

export interface WorkflowEmailStep {
    actionId: string
    stepName: string
    subject: string
    fromAddress: string | null
    fromName: string | null
    libraryTemplateId: string | null
    libraryTemplateName: string | null
}

export interface WorkflowListItem {
    id: string
    kind: WorkflowItemKind
    name: string
    /** The name without its `::` prefix path. */
    leafName: string
    /** `Billing:: dunning:: Final notice` gives `['Billing', 'Dunning']`. */
    path: string[]
    description: string
    status: WorkflowItemStatus
    type: WorkflowItemType
    triggerType: string
    channels: WorkflowChannel[]
    emailSteps: WorkflowEmailStep[]
    owners: string[]
    createdBy: UserBasicType | null
    createdByName: string | null
    createdAt: string | null
    updatedAt: string | null
    /** Workflow templates carry tags. Workflows have none yet. */
    tags: string[]
    templateScope: string | null
    metrics: { succeeded: number; failed: number } | null
    actions: HogFlowAction[]
    workflow: HogFlow | null
    template: HogFlowTemplate | null
}

export interface WorkflowsPrototypeSources {
    workflows: HogFlow[]
    workflowTemplates: HogFlowTemplate[]
    libraryTemplates: MessageTemplate[]
    emailIntegrations: IntegrationType[]
    metrics: { workflow_id: string; succeeded: number; failed: number }[]
}

const MESSAGING_ACTION_TYPES = ['function_email', 'function_sms', 'function_push']

export const CHANNEL_LABELS: Record<WorkflowChannel, string> = {
    email: 'Email',
    sms: 'SMS',
    push: 'Push',
    slack: 'Slack',
    webhook: 'Webhook',
}

function capitalize(value: string): string {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

export function splitNamePath(name: string): { path: string[]; leafName: string } {
    const parts = name
        .split('::')
        .map((part) => part.trim())
        .filter(Boolean)
    if (parts.length <= 1) {
        return { path: [], leafName: name.trim() }
    }
    return { path: parts.slice(0, -1).map(capitalize), leafName: parts[parts.length - 1] }
}

function channelOf(action: HogFlowAction): WorkflowChannel | null {
    switch (action.type) {
        case 'function_email':
            return 'email'
        case 'function_sms':
            return 'sms'
        case 'function_push':
            return 'push'
        case 'function': {
            const templateId = (action.config as { template_id?: string }).template_id
            if (templateId === 'template-slack') {
                return 'slack'
            }
            if (templateId === 'template-webhook') {
                return 'webhook'
            }
            return null
        }
        default:
            return null
    }
}

function parseOwners(description: string, createdBy: UserBasicType | null): string[] {
    const explicit = [...description.matchAll(/owner:\s*@([\w.-]+)/gi)].map((match) => match[1].toLowerCase())
    if (explicit.length) {
        return Array.from(new Set(explicit))
    }
    const mentioned = [...description.matchAll(/@([\w-]+(?:\.[\w-]+)*)/g)].map((match) => match[1].toLowerCase())
    if (mentioned.length) {
        return Array.from(new Set(mentioned))
    }
    return createdBy?.first_name ? [createdBy.first_name.toLowerCase()] : []
}

function emailStepsOf(
    actions: HogFlowAction[],
    senders: Map<number, { email: string; name: string | null }>,
    libraryNames: Map<string, string>
): WorkflowEmailStep[] {
    return actions
        .filter((action) => action.type === 'function_email')
        .map((action) => {
            const config = action.config as {
                template_uuid?: string
                inputs?: { email?: { value?: Record<string, any> } }
            }
            const email = config.inputs?.email?.value ?? {}
            const from = (email.from ?? {}) as { integrationId?: number; email?: string; name?: string }
            const sender = from.integrationId ? senders.get(from.integrationId) : undefined
            const libraryTemplateId = config.template_uuid ?? null
            return {
                actionId: action.id,
                stepName: action.name,
                subject: String(email.subject ?? ''),
                fromAddress: from.email || sender?.email || null,
                fromName: from.name || sender?.name || null,
                libraryTemplateId,
                libraryTemplateName: libraryTemplateId ? (libraryNames.get(libraryTemplateId) ?? null) : null,
            }
        })
}

function typeOf(actions: HogFlowAction[], originProduct?: string | null): WorkflowItemType {
    if (originProduct === 'loops') {
        return 'loop'
    }
    return actions.some((action) => MESSAGING_ACTION_TYPES.includes(action.type)) ? 'messaging' : 'automation'
}

export function buildWorkflowListItems(sources: WorkflowsPrototypeSources): WorkflowListItem[] {
    const senders = new Map(
        sources.emailIntegrations.map((integration) => [
            integration.id,
            { email: integration.config?.email ?? integration.display_name, name: integration.config?.name ?? null },
        ])
    )
    const libraryNames = new Map(sources.libraryTemplates.map((template) => [template.id, template.name]))
    const metrics = new Map(sources.metrics.map((row) => [row.workflow_id, row]))

    const build = (
        source: HogFlow | HogFlowTemplate,
        kind: WorkflowItemKind
    ): Omit<WorkflowListItem, 'status' | 'metrics' | 'tags' | 'templateScope' | 'workflow' | 'template'> => {
        const actions = (source.actions ?? []) as HogFlowAction[]
        const name = source.name ?? ''
        const description = source.description ?? ''
        const createdBy = (source.created_by ?? null) as UserBasicType | null
        const channels = Array.from(
            new Set(actions.map(channelOf).filter((channel): channel is WorkflowChannel => !!channel))
        )
        return {
            id: source.id,
            kind,
            name,
            ...splitNamePath(name),
            description,
            type: typeOf(actions, (source as HogFlow).origin_product),
            triggerType: (source.trigger as { type?: string } | undefined)?.type ?? 'unknown',
            channels,
            emailSteps: emailStepsOf(actions, senders, libraryNames),
            owners: parseOwners(description, createdBy),
            createdBy,
            createdByName: createdBy ? createdBy.first_name || createdBy.email : null,
            createdAt: source.created_at ?? null,
            updatedAt: source.updated_at ?? null,
            actions,
        }
    }

    const workflows: WorkflowListItem[] = sources.workflows.map((workflow) => ({
        ...build(workflow, 'workflow'),
        status: workflow.status,
        tags: [],
        templateScope: null,
        metrics: metrics.get(workflow.id) ?? null,
        workflow,
        template: null,
    }))
    const templates: WorkflowListItem[] = sources.workflowTemplates.map((template) => ({
        ...build(template, 'template'),
        status: 'template',
        tags: (template.tags ?? []) as string[],
        templateScope: template.scope ?? null,
        metrics: null,
        workflow: null,
        template,
    }))
    return [...workflows, ...templates]
}
