import { MOCK_DEFAULT_TEAM } from 'lib/api.mock'

import { router } from 'kea-router'
import { expectLogic } from 'kea-test-utils'
import posthog from 'posthog-js'

import { integrationsLogic } from 'lib/integrations/integrationsLogic'
import { teamLogic } from 'scenes/teamLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'
import {
    AccessControlLevel,
    AccessControlResourceType,
    AnyPropertyFilter,
    PropertyFilterType,
    PropertyOperator,
} from '~/types'

import type { HogFlowApi } from 'products/workflows/frontend/generated/api.schemas'

import { DistributionSource, workflowDistributionLogic } from '../Workflows/workflowDistributionLogic'
import { DEFAULT_BROADCAST_EMAIL, DELETED_SENDER_ERROR, broadcastWizardLogic } from './broadcastWizardLogic'

const LOCAL_AUDIENCE: AnyPropertyFilter[] = [
    { key: 'plan', value: ['pro'], operator: PropertyOperator.Exact, type: PropertyFilterType.Person },
]

function savedBroadcast(overrides: { name: string; subject: string; updatedAt: string }): HogFlowApi {
    return {
        id: 'broadcast-1',
        name: overrides.name,
        version: 1,
        status: 'draft',
        created_at: '2026-01-01T00:00:00Z',
        created_by: { id: 1, uuid: 'user-1', email: 'user@example.com', hedgehog_config: null },
        updated_at: overrides.updatedAt,
        last_run: null,
        trigger: { type: 'batch', filters: { properties: [] } },
        conversion: null,
        email_sending_rate_limit: null,
        actions: [
            {
                id: 'trigger_node',
                name: 'Trigger',
                type: 'trigger',
                config: { type: 'batch', filters: { properties: [] } },
            },
            {
                id: 'email_node',
                name: 'Email',
                type: 'function_email',
                config: { inputs: { email: { value: { subject: overrides.subject } } } },
            },
        ],
        abort_action: null,
        billable_action_types: [],
        schedules: [],
        user_access_level: 'editor',
        draft: null,
        draft_updated_at: null,
        action_redirects: null,
        email_sending_paused_at: null,
        email_sending_paused_reason: '',
        email_sending_paused_by: '',
        email_sending_pause_requires_support: false,
        email_sending_resumed_at: null,
    }
}

describe('broadcastWizardLogic', () => {
    let logic: ReturnType<typeof broadcastWizardLogic.build>
    let latest: HogFlowApi
    let releaseCreate: () => void
    let patchedSubjects: string[]
    let patchedTracking: unknown[]
    let patchedNames: string[]
    let holdPatch: Promise<void> | null
    let onPatchStarted: (() => void) | null
    let failPatches: number

    beforeEach(() => {
        patchedSubjects = []
        patchedTracking = []
        patchedNames = []
        holdPatch = null
        onPatchStarted = null
        failPatches = 0
        const created = new Promise<void>((resolve) => {
            releaseCreate = resolve
        })
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flows/:id/': () => [200, latest],
                '/api/projects/:team_id/integrations/': {
                    results: [{ id: 1, kind: 'email', config: { verified: true } }],
                    count: 1,
                },
            },
            post: {
                '/api/projects/:team_id/hog_flows/user_blast_radius/': () => [200, { affected: 0, total: 0 }],
                '/api/projects/:team_id/hog_flows/': async () => {
                    await created
                    return [201, savedBroadcast({ name: '', subject: '', updatedAt: '2026-09-24T10:00:00Z' })]
                },
            },
            patch: {
                '/api/projects/:team_id/hog_flows/:id/': async ({ request }) => {
                    const body = (await request.json()) as { actions?: any[]; name?: string }
                    if (!body.actions) {
                        patchedNames.push(body.name ?? '')
                        return [
                            200,
                            savedBroadcast({ name: body.name ?? '', subject: '', updatedAt: '2026-09-24T10:00:05Z' }),
                        ]
                    }
                    const emailConfig = body.actions.find((action) => action.type === 'function_email').config
                    const subject = emailConfig.inputs.email.value.subject
                    if (failPatches > 0) {
                        failPatches -= 1
                        return [500, { detail: 'Simulated outage' }]
                    }
                    patchedSubjects.push(subject)
                    patchedTracking.push(emailConfig.tracking_enabled)
                    onPatchStarted?.()
                    if (holdPatch) {
                        await holdPatch
                    }
                    return [200, savedBroadcast({ name: '', subject, updatedAt: '2026-09-24T10:00:05Z' })]
                },
            },
        })
        initKeaTests()
        logic = broadcastWizardLogic({ id: 'new' })
        logic.mount()
    })

    afterEach(() => {
        logic.unmount()
        jest.restoreAllMocks()
    })

    function openRelease(): {
        distribution: ReturnType<typeof workflowDistributionLogic>
        contextKey: string
        source: DistributionSource
    } {
        logic.unmount()
        localStorage.clear()
        sessionStorage.clear()
        window.POSTHOG_APP_CONTEXT!.resource_access_control = Object.fromEntries(
            Object.values(AccessControlResourceType).map((resource) => [resource, AccessControlLevel.Editor])
        ) as Record<AccessControlResourceType, AccessControlLevel>
        Object.defineProperty(posthog, 'getGroups', {
            value: jest.fn(() => ({ project: MOCK_DEFAULT_TEAM.uuid })),
            configurable: true,
        })
        jest.spyOn(posthog, 'getFeatureFlagResult').mockImplementation((key) => ({
            key,
            enabled: true,
            variant: key === 'workflows-distribution' ? 'offer' : undefined,
            payload: undefined,
        }))
        jest.mocked(posthog.get_property).mockReturnValue(undefined)
        jest.mocked(posthog.capture).mockClear()
        const distribution = workflowDistributionLogic()
        distribution.mount()
        const source: DistributionSource = {
            projectUuid: MOCK_DEFAULT_TEAM.uuid,
            placementId: 'release-announcement',
            sourceActionId: 'release-42-compact-everyone',
            eligible: true,
            releaseSeed: {
                projectUuid: MOCK_DEFAULT_TEAM.uuid,
                experimentId: 42,
                experimentName: 'Compact navigation',
                flagId: 8,
                flagKey: 'compact-navigation',
                variantKey: 'compact',
                releaseToEveryone: true,
            },
        }
        distribution.actions.offer(source)
        const offer = Object.values(distribution.values.offers)[0]
        distribution.actions.open(offer.contextKey)
        return { distribution, contextKey: offer.contextKey, source }
    }

    it.each(['uncertain create', 'project switch', 'stale context'])(
        'gives no create credit after %s and never retries automatically',
        async (reason) => {
            const { distribution, contextKey } = openRelease()
            let creates = 0
            let release!: () => void
            let started!: () => void
            const pending = new Promise<void>((resolve) => {
                release = resolve
            })
            const createStarted = new Promise<void>((resolve) => {
                started = resolve
            })
            useMocks({
                post: {
                    '/api/projects/:team_id/hog_flows/': async () => {
                        creates++
                        started()
                        await pending
                        return reason === 'uncertain create'
                            ? [500, { detail: 'Response unavailable' }]
                            : [201, savedBroadcast({ name: 'Draft', subject: '', updatedAt: '2026-09-24T10:00:00Z' })]
                    },
                },
            })
            logic = broadcastWizardLogic({ id: 'new', distributionContextKey: contextKey })
            logic.mount()
            logic.actions.chooseEveryone()
            logic.actions.continueStep()
            await createStarted
            if (reason === 'project switch') {
                teamLogic.actions.loadCurrentTeamSuccess({ ...MOCK_DEFAULT_TEAM, id: 7, uuid: 'another-project' })
                teamLogic.actions.loadCurrentTeamSuccess(MOCK_DEFAULT_TEAM)
            }
            if (reason === 'stale context') {
                jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 15 * 24 * 60 * 60 * 1000)
            }
            release()
            await expectLogic(logic).toFinishAllListeners()
            expect(creates).toBe(1)
            expect(logic.values.broadcastId).toBe(reason === 'stale context' ? 'broadcast-1' : null)
            expect(posthog.capture).not.toHaveBeenCalledWith('workflow distribution draft created', expect.anything())
            if (reason === 'uncertain create') {
                useMocks({
                    post: {
                        '/api/projects/:team_id/hog_flows/': () => {
                            creates++
                            return [
                                201,
                                savedBroadcast({
                                    name: 'Manual retry',
                                    subject: '',
                                    updatedAt: '2026-09-24T10:00:00Z',
                                }),
                            ]
                        },
                    },
                })
                await expectLogic(logic, () => logic.actions.continueStep()).toFinishAllListeners()
                expect(creates).toBe(2)
                expect(posthog.capture).not.toHaveBeenCalledWith(
                    'workflow distribution draft created',
                    expect.anything()
                )
            }
            distribution.unmount()
        }
    )

    it.each([
        { mode: 'now', failure: 'batch', expected: ['create', 'activate', 'batch', 'rollback'] },
        { mode: 'later', failure: 'activation', expected: ['create', 'schedule', 'activate'] },
        { mode: 'later', failure: null, expected: ['create', 'schedule', 'activate'] },
    ] as const)(
        'keeps $mode launch with $failure separate from creation, activation and delivery',
        async ({ mode, failure, expected }) => {
            const { distribution, contextKey } = openRelease()
            const calls: string[] = []
            const sendAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            useMocks({
                post: {
                    '/api/projects/:team_id/hog_flows/': () => {
                        calls.push('create')
                        latest = {
                            ...savedBroadcast({
                                name: 'Release draft',
                                subject: 'Release update',
                                updatedAt: '2026-09-24T10:00:00Z',
                            }),
                            origin_product: 'broadcasts',
                        }
                        return [201, latest]
                    },
                    '/api/projects/:team_id/hog_flows/:id/batch_jobs/': () => {
                        calls.push('batch')
                        return [500, { detail: 'Dispatch unavailable' }]
                    },
                    '/api/projects/:team_id/hog_flows/:id/schedules/': async ({ request }) => {
                        calls.push('schedule')
                        expect(await request.json()).toMatchObject({ rrule: 'FREQ=DAILY;COUNT=1', starts_at: sendAt })
                        return [201, { id: 'invented-schedule' }]
                    },
                },
                patch: {
                    '/api/projects/:team_id/hog_flows/:id/': async ({ request }) => {
                        const payload = (await request.json()) as { status: HogFlowApi['status'] }
                        calls.push(payload.status === 'active' ? 'activate' : 'rollback')
                        if (failure === 'activation') {
                            return [500, { detail: 'Activation unavailable' }]
                        }
                        latest = { ...latest, ...payload }
                        return [200, latest]
                    },
                },
            })
            logic = broadcastWizardLogic({ id: 'new', distributionContextKey: contextKey })
            logic.mount()
            await expectLogic(logic).toFinishAllListeners()
            await expectLogic(integrationsLogic).toFinishAllListeners()
            logic.actions.chooseEveryone()
            logic.actions.setEmail({
                ...DEFAULT_BROADCAST_EMAIL,
                from: { integrationId: 1 },
                subject: 'Release update',
                html: '<p>A navigation update is available.</p>',
            })
            logic.actions.setScheduleMode(mode)
            if (mode === 'later') {
                logic.actions.setSendAt(sendAt)
            }
            await expectLogic(logic, () => logic.actions.launchBroadcast()).toFinishAllListeners()
            expect(calls).toEqual(expected)
            const launched = jest.mocked(posthog.capture).mock.calls.filter(([event]) => event === 'broadcast launched')
            expect(launched).toHaveLength(failure ? 0 : 1)
            expect(
                jest.mocked(posthog.capture).mock.calls.filter(([event]) => event.includes('delivered'))
            ).toHaveLength(0)
            expect(
                jest
                    .mocked(posthog.capture)
                    .mock.calls.filter(([event]) => event === 'workflow distribution draft created')
            ).toHaveLength(1)
            distribution.unmount()
        }
    )

    it.each(['continue', 'content', 'launch'])(
        'observes one first-create from %s and keeps creation guarded while pending',
        async (path) => {
            const { distribution, contextKey } = openRelease()
            const requests: string[] = []
            let resolveCreate!: () => void
            const pending = new Promise<void>((resolve) => {
                resolveCreate = resolve
            })
            let started!: () => void
            const createStarted = new Promise<void>((resolve) => {
                started = resolve
            })
            useMocks({
                post: {
                    '/api/projects/:team_id/hog_flows/': async () => {
                        requests.push('create')
                        started()
                        await pending
                        latest = {
                            ...savedBroadcast({
                                name: 'Release draft',
                                subject: 'Release update',
                                updatedAt: '2026-09-24T10:00:00Z',
                            }),
                            id: 'returned-release-id',
                            origin_product: 'broadcasts',
                        }
                        return [201, latest]
                    },
                    '/api/projects/:team_id/hog_flows/:id/batch_jobs/': () => {
                        requests.push('batch')
                        return [201, { id: 'invented-job', status: 'waiting' }]
                    },
                },
                patch: {
                    '/api/projects/:team_id/hog_flows/:id/': async ({ request }) => {
                        const payload = (await request.json()) as { status?: HogFlowApi['status'] }
                        requests.push(payload.status === 'active' ? 'activate' : 'update')
                        latest = { ...latest, ...payload }
                        return [200, latest]
                    },
                },
            })
            logic = broadcastWizardLogic({ id: 'new', distributionContextKey: contextKey })
            logic.mount()
            await expectLogic(logic).toFinishAllListeners()
            await expectLogic(integrationsLogic).toFinishAllListeners()
            logic.actions.chooseEveryone()
            logic.actions.setEmail({
                ...DEFAULT_BROADCAST_EMAIL,
                from: { integrationId: 1 },
                subject: 'Release update',
                html: '<p>A navigation update is available.</p>',
            })
            const save = (): void => {
                if (path === 'continue') {
                    logic.actions.continueStep()
                } else if (path === 'content') {
                    logic.actions.setStep('content')
                } else {
                    logic.actions.launchBroadcast()
                }
            }
            save()
            await createStarted
            save()
            expect(requests).toEqual(['create'])
            resolveCreate()
            await expectLogic(logic).toFinishAllListeners()
            expect(requests.filter((request) => request === 'create')).toHaveLength(1)
            expect(
                jest
                    .mocked(posthog.capture)
                    .mock.calls.filter(([event]) => event === 'workflow distribution draft created')
            ).toEqual([
                [
                    'workflow distribution draft created',
                    expect.objectContaining({
                        workflow_id: 'returned-release-id',
                        placement_id: 'release-announcement',
                    }),
                ],
            ])
            if (path === 'launch') {
                expect(requests).toEqual(['create', 'activate', 'batch'])
                expect(posthog.capture).toHaveBeenCalledWith(
                    'broadcast launched',
                    expect.objectContaining({ broadcast_id: 'returned-release-id', schedule_mode: 'now' })
                )
            } else {
                expect(requests).toEqual(['create'])
            }
            distribution.unmount()
        }
    )

    it.each(['everyone', 'filters'])(
        'arrives inactive and unsaved, then saves an explicitly chosen %s audience under its returned ID',
        async (audience) => {
            const { distribution, contextKey, source } = openRelease()
            const requests: unknown[] = []
            let previews = 0
            useMocks({
                post: {
                    '/api/projects/:team_id/hog_flows/user_blast_radius/': () => {
                        previews++
                        return [200, { affected: 3, total: 3 }]
                    },
                    '/api/projects/:team_id/hog_flows/': async ({ request }) => {
                        const payload = (await request.json()) as Partial<HogFlowApi>
                        requests.push(payload)
                        latest = {
                            ...savedBroadcast({
                                name: 'Release announcement: Compact navigation',
                                subject: '',
                                updatedAt: '2026-09-24T10:00:00Z',
                            }),
                            ...payload,
                            id: 'draft-from-response',
                            origin_product: 'broadcasts',
                        }
                        return [201, latest]
                    },
                },
            })
            logic = broadcastWizardLogic({ id: 'new', distributionContextKey: contextKey })
            logic.mount()
            await expectLogic(logic).toFinishAllListeners()
            expect(logic.values.name).toBe('Release announcement: Compact navigation')
            expect(logic.values.broadcastId).toBeNull()
            expect(logic.values.releaseSession?.seed.variantKey).toBe('compact')
            expect(logic.values.stepValidationErrors.recipients).toEqual([
                'Choose recipients or explicitly select everyone',
            ])
            expect(previews).toBe(0)
            await expectLogic(logic, () => logic.actions.continueStep()).toFinishAllListeners()
            expect(requests).toHaveLength(0)
            if (audience === 'everyone') {
                logic.actions.chooseEveryone()
            } else {
                logic.actions.setAudienceProperties(LOCAL_AUDIENCE)
            }
            await expectLogic(logic, () => logic.actions.continueStep()).toFinishAllListeners()
            expect(requests).toEqual([
                expect.objectContaining({
                    origin_product: 'broadcasts',
                    status: 'draft',
                    actions: expect.arrayContaining([
                        expect.objectContaining({
                            type: 'trigger',
                            config: {
                                type: 'batch',
                                filters: { properties: audience === 'everyone' ? [] : LOCAL_AUDIENCE },
                            },
                        }),
                    ]),
                }),
            ])
            expect(router.values.location.pathname).toContain('/broadcasts/draft-from-response')
            expect(posthog.capture).toHaveBeenCalledWith(
                'workflow distribution draft created',
                expect.objectContaining({ workflow_id: 'draft-from-response', placement_id: 'release-announcement' })
            )
            expect(
                jest
                    .mocked(posthog.capture)
                    .mock.calls.filter(([event]) => event === 'workflow distribution draft created')
            ).toHaveLength(1)
            expect(logic.values.stepValidationErrors.content).toContain('Choose an email sender')
            logic.unmount()
            logic = broadcastWizardLogic({ id: 'draft-from-response' })
            logic.mount()
            await expectLogic(logic).toFinishAllListeners()
            distribution.actions.offer(source)
            expect(Object.values(distribution.values.offers)).toHaveLength(0)
            expect(logic.values.releaseSession?.audienceChosen).toBe(true)
            distribution.unmount()
        }
    )

    it('requires recipient selection when the saved release audience changed in another editor', async () => {
        const { distribution, contextKey } = openRelease()
        useMocks({
            post: {
                '/api/projects/:team_id/hog_flows/': async ({ request }) => {
                    const payload = (await request.json()) as Partial<HogFlowApi>
                    latest = {
                        ...savedBroadcast({ name: 'Release draft', subject: '', updatedAt: '2026-10-08T10:00:00Z' }),
                        ...payload,
                    }
                    return [201, latest]
                },
            },
        })
        logic = broadcastWizardLogic({ id: 'new', distributionContextKey: contextKey })
        logic.mount()
        logic.actions.setAudienceProperties(LOCAL_AUDIENCE)
        await expectLogic(logic, () => logic.actions.continueStep()).toFinishAllListeners()
        latest = {
            ...latest,
            actions: latest.actions.map((action) =>
                action.type === 'trigger'
                    ? { ...action, config: { type: 'batch', filters: { properties: [] } } }
                    : action
            ),
        }
        logic.unmount()
        logic = broadcastWizardLogic({ id: latest.id })
        logic.mount()
        await expectLogic(logic).toFinishAllListeners()
        expect(logic.values.stepValidationErrors.recipients).toContain(
            'Choose recipients or explicitly select everyone'
        )
        expect(
            jest.mocked(posthog.capture).mock.calls.filter(([event]) => event === 'workflow distribution draft created')
        ).toHaveLength(1)
        distribution.unmount()
    })

    test.each([
        { edited: 'only the email', latestName: 'Spring sale', expectedName: 'Spring sale, final' },
        { edited: 'the name too', latestName: 'Spring promo', expectedName: 'Spring promo' },
    ])(
        'an edit saved elsewhere that changed $edited keeps the unsaved local fields it did not change',
        async ({ latestName, expectedName }) => {
            const base = savedBroadcast({ name: 'Spring sale', subject: '', updatedAt: '2026-09-24T10:00:00Z' })
            latest = savedBroadcast({
                name: latestName,
                subject: 'Our spring sale starts today',
                updatedAt: '2026-09-24T10:00:05Z',
            })
            logic.actions.draftAutosaved(base)
            logic.actions.setName('Spring sale, final')
            logic.actions.setAudienceProperties(LOCAL_AUDIENCE)

            await expectLogic(logic, () => {
                logic.actions.resourceEdited({
                    notification_type: 'resource_edited',
                    team_id: 1,
                    resource_type: 'HogFlow',
                    resource_id: base.id,
                    updated_at: latest.updated_at,
                    actor_user_id: null,
                })
            })
                .toDispatchActions(['applyExternalEdit'])
                .toMatchValues({
                    broadcast: latest,
                    name: expectedName,
                    audienceProperties: LOCAL_AUDIENCE,
                    email: expect.objectContaining({ subject: 'Our spring sale starts today' }),
                })
        }
    )

    it.each([
        { case: 'a renamed draft', status: 'draft', name: 'Spring sale, final', saved: ['Spring sale, final'] },
        { case: 'an unchanged name', status: 'draft', name: 'Spring sale', saved: [] },
        { case: 'a blank name', status: 'draft', name: '  ', saved: [] },
        { case: 'a live broadcast', status: 'active', name: 'Spring sale, final', saved: [] },
    ])('saves the name on blur only for $case', async ({ status, name, saved }) => {
        logic.actions.draftAutosaved({
            ...savedBroadcast({ name: 'Spring sale', subject: '', updatedAt: '2026-09-24T10:00:00Z' }),
            status: status as HogFlowApi['status'],
        })
        logic.actions.setName(name)

        await expectLogic(logic, () => {
            logic.actions.saveName()
        }).toFinishAllListeners()

        expect(patchedNames).toEqual(saved)
        if (saved.length) {
            expect(logic.values.broadcast?.name).toEqual(name)
        }
    })

    it('moves a new broadcast onto its draft URL once the draft is created', async () => {
        router.actions.push('/broadcasts/new')
        await expectLogic(logic, () => {
            logic.actions.setStep('content')
            releaseCreate()
        }).toDispatchActions(['draftAutosaved', 'showSavedDraftUrl'])

        expect(router.values.location.pathname).toContain('/broadcasts/broadcast-1')
        expect(router.values.searchParams).toEqual({ step: 'content' })
    })

    it.each([
        {
            edit: 'an email edit',
            apply: (): void =>
                logic.actions.setEmail({ ...DEFAULT_BROADCAST_EMAIL, subject: 'Typed during the create' }),
            subject: 'Typed during the create',
            tracking: true,
        },
        {
            edit: 'turning tracking off',
            apply: (): void => logic.actions.setEmailSettings({ trackingEnabled: false }),
            subject: '',
            tracking: false,
        },
    ])('saves $edit made while the draft is created before leaving /broadcasts/new', async (testCase) => {
        router.actions.push('/broadcasts/new')
        logic.actions.setStep('content')
        testCase.apply()
        releaseCreate()

        await expectLogic(logic).toDispatchActions(['draftAutosaved', 'draftAutosaved'])
        await expectLogic(logic).toDispatchActions(['showSavedDraftUrl']).toFinishAllListeners()

        expect(patchedSubjects).toEqual([testCase.subject])
        expect(patchedTracking).toEqual([testCase.tracking])
        expect(router.values.location.pathname).toContain('/broadcasts/broadcast-1')
    })

    it('retries a failed email autosave and moves to the draft URL once it saves', async () => {
        router.actions.push('/broadcasts/new')
        logic.actions.setStep('content')
        releaseCreate()
        await expectLogic(logic).toDispatchActions(['draftAutosaved', 'showSavedDraftUrl'])
        router.actions.push('/broadcasts/new')
        failPatches = 1

        logic.actions.setEmail({ ...DEFAULT_BROADCAST_EMAIL, subject: 'Saved on the retry' })

        await expectLogic(logic)
            .toDispatchActions(['setEmail', 'draftAutosaved', 'showSavedDraftUrl'])
            .toFinishAllListeners()
        expect(patchedSubjects).toEqual(['Saved on the retry'])
        expect(router.values.location.pathname).toContain('/broadcasts/broadcast-1')
    })

    it('moves to the draft URL when Continue saves an email edit still waiting on its autosave', async () => {
        router.actions.push('/broadcasts/new')
        logic.actions.setStep('content')
        releaseCreate()
        await expectLogic(logic).toDispatchActions(['draftAutosaved', 'showSavedDraftUrl'])
        router.actions.push('/broadcasts/new')

        logic.actions.setEmail({
            ...DEFAULT_BROADCAST_EMAIL,
            from: { ...DEFAULT_BROADCAST_EMAIL.from, integrationId: 1 },
            subject: 'Typed before Continue',
            html: '<p>Hi</p>',
        })
        await expectLogic(logic, () => {
            logic.actions.continueStep()
        }).toDispatchActions(['nextStep', 'showSavedDraftUrl'])

        expect(patchedSubjects).toEqual(['Typed before Continue'])
        expect(router.values.location.pathname).toContain('/broadcasts/broadcast-1')
    })

    it('keeps an email edit made while Continue is saving and moves to the draft URL after it saves', async () => {
        const validEmail = {
            ...DEFAULT_BROADCAST_EMAIL,
            from: { ...DEFAULT_BROADCAST_EMAIL.from, integrationId: 1 },
            html: '<p>Hi</p>',
        }
        router.actions.push('/broadcasts/new')
        logic.actions.setStep('content')
        releaseCreate()
        await expectLogic(logic).toDispatchActions(['draftAutosaved'])
        logic.actions.setEmail({ ...validEmail, subject: 'Saved by Continue' })
        await expectLogic(logic).toDispatchActions(['draftAutosaved', 'showSavedDraftUrl'])
        router.actions.push('/broadcasts/new')
        patchedSubjects = []

        let releasePatch: () => void = () => {}
        holdPatch = new Promise((resolve) => {
            releasePatch = resolve
        })
        const patchStarted = new Promise<void>((resolve) => {
            onPatchStarted = resolve
        })
        logic.actions.continueStep()
        await patchStarted
        holdPatch = null
        logic.actions.setEmail({ ...validEmail, subject: 'Typed during Continue' })
        releasePatch()

        await expectLogic(logic).toDispatchActions(['nextStep', 'draftAutosaved', 'showSavedDraftUrl'])
        expect(patchedSubjects).toEqual(['Saved by Continue', 'Typed during Continue'])
        expect(router.values.location.pathname).toContain('/broadcasts/broadcast-1')
    })

    it.each([
        { stop: 'the audience is over the batch limit', affected: 60000, editedElsewhere: false, step: 'recipients' },
        { stop: 'the draft was edited elsewhere', affected: 10, editedElsewhere: true, step: 'review' },
    ])(
        'moves to the draft URL when a launch from /broadcasts/new stops because $stop',
        async ({ affected, editedElsewhere, step }) => {
            latest = savedBroadcast({
                name: '',
                subject: 'Edited by the assistant',
                updatedAt: editedElsewhere ? '2026-09-24T10:00:09Z' : '2026-09-24T10:00:00Z',
            })
            useMocks({
                post: {
                    '/api/projects/:team_id/hog_flows/user_blast_radius/': () => [
                        200,
                        { affected, total: affected, limit: 50000, dedupe_key: 'email', confirm_token: 'token' },
                    ],
                },
            })
            router.actions.push('/broadcasts/new')
            logic.actions.setEmail({
                ...DEFAULT_BROADCAST_EMAIL,
                from: { ...DEFAULT_BROADCAST_EMAIL.from, integrationId: 1 },
                subject: 'Launch over the limit',
                html: '<p>Hi</p>',
            })
            releaseCreate()

            logic.actions.setStep('review')
            await expectLogic(logic, () => {
                logic.actions.launchBroadcast()
            }).toDispatchActions(['saveBroadcastFinished', 'launchBroadcastFinished', 'showSavedDraftUrl'])

            expect(router.values.location.pathname).toContain('/broadcasts/broadcast-1')
            expect(router.values.searchParams).toEqual({ step })
        }
    )

    it.each([
        { sender: 'a sender that still exists', integrationId: 1, integrationIds: undefined, expected: [] },
        { sender: 'a deleted sender', integrationId: 7, integrationIds: undefined, expected: [DELETED_SENDER_ERROR] },
        {
            sender: 'a deleted sender in the rotation',
            integrationId: 1,
            integrationIds: [1, 7],
            expected: [DELETED_SENDER_ERROR],
        },
    ])('flags $sender on the content step and once on review', async ({ integrationId, integrationIds, expected }) => {
        integrationsLogic.mount()
        await expectLogic(integrationsLogic, () => {
            integrationsLogic.actions.loadIntegrations()
        }).toDispatchActions(['loadIntegrationsSuccess'])

        logic.actions.setEmail({
            ...DEFAULT_BROADCAST_EMAIL,
            from: { ...DEFAULT_BROADCAST_EMAIL.from, integrationId, integrationIds },
            subject: 'Spring sale',
            html: '<p>Hi</p>',
        })

        expect(logic.values.stepValidationErrors.content).toEqual(expected)
        expect(logic.values.stepValidationErrors.review).toEqual(expected)
    })

    it('resumes a saved draft on the step in its URL and drops the step from the URL', async () => {
        latest = savedBroadcast({ name: 'Spring sale', subject: '', updatedAt: '2026-09-24T10:00:00Z' })
        router.actions.push('/broadcasts/broadcast-1', { step: 'content', other: 'kept' })
        const draftLogic = broadcastWizardLogic({ id: 'broadcast-1' })

        await expectLogic(draftLogic, () => {
            draftLogic.mount()
        })
            .toDispatchActions(['hydrateFromBroadcast', 'setStep'])
            .toMatchValues({ currentStep: 'content' })
        expect(router.values.searchParams).toEqual({ other: 'kept' })
        draftLogic.unmount()
    })
})
