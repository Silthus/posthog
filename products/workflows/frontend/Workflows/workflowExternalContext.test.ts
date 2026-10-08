import { MOCK_DEFAULT_TEAM, MOCK_DEFAULT_USER } from 'lib/api.mock'

import { router } from 'kea-router'
import { expectLogic } from 'kea-test-utils'
import { gunzipSync } from 'node:zlib'
import posthog, { FeatureFlagsCallback } from 'posthog-js'

import { teamLogic } from 'scenes/teamLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'
import { AccessControlLevel, AccessControlResourceType } from '~/types'

import { workflowDistributionLogic } from './workflowDistributionLogic'
import { NEW_WORKFLOW, workflowLogic } from './workflowLogic'

Object.defineProperty(posthog, 'getGroups', { value: jest.fn(), configurable: true })
Object.defineProperty(posthog, 'reloadFeatureFlags', { value: jest.fn(), configurable: true })
const sdkMethods = [
    'onFeatureFlags',
    'reloadFeatureFlags',
    'getFeatureFlagResult',
    'getGroups',
    'get_property',
    'get_distinct_id',
] as const
const sdkDescriptors = sdkMethods.map((method) => [method, Object.getOwnPropertyDescriptor(posthog, method)!] as const)

const returnedId = '964d1cba-21d8-408d-940a-bdc01beb286d'
const reference = {
    projectId: MOCK_DEFAULT_TEAM.id,
    projectUuid: 'b28a84c7-c68f-4d16-b7b8-761320667f7d',
    waveId: 'workflows-distribution-v1',
    placementId: 'sdk-wizard',
    sourceActionId: 'example-setup-17',
    eligibleAt: Date.now() - 1000,
}

function followLink(payload: unknown = reference, query = 'mode=editor'): void {
    const path = `/project/${MOCK_DEFAULT_TEAM.id}/workflows/new/workflow?${query}#distributionContext=${encodeURIComponent(JSON.stringify(payload))}&tab=workflow`
    window.history.replaceState({}, '', path)
    router.actions.push(path)
}

describe('external link through router and explicit editor create', () => {
    let requests: { method: string; body: unknown }[]
    let distribution: ReturnType<typeof workflowDistributionLogic.build>

    beforeEach(() => {
        localStorage.clear()
        requests = []
        useMocks({
            get: {
                '/api/projects/:team_id/hog_function_templates/': { results: [], count: 0 },
                '/api/users/@me/': MOCK_DEFAULT_USER,
            },
            post: {
                '/api/environments/:team_id/hog_flows/': async ({ request }) => {
                    const body = await request.json()
                    requests.push({ method: 'POST', body })
                    return [201, { ...NEW_WORKFLOW, id: returnedId }]
                },
            },
        })
        initKeaTests()
        window.POSTHOG_APP_CONTEXT!.resource_access_control = Object.fromEntries(
            Object.values(AccessControlResourceType).map((resource) => [resource, AccessControlLevel.Editor])
        ) as Record<AccessControlResourceType, AccessControlLevel>
        jest.mocked(posthog.get_property).mockReset()
        jest.mocked(posthog.capture).mockClear()
        jest.spyOn(posthog, 'getGroups').mockReturnValue({ project: reference.projectUuid })
        jest.spyOn(posthog, 'getFeatureFlagResult').mockImplementation((key) => ({
            key,
            enabled: true,
            variant: key === 'workflows-distribution' ? 'offer' : undefined,
            payload: undefined,
        }))
        let flagCallback: FeatureFlagsCallback | undefined
        jest.spyOn(posthog, 'onFeatureFlags').mockImplementation((callback) => {
            flagCallback = callback
            callback([], {
                'workflows-distribution': 'offer',
                'workflows-distribution-sdk-wizard': true,
                'workflows-distribution-instrumentation-skill': true,
                'workflows-distribution-contextual-mcp': true,
            })
            return () => {
                flagCallback = undefined
            }
        })
        jest.spyOn(posthog, 'reloadFeatureFlags').mockImplementation(() => {
            queueMicrotask(() =>
                flagCallback?.(
                    [],
                    {
                        'workflows-distribution': 'offer',
                        'workflows-distribution-sdk-wizard': true,
                        'workflows-distribution-instrumentation-skill': true,
                        'workflows-distribution-contextual-mcp': true,
                    },
                    { errorsLoading: false }
                )
            )
        })
        distribution = workflowDistributionLogic()
        distribution.mount()
        teamLogic.actions.loadCurrentTeamSuccess({ ...MOCK_DEFAULT_TEAM, uuid: reference.projectUuid })
    })

    afterEach(() => {
        window.history.replaceState({}, '', '/')
        jest.restoreAllMocks()
        for (const [method, descriptor] of sdkDescriptors) {
            Object.defineProperty(posthog, method, descriptor)
        }
    })

    it.each(['sdk-wizard', 'instrumentation-skill', 'contextual-mcp'])(
        'opens %s inactive without writes and associates only the explicit successful response as a candidate',
        async (placementId) => {
            followLink({ ...reference, placementId })
            const editor = workflowLogic({ id: 'new' })
            editor.mount()
            await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
            expect(requests).toHaveLength(0)
            expect(editor.values.workflow.status).toBe('draft')
            expect(posthog.capture).toHaveBeenCalledWith(
                'workflow distribution editor arrived',
                expect.objectContaining({
                    placement_id: placementId,
                    association_status: 'candidate',
                    source_eligibility_required: true,
                })
            )
            expect(window.location.hash).toBe('#tab=workflow')
            await expectLogic(editor, () => editor.actions.saveWorkflow(editor.values.workflow)).toDispatchActions([
                'saveWorkflowSuccess',
            ])
            expect(requests).toHaveLength(1)
            expect(posthog.capture).toHaveBeenCalledWith(
                'workflow distribution draft created',
                expect.objectContaining({
                    workflow_id: returnedId,
                    association_status: 'candidate',
                })
            )
            expect(
                jest.mocked(posthog.capture).mock.calls.filter(([event]) => event.startsWith('workflow distribution'))
            ).toHaveLength(2)
        }
    )
    it.each([
        ['array', []],
        ['null', null],
        ['supplied arm', { ...reference, arm: 'offer' }],
        ['supplied eligibility', { ...reference, eligible: true }],
        ['supplied context key', { ...reference, contextKey: 'example-key' }],
        ['arbitrary event', { ...reference, trigger: { event: 'example_event' } }],
        ['wrong wave', { ...reference, waveId: 'example-wave' }],
        ['web placement', { ...reference, placementId: 'selected-event' }],
        ['invalid UUID', { ...reference, projectUuid: 'example-project' }],
        ['another UUID', { ...reference, projectUuid: 'da653159-53c9-4781-9c05-0555ad1bc476' }],
        ['string ID', { ...reference, projectId: String(reference.projectId) }],
        ['zero ID', { ...reference, projectId: 0 }],
        ['unsafe ID', { ...reference, projectId: Number.MAX_SAFE_INTEGER + 1 }],
        ['wrong numeric ID', { ...reference, projectId: reference.projectId + 1 }],
        ['future time', { ...reference, eligibleAt: Date.now() + 3600000 }],
        ['stale time', { ...reference, eligibleAt: Date.now() - 15 * 24 * 60 * 60 * 1000 }],
        ['string time', { ...reference, eligibleAt: 'example-time' }],
        ['empty identity', { ...reference, sourceActionId: '' }],
        ['long identity', { ...reference, sourceActionId: 'x'.repeat(129) }],
        ['control character', { ...reference, sourceActionId: 'example\nreference' }],
        ['decoded limit', { ...reference, sourceActionId: 'x'.repeat(2100) }],
        ['encoded limit', { ...reference, sourceActionId: '雪'.repeat(700) }],
    ])('keeps ordinary inactive editing without association for %s', async (_reason, payload) => {
        followLink(payload)
        const editor = workflowLogic({ id: 'new' })
        editor.mount()
        await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
        expect(requests).toHaveLength(0)
        expect(editor.values.workflow.status).toBe('draft')
        expect(window.location.hash).toBe('#tab=workflow')
        expect(posthog.capture).not.toHaveBeenCalledWith(
            expect.stringMatching(/^workflow distribution/),
            expect.anything()
        )
    })

    it.each(['malformed', 'duplicate', 'competing', 'template', 'edit-template', 'trigger'])(
        'does not import a %s invocation',
        async (kind) => {
            const query =
                kind === 'competing'
                    ? 'mode=editor&distributionContext=example-web-key'
                    : kind === 'template'
                      ? 'mode=editor&templateId=example-template'
                      : kind === 'edit-template'
                        ? 'mode=editor&editTemplateId=example-template'
                        : kind === 'trigger'
                          ? 'mode=editor&trigger=%7B%7D'
                          : 'mode=editor'
            followLink(reference, query)
            if (kind === 'malformed') {
                window.history.replaceState(
                    {},
                    '',
                    window.location.pathname + '?mode=editor#distributionContext=%zz&tab=workflow'
                )
            } else if (kind === 'duplicate') {
                window.history.replaceState({}, '', window.location.href + '&distributionContext=%7B%7D')
            }
            const editor = workflowLogic({ id: 'new' })
            editor.mount()
            await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
            expect(requests).toHaveLength(0)
            expect(window.location.hash).toBe('#tab=workflow')
            expect(posthog.capture).not.toHaveBeenCalledWith(
                expect.stringMatching(/^workflow distribution/),
                expect.anything()
            )
        }
    )

    it.each([
        'control',
        'off',
        'missing',
        'overridden',
        'payload override',
        'denied',
        'wrong group',
        'failed',
        'bootstrap',
    ])('opens without promotional association when assignment is %s', async (reason) => {
        if (reason === 'denied') {
            window.POSTHOG_APP_CONTEXT!.resource_access_control.hog_flow = AccessControlLevel.Viewer
        } else if (reason === 'wrong group') {
            jest.mocked(posthog.getGroups).mockReturnValue({ project: 'da653159-53c9-4781-9c05-0555ad1bc476' })
        } else if (reason === 'overridden' || reason === 'payload override') {
            jest.mocked(posthog.get_property).mockImplementation((key) =>
                key === (reason === 'overridden' ? '$override_feature_flags' : '$override_feature_flag_payloads')
                    ? { 'workflows-distribution': 'offer' }
                    : undefined
            )
        } else if (reason === 'failed' || reason === 'bootstrap') {
            jest.mocked(posthog.reloadFeatureFlags).mockImplementation(() => {})
        } else {
            jest.mocked(posthog.getFeatureFlagResult).mockImplementation((key) =>
                reason === 'missing'
                    ? undefined
                    : {
                          key,
                          enabled: reason !== 'off',
                          variant: key === 'workflows-distribution' ? 'control' : undefined,
                          payload: undefined,
                      }
            )
        }
        followLink()
        const editor = workflowLogic({ id: 'new' })
        editor.mount()
        await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
        expect(requests).toHaveLength(0)
        expect(editor.values.workflow.status).toBe('draft')
        expect(posthog.capture).not.toHaveBeenCalledWith(
            expect.stringMatching(/^workflow distribution/),
            expect.anything()
        )
    })

    it('waits for current project resolution without admitting a bootstrap-only arrival', async () => {
        followLink()
        teamLogic.actions.loadCurrentTeamSuccess(null)
        const editor = workflowLogic({ id: 'new' })
        editor.mount()
        await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
        expect(posthog.capture).not.toHaveBeenCalledWith('workflow distribution editor arrived', expect.anything())
        await expectLogic(distribution, () =>
            teamLogic.actions.loadCurrentTeamSuccess({ ...MOCK_DEFAULT_TEAM, uuid: reference.projectUuid })
        ).toDispatchActions(['setEditorContext'])
        expect(posthog.capture).toHaveBeenCalledWith(
            'workflow distribution editor arrived',
            expect.objectContaining({ association_status: 'candidate' })
        )
    })

    it('loses association when an equal-value override is applied before save', async () => {
        followLink()
        const editor = workflowLogic({ id: 'new' })
        editor.mount()
        await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
        jest.mocked(posthog.get_property).mockImplementation((key) =>
            key === '$override_feature_flags' ? { 'workflows-distribution': 'offer' } : undefined
        )
        await expectLogic(editor, () => editor.actions.saveWorkflow(editor.values.workflow)).toDispatchActions([
            'saveWorkflowSuccess',
        ])
        expect(requests).toHaveLength(1)
        expect(posthog.capture).not.toHaveBeenCalledWith('workflow distribution draft created', expect.anything())
    })

    it('consumes arrival across remount and replay while preserving explicit creation', async () => {
        followLink({ ...reference, sourceActionId: 'example-setup%25-雪' })
        const editor = workflowLogic({ id: 'new' })
        editor.mount()
        await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
        await expectLogic(editor, () => editor.actions.saveWorkflow(editor.values.workflow)).toDispatchActions([
            'saveWorkflowSuccess',
        ])
        editor.unmount()
        followLink({ ...reference, sourceActionId: 'example-setup%25-雪' })
        const nextEditor = workflowLogic({ id: 'new' })
        nextEditor.mount()
        await expectLogic(nextEditor).toDispatchActions(['loadWorkflowSuccess'])
        await expectLogic(nextEditor, () =>
            nextEditor.actions.saveWorkflow(nextEditor.values.workflow)
        ).toDispatchActions(['saveWorkflowSuccess'])
        expect(requests).toHaveLength(2)
        expect(
            jest
                .mocked(posthog.capture)
                .mock.calls.filter(([event]) => event === 'workflow distribution editor arrived')
        ).toHaveLength(1)
        expect(
            jest.mocked(posthog.capture).mock.calls.filter(([event]) => event === 'workflow distribution draft created')
        ).toHaveLength(1)
    })

    it('keeps explicit creation without credit when the reference expires during editing', async () => {
        followLink({ ...reference, eligibleAt: Date.now() - 14 * 24 * 60 * 60 * 1000 + 60000 })
        const editor = workflowLogic({ id: 'new' })
        editor.mount()
        await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
        const now = Date.now()
        jest.spyOn(Date, 'now').mockReturnValue(now + 120000)
        await expectLogic(editor, () => editor.actions.saveWorkflow(editor.values.workflow)).toDispatchActions([
            'saveWorkflowSuccess',
        ])
        expect(requests).toHaveLength(1)
        expect(posthog.capture).not.toHaveBeenCalledWith('workflow distribution draft created', expect.anything())
    })

    it('keeps the association while the user selects and configures an editor step', async () => {
        followLink()
        const editor = workflowLogic({ id: 'new' })
        editor.mount()
        await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
        router.actions.replace(`/project/${reference.projectId}/workflows/new/workflow?mode=editor&node=trigger_node`)
        await expectLogic(editor, () => editor.actions.saveWorkflow(editor.values.workflow)).toDispatchActions([
            'saveWorkflowSuccess',
        ])
        expect(posthog.capture).toHaveBeenCalledWith(
            'workflow distribution draft created',
            expect.objectContaining({ workflow_id: returnedId })
        )
    })

    it('consumes an uncertain create and gives a manual retry no credit', async () => {
        useMocks({ post: { '/api/environments/:team_id/hog_flows/': () => [502] } })
        followLink()
        const editor = workflowLogic({ id: 'new' })
        editor.mount()
        await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
        await expectLogic(editor, () => editor.actions.saveWorkflow(editor.values.workflow)).toDispatchActions([
            'saveWorkflowFailure',
        ])
        expect(posthog.capture).not.toHaveBeenCalledWith('workflow distribution draft created', expect.anything())
        useMocks({
            post: { '/api/environments/:team_id/hog_flows/': () => [201, { ...NEW_WORKFLOW, id: returnedId }] },
        })
        await expectLogic(editor, () => editor.actions.saveWorkflow(editor.values.workflow)).toDispatchActions([
            'saveWorkflowSuccess',
        ])
        expect(posthog.capture).not.toHaveBeenCalledWith('workflow distribution draft created', expect.anything())
    })

    it('does not revive a late successful create after switching away and back', async () => {
        let release: (() => void) | undefined
        let started: (() => void) | undefined
        const requestStarted = new Promise<void>((resolve) => {
            started = resolve
        })
        useMocks({
            post: {
                '/api/environments/:team_id/hog_flows/': async () => {
                    await new Promise<void>((resolve) => {
                        release = resolve
                        started?.()
                    })
                    return [201, { ...NEW_WORKFLOW, id: returnedId }]
                },
            },
        })
        followLink()
        const editor = workflowLogic({ id: 'new' })
        editor.mount()
        await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
        editor.actions.saveWorkflow(editor.values.workflow)
        await expectLogic(distribution).toDispatchActions(['createStarted'])
        await requestStarted
        teamLogic.actions.loadCurrentTeamSuccess({
            ...MOCK_DEFAULT_TEAM,
            id: 998,
            uuid: 'da653159-53c9-4781-9c05-0555ad1bc476',
        })
        teamLogic.actions.loadCurrentTeamSuccess({ ...MOCK_DEFAULT_TEAM, uuid: reference.projectUuid })
        release?.()
        await expectLogic(editor).toDispatchActions(['saveWorkflowSuccess'])
        expect(posthog.capture).not.toHaveBeenCalledWith('workflow distribution draft created', expect.anything())
    })

    it('uses a fresh installed SDK response for the matching project instead of its bootstrap offer', async () => {
        let installedSdk!: typeof posthog
        jest.isolateModules(() => {
            installedSdk = jest.requireActual<typeof import('posthog-js')>('posthog-js').default
        })
        const sdk = installedSdk.init(
            'phc_example_flags',
            {
                api_host: window.location.origin,
                api_transport: 'fetch',
                persistence: 'memory',
                autocapture: false,
                advanced_disable_flags: false,
                advanced_disable_feature_flags_on_first_load: true,
                capture_pageview: false,
                capture_pageleave: false,
                disable_session_recording: true,
                disable_surveys: true,
                request_batching: false,
                bootstrap: {
                    distinctID: 'example-browser',
                    featureFlags: {
                        'workflows-distribution': 'offer',
                        'workflows-distribution-sdk-wizard': true,
                        'workflows-distribution-instrumentation-skill': true,
                        'workflows-distribution-contextual-mcp': true,
                    },
                },
            },
            'external-receiver-proof'
        )!
        sdk.group('project', reference.projectUuid)
        const flagRequests: unknown[] = []
        useMocks({
            post: {
                '/flags/': async ({ request }) => {
                    flagRequests.push(JSON.parse(gunzipSync(Buffer.from(await request.arrayBuffer())).toString('utf8')))
                    return [
                        200,
                        {
                            featureFlags: {
                                'workflows-distribution': 'offer',
                                'workflows-distribution-sdk-wizard': true,
                                'workflows-distribution-instrumentation-skill': true,
                                'workflows-distribution-contextual-mcp': true,
                            },
                        },
                    ]
                },
            },
        })
        for (const method of [
            'onFeatureFlags',
            'reloadFeatureFlags',
            'getFeatureFlagResult',
            'getGroups',
            'get_property',
            'get_distinct_id',
        ] as const) {
            Object.defineProperty(posthog, method, { value: sdk[method].bind(sdk), configurable: true })
        }
        followLink()
        const editor = workflowLogic({ id: 'new' })
        editor.mount()
        await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
        expect(posthog.capture).not.toHaveBeenCalledWith('workflow distribution editor arrived', expect.anything())
        await expectLogic(distribution).toDispatchActions(['setEditorContext'])
        expect(flagRequests).toEqual([expect.objectContaining({ groups: { project: reference.projectUuid } })])
        expect(posthog.capture).toHaveBeenCalledWith(
            'workflow distribution editor arrived',
            expect.objectContaining({
                association_status: 'candidate',
                project_uuid: reference.projectUuid,
            })
        )
        sdk.opt_out_capturing()
    })
})
