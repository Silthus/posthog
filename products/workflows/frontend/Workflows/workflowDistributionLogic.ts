import { MakeLogicType, actions, connect, kea, listeners, path, reducers } from 'kea'
import { combineUrl, router } from 'kea-router'
import posthog from 'posthog-js'
import { v5 as uuid, validate as isUuid } from 'uuid'
import { z } from 'zod'

import { getAccessControlDisabledReason } from 'lib/utils/accessControlUtils'
import { getAppContext } from 'lib/utils/getAppContext'
import { teamLogic } from 'scenes/teamLogic'
import { urls } from 'scenes/urls'
import { userLogic } from 'scenes/userLogic'

import { AccessControlLevel, AccessControlResourceType } from '~/types'

import type { WorkflowTriggerConfig } from './workflowTriggerPrefill'

export const DISTRIBUTION_WAVE = 'workflows-distribution-v1'
export const DISTRIBUTION_FLAG = 'workflows-distribution'
export const DISTRIBUTION_CONTEXT_PARAM = 'distributionContext'
const MEMORY_TTL = 14 * 24 * 60 * 60 * 1000
const MEMORY_LIMIT = 100

const externalReference = z
    .object({
        projectId: z.number().int().positive().safe(),
        projectUuid: z.string().refine(isUuid),
        waveId: z.literal(DISTRIBUTION_WAVE),
        placementId: z.enum(['sdk-wizard', 'instrumentation-skill', 'contextual-mcp']),
        sourceActionId: z
            .string()
            .min(1)
            .max(128)
            .refine((value) => !/[\u0000-\u001f\u007f-\u009f]/.test(value)),
        eligibleAt: z
            .number()
            .int()
            .safe()
            .refine((value) => value <= Date.now() && value > Date.now() - MEMORY_TTL),
    })
    .strict()

type ExternalWorkflowReference = z.infer<typeof externalReference>

function readExternalWorkflowReference(url: URL): ExternalWorkflowReference | null {
    try {
        const entries = url.hash
            .slice(1)
            .split('&')
            .filter((part) => decodeURIComponent(part.split('=')[0].replace(/\+/g, ' ')) === DISTRIBUTION_CONTEXT_PARAM)
        if (
            entries.length !== 1 ||
            url.searchParams.has(DISTRIBUTION_CONTEXT_PARAM) ||
            ['templateId', 'editTemplateId', 'trigger'].some((key) => url.searchParams.has(key)) ||
            url.searchParams.get('mode') !== 'editor'
        ) {
            return null
        }
        const encoded = entries[0].slice(entries[0].indexOf('=') + 1)
        if (encoded.length > 6 * 1024) {
            return null
        }
        const decoded = decodeURIComponent(encoded.replace(/\+/g, ' '))
        if (new TextEncoder().encode(decoded).length > 2 * 1024) {
            return null
        }
        const result = externalReference.safeParse(JSON.parse(decoded))
        if (!result.success || url.pathname !== `/project/${result.data.projectId}/workflows/new/workflow`) {
            return null
        }
        return result.data
    } catch {
        return null
    }
}

export type DistributionPlacement =
    | 'selected-event'
    | 'native-destination'
    | 'release-announcement'
    | 'sdk-wizard'
    | 'instrumentation-skill'
    | 'contextual-mcp'

interface DistributionSourceContext {
    projectUuid: string
    placementId: DistributionPlacement
    sourceActionId: string
    eligible: boolean
}

export type DistributionSource = DistributionSourceContext &
    ({ trigger?: WorkflowTriggerConfig; templateId?: never } | { templateId: string; trigger?: never })

export interface DistributionContext {
    contextKey: string
    projectUuid: string
    placementId: DistributionPlacement
    arm: 'offer' | 'control'
    eligibleAt: number
    opened?: boolean
    external?: boolean
    projectId?: number
    editorId?: string
    editorGeneration?: number
    outcome?: 'dismissed' | 'created'
}

export interface DistributionOffer extends DistributionContext {
    trigger?: WorkflowTriggerConfig
    templateId?: string
}

function isAuthorized(projectUuid: string): boolean {
    return (
        teamLogic.values.currentTeam?.uuid === projectUuid &&
        !getAccessControlDisabledReason(AccessControlResourceType.Workflow, AccessControlLevel.Editor)
    )
}

function hasExternalOffer(projectUuid: string, placementId: DistributionPlacement): boolean {
    try {
        if (posthog.getGroups().project !== projectUuid) {
            return false
        }
        const placementKey = `${DISTRIBUTION_FLAG}-${placementId}`
        const overrides = posthog.get_property('$override_feature_flags')
        const payloadOverrides = posthog.get_property('$override_feature_flag_payloads')
        const errors = posthog.get_property('$feature_flag_errors')
        if (
            errors?.length ||
            [overrides, payloadOverrides].some((map) => map && (DISTRIBUTION_FLAG in map || placementKey in map))
        ) {
            return false
        }
        const placement = posthog.getFeatureFlagResult(placementKey, { send_event: false, fresh: true })
        const assignment = posthog.getFeatureFlagResult(DISTRIBUTION_FLAG, { send_event: false, fresh: true })
        return !!placement?.enabled && !!assignment?.enabled && assignment.variant === 'offer'
    } catch {
        return false
    }
}

function captureStage(context: DistributionContext, stage: string, workflowId?: string, templateId?: string): void {
    try {
        posthog.capture(
            stage === 'draft created' && templateId
                ? 'hog_flow_created_from_template'
                : `workflow distribution ${stage}`,
            {
                project_uuid: context.projectUuid,
                wave_id: DISTRIBUTION_WAVE,
                placement_id: context.placementId,
                context_key: context.contextKey,
                arm: context.arm,
                stage,
                ...(context.external
                    ? { association_status: 'candidate', source_eligibility_required: true }
                    : { eligible_at: new Date(context.eligibleAt).toISOString() }),
                ...(workflowId ? { workflow_id: workflowId } : {}),
                ...(templateId ? { template_id: templateId } : {}),
            }
        )
    } catch {
        return
    }
}

export interface workflowDistributionLogicValues {
    memory: DistributionContext[]
    offers: Record<string, DistributionOffer>
    editorContext: DistributionContext | null
    editorGeneration: number
}

export interface workflowDistributionLogicActions {
    offer: (source: DistributionSource) => { source: DistributionSource }
    remember: (context: DistributionContext) => { context: DistributionContext }
    setOffer: (offer: DistributionOffer) => { offer: DistributionOffer }
    removeOffer: (contextKey: string) => { contextKey: string }
    offerShown: (contextKey: string) => { contextKey: string }
    open: (contextKey: string) => { contextKey: string }
    dismiss: (contextKey: string) => { contextKey: string }
    editorArrived: (contextKey?: string) => { contextKey?: string }
    setEditorContext: (context: DistributionContext | null) => { context: DistributionContext | null }
    createStarted: (contextKey?: string) => { contextKey?: string }
    draftCreated: (
        context: DistributionContext,
        workflowId: string,
        templateId?: string
    ) => {
        context: DistributionContext
        workflowId: string
        templateId?: string
    }
    receiveExternalContext: (editorId: string, href: string) => { editorId: string; href: string }
    editorDeparted: (editorId: string) => { editorId: string }
    clearTransient: () => {}
}

export type workflowDistributionLogicType = MakeLogicType<
    workflowDistributionLogicValues,
    workflowDistributionLogicActions
>

export const workflowDistributionLogic = kea<workflowDistributionLogicType>([
    path(['products', 'workflows', 'workflowDistributionLogic']),
    connect({ values: [teamLogic, []] }),
    actions({
        offer: (source: DistributionSource) => ({ source }),
        remember: (context: DistributionContext) => ({ context }),
        setOffer: (offer: DistributionOffer) => ({ offer }),
        removeOffer: (contextKey: string) => ({ contextKey }),
        offerShown: (contextKey: string) => ({ contextKey }),
        open: (contextKey: string) => ({ contextKey }),
        dismiss: (contextKey: string) => ({ contextKey }),
        editorArrived: (contextKey?: string) => ({ contextKey }),
        setEditorContext: (context: DistributionContext | null) => ({ context }),
        createStarted: (contextKey?: string) => ({ contextKey }),
        draftCreated: (context: DistributionContext, workflowId: string, templateId?: string) => ({
            context,
            workflowId,
            templateId,
        }),
        receiveExternalContext: (editorId: string, href: string) => ({ editorId, href }),
        editorDeparted: (editorId: string) => ({ editorId }),
        clearTransient: () => ({}),
    }),
    reducers({
        editorGeneration: [0, { clearTransient: (state) => state + 1 }],
        memory: [
            [] as DistributionContext[],
            { persist: true },
            {
                remember: (state, { context }) =>
                    [...state.filter((item) => item.contextKey !== context.contextKey), context]
                        .filter((item) => item.eligibleAt > Date.now() - MEMORY_TTL)
                        .slice(-MEMORY_LIMIT),
            },
        ],
        offers: [
            {} as Record<string, DistributionOffer>,
            {
                setOffer: (state, { offer }) => ({ ...state, [offer.contextKey]: offer }),
                removeOffer: (state, { contextKey }) =>
                    Object.fromEntries(Object.entries(state).filter(([key]) => key !== contextKey)),
                clearTransient: () => ({}),
            },
        ],
        editorContext: [
            null as DistributionContext | null,
            {
                setEditorContext: (_, { context }) => context,
                createStarted: () => null,
                clearTransient: () => null,
            },
        ],
    }),
    listeners(({ actions, values, cache }) => ({
        receiveExternalContext: ({ editorId, href }) => {
            const url = new URL(href)
            if (!new URLSearchParams(url.hash.slice(1)).has(DISTRIBUTION_CONTEXT_PARAM)) {
                return
            }
            const reference = readExternalWorkflowReference(url)
            const remaining = new URLSearchParams(url.hash.slice(1))
            remaining.delete(DISTRIBUTION_CONTEXT_PARAM)
            url.hash = remaining.toString()
            window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
            router.actions.replace(url.pathname + url.search + url.hash)
            if (!reference) {
                return
            }
            const contextKey = uuid(
                JSON.stringify([
                    reference.projectUuid,
                    DISTRIBUTION_WAVE,
                    reference.placementId,
                    reference.sourceActionId,
                ]),
                uuid.URL
            )
            if (
                values.memory.some(
                    (item) => item.contextKey === contextKey && item.eligibleAt > Date.now() - MEMORY_TTL
                )
            ) {
                return
            }
            const generation = values.editorGeneration
            const identity = posthog.get_distinct_id()
            cache.externalRoute = router.values.location.pathname
            cache.externalProject = reference.projectUuid
            cache.externalProjectId = reference.projectId
            cache.externalPending = true
            cache.externalEditorId = editorId
            cache.editorUserId = getAppContext()?.current_user?.id
            const currentProjectMatches = (): boolean =>
                generation === values.editorGeneration &&
                posthog.get_distinct_id() === identity &&
                teamLogic.values.currentTeam?.id === reference.projectId &&
                isAuthorized(reference.projectUuid) &&
                posthog.getGroups().project === reference.projectUuid
            cache.disposables.add(
                () => {
                    const timeout = window.setTimeout(() => actions.clearTransient(), 10000)
                    const unsubscribe = posthog.onFeatureFlags((_flags, variants, resolution) => {
                        if (resolution?.errorsLoading === undefined) {
                            return
                        }
                        if (!teamLogic.values.currentTeam) {
                            return
                        }
                        cache.externalPending = false
                        cache.disposables.dispose('external-assignment')
                        const placementKey = `${DISTRIBUTION_FLAG}-${reference.placementId}`
                        if (
                            !currentProjectMatches() ||
                            resolution.errorsLoading ||
                            !(DISTRIBUTION_FLAG in variants) ||
                            !(placementKey in variants) ||
                            !hasExternalOffer(reference.projectUuid, reference.placementId)
                        ) {
                            return
                        }
                        const context: DistributionContext = {
                            contextKey,
                            projectUuid: reference.projectUuid,
                            placementId: reference.placementId,
                            eligibleAt: reference.eligibleAt,
                            arm: 'offer',
                            external: true,
                            projectId: reference.projectId,
                            opened: false,
                        }
                        actions.remember(context)
                        actions.setEditorContext({ ...context, editorId, editorGeneration: generation })
                        captureStage(context, 'editor arrived')
                    })
                    posthog.reloadFeatureFlags()
                    return () => {
                        window.clearTimeout(timeout)
                        unsubscribe()
                    }
                },
                'external-assignment',
                { pauseOnPageHidden: false }
            )
        },
        editorDeparted: ({ editorId }) => {
            if (editorId && cache.externalEditorId === editorId) {
                actions.clearTransient()
            }
        },
        clearTransient: () => {
            cache.disposables.dispose('external-assignment')
            cache.externalEditorId = null
            cache.externalRoute = null
            cache.externalProject = null
            cache.externalProjectId = null
            cache.externalPending = false
        },
        [router.actionTypes.locationChanged]: () => {
            if (
                cache.externalRoute &&
                (cache.externalRoute !== router.values.location.pathname ||
                    ['templateId', 'editTemplateId', 'trigger', DISTRIBUTION_CONTEXT_PARAM].some((key) =>
                        new URLSearchParams(router.values.location.search).has(key)
                    ))
            ) {
                actions.clearTransient()
            }
        },
        [userLogic.actionTypes.loadUserSuccess]: ({ user }) => {
            if (cache.externalEditorId && cache.editorUserId !== user?.id) {
                actions.clearTransient()
            }
        },
        offer: ({ source }) => {
            if (
                !source.eligible ||
                !isAuthorized(source.projectUuid) ||
                !source.sourceActionId ||
                source.sourceActionId.length > 128
            ) {
                return
            }
            if (posthog.getGroups().project !== source.projectUuid) {
                return
            }
            const placementFlag = `${DISTRIBUTION_FLAG}-${source.placementId}`
            const overrides = posthog.get_property('$override_feature_flags')
            if (overrides && (DISTRIBUTION_FLAG in overrides || placementFlag in overrides)) {
                return
            }
            const placement = posthog.getFeatureFlagResult(placementFlag, { send_event: false })
            const assignment = posthog.getFeatureFlagResult(DISTRIBUTION_FLAG, { send_event: false })
            if (
                !placement?.enabled ||
                !assignment?.enabled ||
                !['offer', 'control'].includes(assignment.variant ?? '')
            ) {
                return
            }
            const contextKey = uuid(
                JSON.stringify([source.projectUuid, DISTRIBUTION_WAVE, source.placementId, source.sourceActionId]),
                uuid.URL
            )
            const existing = values.memory.find(
                (item) => item.contextKey === contextKey && item.eligibleAt > Date.now() - MEMORY_TTL
            )
            const context: DistributionContext = existing ?? {
                contextKey,
                projectUuid: source.projectUuid,
                placementId: source.placementId,
                arm: assignment.variant as 'offer' | 'control',
                eligibleAt: Date.now(),
            }
            if (!existing) {
                actions.remember(context)
                captureStage(context, 'eligible')
            }
            if (context.arm === 'offer' && !context.outcome) {
                actions.setOffer({ ...context, trigger: source.trigger, templateId: source.templateId })
            }
        },
        offerShown: ({ contextKey }) => {
            const offer = values.offers[contextKey]
            const shown = (cache.shown ??= new Set<string>()) as Set<string>
            if (offer && isAuthorized(offer.projectUuid) && !shown.has(contextKey)) {
                shown.add(contextKey)
                captureStage(offer, 'offer shown')
            }
        },
        open: ({ contextKey }) => {
            const offer = values.offers[contextKey]
            if (!offer || !isAuthorized(offer.projectUuid)) {
                return
            }
            actions.remember({
                contextKey,
                projectUuid: offer.projectUuid,
                placementId: offer.placementId,
                arm: offer.arm,
                eligibleAt: offer.eligibleAt,
                opened: true,
            })
            actions.removeOffer(contextKey)
            captureStage(offer, 'clicked')
            router.actions.push(
                combineUrl(urls.workflowNew(), {
                    mode: 'editor',
                    [DISTRIBUTION_CONTEXT_PARAM]: contextKey,
                    ...(offer.templateId ? { templateId: offer.templateId } : {}),
                    ...(offer.trigger && !offer.templateId ? { trigger: JSON.stringify(offer.trigger) } : {}),
                }).url
            )
        },
        dismiss: ({ contextKey }) => {
            const offer = values.offers[contextKey]
            if (offer && isAuthorized(offer.projectUuid)) {
                const { trigger: _trigger, templateId: _templateId, ...context } = offer
                actions.remember({ ...context, opened: false, outcome: 'dismissed' })
                actions.removeOffer(contextKey)
                captureStage(context, 'dismissed')
            }
        },
        editorArrived: ({ contextKey }) => {
            cache.editorUserId = getAppContext()?.current_user?.id
            const context = values.memory.find(
                (item) =>
                    item.contextKey === contextKey &&
                    item.opened &&
                    !item.outcome &&
                    item.eligibleAt > Date.now() - MEMORY_TTL
            )
            actions.setEditorContext(
                context && isAuthorized(context.projectUuid)
                    ? { ...context, editorGeneration: values.editorGeneration }
                    : null
            )
            if (values.editorContext) {
                captureStage(values.editorContext, 'editor arrived')
            }
        },
        createStarted: ({ contextKey }) => {
            const opened = values.memory.find((item) => item.contextKey === contextKey)
            if (opened) {
                actions.remember({ ...opened, opened: false })
            }
        },
        draftCreated: ({ context, workflowId, templateId }) => {
            if (
                workflowId &&
                isAuthorized(context.projectUuid) &&
                context.eligibleAt > Date.now() - MEMORY_TTL &&
                (context.editorGeneration === undefined || context.editorGeneration === values.editorGeneration) &&
                (!context.external ||
                    (context.projectId === teamLogic.values.currentTeam?.id &&
                        hasExternalOffer(context.projectUuid, context.placementId)))
            ) {
                actions.remember({
                    ...context,
                    editorId: undefined,
                    editorGeneration: undefined,
                    opened: false,
                    outcome: 'created',
                })
                actions.removeOffer(context.contextKey)
                captureStage(context, 'draft created', workflowId, templateId)
            }
        },
        [teamLogic.actionTypes.loadCurrentTeamSuccess]: ({ currentTeam }) => {
            if (
                (cache.externalProject && cache.externalProject !== currentTeam?.uuid) ||
                (values.editorContext && values.editorContext.projectUuid !== currentTeam?.uuid) ||
                Object.values(values.offers).some((offer) => offer.projectUuid !== currentTeam?.uuid)
            ) {
                actions.clearTransient()
            } else if (
                cache.externalPending &&
                currentTeam?.uuid === cache.externalProject &&
                currentTeam?.id === cache.externalProjectId
            ) {
                posthog.reloadFeatureFlags()
            }
        },
    })),
])
