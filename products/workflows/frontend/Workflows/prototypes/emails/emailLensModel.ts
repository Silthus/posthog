// PROTOTYPE (throwaway): turns workflow email steps into the email lens tree: sender, then email, then the
// workflows that send it. Pure functions, so the grouping rules are easy to read and change.
import type { MessageTemplate } from '../../../TemplateLibrary/types'
import type { FacetFilter } from '../shared/workflowFacets'
import type { WorkflowEmailStep, WorkflowListItem } from '../shared/workflowListItems'

export type MessageCategoryType = 'marketing' | 'transactional'

export interface EmailSend {
    /** `workflowId/actionId`, the same key the per-step metrics use. */
    key: string
    item: WorkflowListItem
    step: WorkflowEmailStep
    categoryType: MessageCategoryType | null
    categoryName: string | null
    preheader: string
    html: string
    /** Emails sent by this step in the last 7 days. `null` when no metrics came back. */
    sent7d: number | null
    /** The step has no Library link and joined a Library group only because its subject matches. */
    matchedBySubject: boolean
}

export interface EmailGroup {
    /** `library:<id>` for linked emails, `subject:<subject>` for the rest. */
    key: string
    subject: string
    libraryTemplateId: string | null
    libraryTemplateName: string | null
    /** For an unlinked group, the Library template with the same subject, if any. */
    subjectMatchesLibrary: string | null
    sends: EmailSend[]
    workflowCount: number
    activeWorkflowCount: number
    sent7d: number
    categoryTypes: MessageCategoryType[]
    /** Other from-addresses that send the same email. */
    otherSenders: string[]
}

export interface SenderGroup {
    key: string
    address: string | null
    name: string | null
    emails: EmailGroup[]
    workflowCount: number
    stepCount: number
    sent7d: number
}

export interface StepConfigFacts {
    categoryType: MessageCategoryType | null
    categoryId: string | null
    preheader: string
    html: string
}

export function stepConfigFacts(item: WorkflowListItem, actionId: string): StepConfigFacts {
    const action = item.actions.find((candidate) => candidate.id === actionId)
    const config = (action?.config ?? {}) as {
        message_category_type?: string
        message_category_id?: string
        inputs?: { email?: { value?: { preheader?: string; html?: string } } }
    }
    const categoryType = config.message_category_type
    return {
        categoryType: categoryType === 'marketing' || categoryType === 'transactional' ? categoryType : null,
        categoryId: config.message_category_id ?? null,
        preheader: config.inputs?.email?.value?.preheader ?? '',
        html: config.inputs?.email?.value?.html ?? '',
    }
}

/** Every message category type a workflow's messaging steps declare. */
export function itemCategoryTypes(item: WorkflowListItem): MessageCategoryType[] {
    const types = new Set<MessageCategoryType>()
    for (const action of item.actions) {
        const value = (action.config as { message_category_type?: string } | undefined)?.message_category_type
        if (value === 'marketing' || value === 'transactional') {
            types.add(value)
        }
    }
    return Array.from(types)
}

// Email facts that belong to a single step. When one of these pills is active the lens hides the other steps of a
// matching workflow, so `from:billing@…` shows only the billing sender and not everything else that workflow sends.
const STEP_FACET_VALUES: Record<string, (send: EmailSend) => string[]> = {
    from: (send) => (send.step.fromAddress ? [send.step.fromAddress] : []),
    sends: (send) => (send.step.subject ? [send.step.subject] : []),
    library: (send) => (send.step.libraryTemplateName ? [send.step.libraryTemplateName] : []),
    category: (send) => (send.categoryType ? [send.categoryType] : []),
}

export function matchesStepFilters(send: EmailSend, filters: FacetFilter[]): boolean {
    const positive = new Map<string, string[]>()
    for (const filter of filters) {
        const getValues = STEP_FACET_VALUES[filter.facet]
        if (!getValues) {
            continue
        }
        const has = getValues(send).some((value) => value.toLowerCase() === filter.value.toLowerCase())
        if (filter.negated && has) {
            return false
        }
        if (!filter.negated) {
            positive.set(filter.facet, [...(positive.get(filter.facet) ?? []), filter.value])
        }
    }
    for (const [facet, values] of positive) {
        const stepValues = STEP_FACET_VALUES[facet](send).map((value) => value.toLowerCase())
        if (!values.some((value) => stepValues.includes(value.toLowerCase()))) {
            return false
        }
    }
    return true
}

export function buildEmailSends(
    items: WorkflowListItem[],
    volumes: Record<string, number> | null,
    categoryNames: Record<string, string>,
    libraryTemplates: MessageTemplate[],
    matchUnlinkedBySubject: boolean
): EmailSend[] {
    const librarySubjects = new Map(
        libraryTemplates
            .filter((template) => template.content?.email?.subject)
            .map((template) => [template.content.email.subject, template])
    )
    return items.flatMap((item) =>
        item.emailSteps.map((step) => {
            const facts = stepConfigFacts(item, step.actionId)
            const key = `${item.id}/${step.actionId}`
            const subjectMatch = !step.libraryTemplateId ? librarySubjects.get(step.subject) : undefined
            const matchedBySubject = matchUnlinkedBySubject && !!subjectMatch
            return {
                key,
                item,
                step: matchedBySubject
                    ? { ...step, libraryTemplateId: subjectMatch!.id, libraryTemplateName: subjectMatch!.name }
                    : step,
                categoryType: facts.categoryType,
                categoryName: facts.categoryId ? (categoryNames[facts.categoryId] ?? null) : null,
                preheader: facts.preheader,
                html: facts.html,
                sent7d: volumes ? (volumes[key] ?? 0) : null,
                matchedBySubject,
            }
        })
    )
}

function emailKey(send: EmailSend): string {
    return send.step.libraryTemplateId ? `library:${send.step.libraryTemplateId}` : `subject:${send.step.subject}`
}

export function buildSenderGroups(sends: EmailSend[], libraryTemplates: MessageTemplate[]): SenderGroup[] {
    const librarySubjects = new Map(
        libraryTemplates
            .filter((template) => template.content?.email?.subject)
            .map((template) => [template.content.email.subject, template.name])
    )
    const sendersByEmail = new Map<string, Set<string>>()
    for (const send of sends) {
        const key = emailKey(send)
        sendersByEmail.set(key, (sendersByEmail.get(key) ?? new Set()).add(send.step.fromAddress ?? 'unknown'))
    }

    const senders = new Map<string, { address: string | null; name: string | null; emails: Map<string, EmailSend[]> }>()
    for (const send of sends) {
        const senderKey = send.step.fromAddress ?? 'unknown'
        const sender = senders.get(senderKey) ?? {
            address: send.step.fromAddress,
            name: send.step.fromName,
            emails: new Map<string, EmailSend[]>(),
        }
        const key = emailKey(send)
        sender.emails.set(key, [...(sender.emails.get(key) ?? []), send])
        senders.set(senderKey, sender)
    }

    const sum = (values: (number | null)[]): number => values.reduce<number>((total, value) => total + (value ?? 0), 0)

    return Array.from(senders, ([senderKey, sender]) => {
        const emails: EmailGroup[] = Array.from(sender.emails, ([key, groupSends]) => {
            const first = groupSends[0]
            const workflows = new Map(groupSends.map((send) => [send.item.id, send.item]))
            return {
                key,
                subject: first.step.subject,
                libraryTemplateId: first.step.libraryTemplateId,
                libraryTemplateName: first.step.libraryTemplateName,
                subjectMatchesLibrary: first.step.libraryTemplateId
                    ? null
                    : (librarySubjects.get(first.step.subject) ?? null),
                sends: [...groupSends].sort(
                    (a, b) =>
                        Number(b.item.status === 'active') - Number(a.item.status === 'active') ||
                        (b.sent7d ?? 0) - (a.sent7d ?? 0)
                ),
                workflowCount: workflows.size,
                activeWorkflowCount: Array.from(workflows.values()).filter((item) => item.status === 'active').length,
                sent7d: sum(groupSends.map((send) => send.sent7d)),
                categoryTypes: Array.from(
                    new Set(groupSends.map((send) => send.categoryType).filter((value) => !!value))
                ) as MessageCategoryType[],
                otherSenders: Array.from(sendersByEmail.get(key) ?? []).filter((other) => other !== senderKey),
            }
        }).sort((a, b) => b.activeWorkflowCount - a.activeWorkflowCount || b.sent7d - a.sent7d)
        const allSends = emails.flatMap((email) => email.sends)
        return {
            key: senderKey,
            address: sender.address,
            name: sender.name,
            emails,
            workflowCount: new Set(allSends.map((send) => send.item.id)).size,
            stepCount: allSends.length,
            sent7d: sum(allSends.map((send) => send.sent7d)),
        }
    }).sort((a, b) => b.sent7d - a.sent7d || b.stepCount - a.stepCount)
}
