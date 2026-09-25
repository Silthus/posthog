// PROTOTYPE (throwaway): adds per-step email volume and message category names to the shared prototype data,
// and builds the email lens from the workflows that pass the search bar.
import { MakeLogicType, actions, afterMount, connect, kea, path, reducers, selectors } from 'kea'
import { loaders } from 'kea-loaders'

import api, { ApiRequest } from 'lib/api'

import type { MessageTemplate } from '../../../TemplateLibrary/types'
import type { WorkflowQuery } from '../shared/workflowFacets'
import type { WorkflowListItem, WorkflowsPrototypeSources } from '../shared/workflowListItems'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { EmailSend, SenderGroup, buildEmailSends, buildSenderGroups, matchesStepFilters } from './emailLensModel'

// One query for every email step, instead of one metrics request per workflow.
const EMAIL_VOLUME_QUERY = `
SELECT app_source_id, instance_id, sum(count)
FROM app_metrics
WHERE app_source = 'hog_flow' AND metric_name = 'email_sent' AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY app_source_id, instance_id
`

export interface EmailLensTotals {
    senders: number
    emails: number
    steps: number
    workflows: number
    linkedSteps: number
    sent7d: number
}

interface emailLensLogicValues {
    filteredItems: WorkflowListItem[]
    workflowItems: WorkflowListItem[]
    sources: WorkflowsPrototypeSources
    query: WorkflowQuery
    volumes: Record<string, number> | null
    volumesLoading: boolean
    categoryNames: Record<string, string>
    categoryNamesLoading: boolean
    matchUnlinkedBySubject: boolean
    previewSend: EmailSend | null
    libraryTemplates: MessageTemplate[]
    emailWorkflows: WorkflowListItem[]
    workflowsWithoutEmail: number
    allSends: EmailSend[]
    sendsByWorkflow: Record<string, EmailSend[]>
    sends: EmailSend[]
    senderGroups: SenderGroup[]
    totals: EmailLensTotals
}

interface emailLensLogicActions {
    loadVolumes: () => {}
    loadVolumesSuccess: (volumes: Record<string, number> | null) => { volumes: Record<string, number> | null }
    loadVolumesFailure: (error: string) => { error: string }
    loadCategoryNames: () => {}
    loadCategoryNamesSuccess: (categoryNames: Record<string, string>) => { categoryNames: Record<string, string> }
    loadCategoryNamesFailure: (error: string) => { error: string }
    setMatchUnlinkedBySubject: (value: boolean) => { value: boolean }
    openPreview: (send: EmailSend) => { send: EmailSend }
    closePreview: () => { value: true }
}

type emailLensLogicType = MakeLogicType<emailLensLogicValues, emailLensLogicActions>

export const emailLensLogic = kea<emailLensLogicType>([
    path(['products', 'workflows', 'frontend', 'Workflows', 'prototypes', 'emails', 'emailLensLogic']),
    connect(() => ({
        values: [workflowsPrototypeLogic, ['filteredItems', 'workflowItems', 'sources', 'query']],
    })),
    actions({
        setMatchUnlinkedBySubject: (value: boolean) => ({ value }),
        openPreview: (send: EmailSend) => ({ send }),
        closePreview: true,
    }),
    loaders(() => ({
        volumes: [
            null as Record<string, number> | null,
            {
                loadVolumes: async () => {
                    try {
                        const response = (await api.query({
                            kind: 'HogQLQuery',
                            query: EMAIL_VOLUME_QUERY,
                            tags: { productKey: 'workflows', scene: 'Workflows' },
                        })) as {
                            results: [string, string, number][]
                        }
                        return Object.fromEntries(
                            response.results.map(([workflowId, actionId, count]) => [
                                `${workflowId}/${actionId}`,
                                Number(count),
                            ])
                        )
                    } catch {
                        return null
                    }
                },
            },
        ],
        categoryNames: [
            {} as Record<string, string>,
            {
                loadCategoryNames: async () => {
                    try {
                        const response = (await new ApiRequest().messagingCategories().get()) as {
                            results: { id: string; name: string }[]
                        }
                        return Object.fromEntries(response.results.map((category) => [category.id, category.name]))
                    } catch {
                        return {}
                    }
                },
            },
        ],
    })),
    reducers({
        matchUnlinkedBySubject: [false, { setMatchUnlinkedBySubject: (_, { value }) => value }],
        previewSend: [null as EmailSend | null, { openPreview: (_, { send }) => send, closePreview: () => null }],
    }),
    selectors({
        libraryTemplates: [(s) => [s.sources], (sources): MessageTemplate[] => sources.libraryTemplates],
        emailWorkflows: [
            (s) => [s.filteredItems],
            (filteredItems): WorkflowListItem[] =>
                filteredItems.filter(
                    (item: WorkflowListItem) => item.kind === 'workflow' && item.emailSteps.length > 0
                ),
        ],
        workflowsWithoutEmail: [
            (s) => [s.filteredItems],
            (filteredItems): number =>
                filteredItems.filter(
                    (item: WorkflowListItem) => item.kind === 'workflow' && item.emailSteps.length === 0
                ).length,
        ],
        allSends: [
            (s) => [s.emailWorkflows, s.volumes, s.categoryNames, s.libraryTemplates, s.matchUnlinkedBySubject],
            (emailWorkflows, volumes, categoryNames, libraryTemplates, matchUnlinkedBySubject): EmailSend[] =>
                buildEmailSends(emailWorkflows, volumes, categoryNames, libraryTemplates, matchUnlinkedBySubject),
        ],
        sendsByWorkflow: [
            (s) => [s.allSends],
            (allSends): Record<string, EmailSend[]> => {
                const result: Record<string, EmailSend[]> = {}
                for (const send of allSends) {
                    ;(result[send.item.id] ??= []).push(send)
                }
                return result
            },
        ],
        sends: [
            (s) => [s.allSends, s.query],
            (allSends, query): EmailSend[] =>
                allSends.filter((send: EmailSend) => matchesStepFilters(send, query.filters)),
        ],
        senderGroups: [
            (s) => [s.sends, s.libraryTemplates],
            (sends, libraryTemplates): SenderGroup[] => buildSenderGroups(sends, libraryTemplates),
        ],
        totals: [
            (s) => [s.senderGroups, s.sends],
            (senderGroups: SenderGroup[], sends: EmailSend[]): EmailLensTotals => ({
                senders: senderGroups.length,
                emails: senderGroups.reduce((total, sender) => total + sender.emails.length, 0),
                steps: sends.length,
                workflows: new Set(sends.map((send) => send.item.id)).size,
                linkedSteps: sends.filter((send) => send.step.libraryTemplateId && !send.matchedBySubject).length,
                sent7d: sends.reduce((total, send) => total + (send.sent7d ?? 0), 0),
            }),
        ],
    }),
    afterMount(({ actions }) => {
        actions.loadVolumes()
        actions.loadCategoryNames()
    }),
])
