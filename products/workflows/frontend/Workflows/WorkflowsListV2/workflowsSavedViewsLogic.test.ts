import { MOCK_DEFAULT_USER } from 'lib/api.mock'

import { router } from 'kea-router'
import { expectLogic } from 'kea-test-utils'

import { FEATURE_FLAGS } from 'lib/constants'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'
import { teamLogic } from 'scenes/teamLogic'
import { urls } from 'scenes/urls'
import { userLogic } from 'scenes/userLogic'

import { projectTreeDataLogic } from '~/layout/panel-layout/ProjectTree/projectTreeDataLogic'
import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'
import { AccessControlLevel } from '~/types'

import type { WorkflowViewApi, WorkflowViewCreateApi } from '../../generated/api.schemas'
import { createFacetCounter } from './FacetSearchBar/facetQuery'
import { FIXTURE_METRICS, FIXTURE_USERS, FIXTURE_WORKFLOWS, paginated } from './workflowsListV2Fixtures'
import { workflowsListV2Logic } from './workflowsListV2Logic'
import { workflowsSavedViewsLogic } from './workflowsSavedViewsLogic'

const VIEW_ID = '00000000-0000-4000-8000-000000000001'
const savedView: WorkflowViewApi = {
    id: VIEW_ID,
    name: 'Active flows',
    state: {
        filters: [{ facet: 'status', value: 'active', negated: false }],
        text: '',
        columns: ['health'],
    },
    version: 1,
    default_key: null,
    deleted: false,
    created_at: '2026-10-07T00:00:00Z',
    updated_at: '2026-10-07T00:00:00Z',
}

const myWorkflows: WorkflowViewApi = {
    ...savedView,
    id: '00000000-0000-4000-8000-000000000002',
    name: 'My workflows',
    default_key: 'my-workflows',
    state: { filters: [{ facet: 'created-by', value: 'me', negated: false }], text: '', columns: ['owner'] },
}

describe('workflowsSavedViewsLogic', () => {
    let logic: ReturnType<typeof workflowsSavedViewsLogic.build>
    let requests: string[]
    let storedViews: WorkflowViewApi[]
    let writes: unknown[]

    beforeEach(() => {
        localStorage.clear()
        requests = []
        storedViews = [savedView]
        writes = []
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flows/summaries/': ({ request }) => [
                    200,
                    paginated(new URL(request.url).searchParams.has('search') ? [] : FIXTURE_WORKFLOWS),
                ],
                '/api/projects/:team_id/hog_flows/metrics/global/': () => [200, FIXTURE_METRICS],
                '/api/projects/:team_id/workflow_views/': ({ request }) => {
                    requests.push(request.url)
                    return [200, paginated(storedViews)]
                },
            },
            post: {
                '/api/projects/:team_id/workflow_views/initialize/': () => [200, myWorkflows],
                '/api/projects/:team_id/workflow_views/': async ({ request }) => {
                    const body = (await request.json()) as WorkflowViewCreateApi
                    writes.push(body)
                    const view = { ...savedView, ...body, id: '00000000-0000-4000-8000-000000000003' }
                    storedViews.push(view)
                    return [201, view]
                },
            },
        })
        initKeaTests()
        window.POSTHOG_APP_CONTEXT = {
            ...window.POSTHOG_APP_CONTEXT!,
            resource_access_control: {
                ...window.POSTHOG_APP_CONTEXT!.resource_access_control!,
                hog_flow: AccessControlLevel.Editor,
            },
        }
        featureFlagLogic.actions.setFeatureFlags([], {
            [FEATURE_FLAGS.WORKFLOWS_LIST_V2]: true,
            [FEATURE_FLAGS.WORKFLOWS_SAVED_VIEWS]: true,
        })
    })

    afterEach(() => logic?.unmount())

    it('withholds health view counts when run metrics are unavailable', async () => {
        useMocks({
            get: { '/api/projects/:team_id/hog_flows/metrics/global/': () => [500, { detail: 'Unavailable' }] },
        })
        router.actions.push(urls.workflows())
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        await workflowsListV2Logic.asyncActions.loadWorkflows()
        await workflowsListV2Logic.asyncActions.loadMetrics()
        expect(logic.values.viewCounts['needs-attention']).toBeUndefined()
    })

    it('opens a shared view from a view-only link after its saved state loads', async () => {
        router.actions.push(urls.workflows(), { view: VIEW_ID })
        logic = workflowsSavedViewsLogic()
        logic.mount()

        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        expect(logic.values.activeView.id).toEqual(VIEW_ID)
        expect(workflowsListV2Logic.values.value).toEqual({ filters: savedView.state.filters, text: '' })
        expect(workflowsListV2Logic.values.shownColumns).toEqual(['health'])
        expect(logic.values.isModified).toBe(false)
        expect(requests).toHaveLength(1)
    })

    it.each([
        ['both flags off', {}],
        ['saved views off', { [FEATURE_FLAGS.WORKFLOWS_LIST_V2]: true }],
        ['list prerequisite off', { [FEATURE_FLAGS.WORKFLOWS_SAVED_VIEWS]: true }],
        [
            'unexpected saved-view variant',
            { [FEATURE_FLAGS.WORKFLOWS_LIST_V2]: true, [FEATURE_FLAGS.WORKFLOWS_SAVED_VIEWS]: 'unexpected' },
        ],
    ])('preserves the baseline list without saved-view requests when %s', async (_, flags) => {
        featureFlagLogic.actions.setFeatureFlags([], flags)
        router.actions.push(urls.workflows(), { q: 'status:draft' })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        expect(logic.values.available).toBe(false)
        expect(workflowsListV2Logic.values.value.filters).toEqual([{ facet: 'status', value: 'draft', negated: false }])
        expect(requests).toEqual([])
    })

    it('loads views when the flag becomes available after the list mounted', async () => {
        featureFlagLogic.actions.setFeatureFlags([], { [FEATURE_FLAGS.WORKFLOWS_LIST_V2]: true })
        router.actions.push(urls.workflows(), { view: VIEW_ID })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])

        await expectLogic(logic, () =>
            featureFlagLogic.actions.setFeatureFlags([], {
                [FEATURE_FLAGS.WORKFLOWS_LIST_V2]: true,
                [FEATURE_FLAGS.WORKFLOWS_SAVED_VIEWS]: true,
            })
        ).toDispatchActions(['loadSavedViewsSuccess'])
        expect(logic.values.available).toBe(true)
        expect(logic.values.activeView.id).toEqual(VIEW_ID)
    })

    it('creates a shared view, reloads its saved state, and restores columns when switching views', async () => {
        router.actions.push(urls.workflows())
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        workflowsListV2Logic.actions.setValue({
            filters: [{ facet: 'status', value: 'draft', negated: false }],
            text: 'renewal',
        })
        workflowsListV2Logic.actions.setVisibleColumns(['trigger', 'owner'])

        await logic.asyncActions.saveViewAs('Draft reminders')

        expect(writes).toEqual([
            {
                name: 'Draft reminders',
                state: {
                    filters: [{ facet: 'status', value: 'draft', negated: false }],
                    text: 'renewal',
                    columns: ['trigger', 'owner'],
                },
            },
        ])
        expect(logic.values.activeView.name).toEqual('Draft reminders')
        expect(logic.values.isModified).toBe(false)
        const sharedUrl = router.values.location.search
        const createdId = logic.values.activeView.id
        logic.unmount()
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        expect(router.values.location.search).toEqual(sharedUrl)
        expect(logic.values.activeView.id).toEqual(createdId)
        expect(workflowsListV2Logic.values.value.text).toEqual('renewal')
        expect(workflowsListV2Logic.values.shownColumns).toEqual(['trigger', 'owner'])

        logic.actions.applyView(logic.values.views.find((view) => view.id === VIEW_ID)!)
        expect(workflowsListV2Logic.values.shownColumns).toEqual(['health'])
        logic.actions.applyView(logic.values.views.find((view) => view.id === createdId)!)
        expect(workflowsListV2Logic.values.shownColumns).toEqual(['trigger', 'owner'])
    })

    it('leaves a folder view count unknown until its folder is loaded', async () => {
        featureFlagLogic.actions.setFeatureFlags([], {
            [FEATURE_FLAGS.WORKFLOWS_LIST_V2]: true,
            [FEATURE_FLAGS.WORKFLOWS_SAVED_VIEWS]: true,
            [FEATURE_FLAGS.WORKFLOWS_PROJECT_FILES]: true,
        })
        storedViews = [
            {
                ...savedView,
                state: { filters: [{ facet: 'in', value: 'Campaigns', negated: false }], text: '', columns: ['owner'] },
            },
        ]
        router.actions.push(urls.workflows())
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toFinishAllListeners()
        expect(logic.values.viewCounts[VIEW_ID]).toBeUndefined()
        projectTreeDataLogic.actions.loadFolderSuccess(
            'Campaigns',
            [{ id: 'file-welcome', path: 'Campaigns/Welcome', type: 'hog_flow', ref: FIXTURE_WORKFLOWS[0].id }],
            false,
            1
        )
        expect(logic.values.viewCounts[VIEW_ID]).toBe(1)
    })

    it('leaves an inactive full-text view count unknown instead of showing an incomplete count or searching in the background', async () => {
        storedViews = [{ ...savedView, state: { filters: [], text: 'invoice', columns: ['owner'] } }]
        const searches: string[] = []
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flows/summaries/': ({ request }) => {
                    const search = new URL(request.url).searchParams.get('search')
                    if (search) {
                        searches.push(search)
                    }
                    return [200, paginated(FIXTURE_WORKFLOWS)]
                },
            },
        })
        router.actions.push(urls.workflows())
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        await expectLogic(workflowsListV2Logic, () => workflowsListV2Logic.actions.loadWorkflows()).toDispatchActions([
            'loadWorkflowsSuccess',
        ])

        expect(logic.values.viewCounts[VIEW_ID]).toBeUndefined()
        expect(logic.values.viewCounts.all).toEqual(4)
        expect(searches).toEqual([])
    })

    it('counts a full-text view only after its matching server search completes', async () => {
        storedViews = [{ ...savedView, state: { filters: [], text: 'invoice', columns: ['owner'] } }]
        let finishSearch: (() => void) | undefined
        const pendingSearch = new Promise<void>((resolve) => {
            finishSearch = resolve
        })
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flows/summaries/': async ({ request }) => {
                    if (new URL(request.url).searchParams.has('search')) {
                        await pendingSearch
                        return [200, paginated([FIXTURE_WORKFLOWS[1]])]
                    }
                    return [200, paginated(FIXTURE_WORKFLOWS)]
                },
            },
        })
        router.actions.push(urls.workflows())
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        await expectLogic(workflowsListV2Logic, () => workflowsListV2Logic.actions.loadWorkflows()).toDispatchActions([
            'loadWorkflowsSuccess',
        ])
        logic.actions.applyView(logic.values.views.find((view) => view.id === VIEW_ID)!)
        expect(logic.values.viewCounts[VIEW_ID]).toBeUndefined()
        await expectLogic(workflowsListV2Logic, () => finishSearch!()).toDispatchActions(['searchWorkflowsSuccess'])
        expect(logic.values.viewCounts[VIEW_ID]).toEqual(1)
    })

    it('keeps local changes after a concurrent update until reset accepts the latest shared version', async () => {
        let latest = savedView
        let rejectUpdate = false
        useMocks({
            get: { '/api/projects/:team_id/workflow_views/:id/': () => [200, latest] },
            patch: {
                '/api/projects/:team_id/workflow_views/:id/': async ({ request }) => {
                    const body = (await request.json()) as { version: number; state: WorkflowViewApi['state'] }
                    writes.push(body)
                    if (rejectUpdate) {
                        return [409, { detail: 'View changed' }]
                    }
                    latest = { ...latest, state: body.state, version: body.version + 1 }
                    return [200, latest]
                },
            },
        })
        router.actions.push(urls.workflows(), { view: VIEW_ID })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        workflowsListV2Logic.actions.setValue({ filters: [], text: 'local' })
        workflowsListV2Logic.actions.setVisibleColumns(['owner'])
        expect(logic.values.activeViewId).toEqual(VIEW_ID)
        expect(logic.values.isModified).toBe(true)
        logic.actions.resetView()
        expect(workflowsListV2Logic.values.value).toEqual({ filters: savedView.state.filters, text: '' })
        workflowsListV2Logic.actions.setValue({ filters: [], text: 'shared' })
        await logic.asyncActions.updateActiveView()
        expect(writes).toEqual([{ version: 1, state: { filters: [], text: 'shared', columns: ['health'] } }])
        expect(logic.values.isModified).toBe(false)

        rejectUpdate = true
        latest = {
            ...latest,
            name: 'Updated elsewhere',
            state: { filters: [], text: 'remote', columns: ['trigger'] },
            version: 3,
        }
        workflowsListV2Logic.actions.setValue({ filters: [], text: 'mine' })
        await logic.asyncActions.updateActiveView()
        expect(workflowsListV2Logic.values.value.text).toEqual('mine')
        expect(logic.values.activeView.version).toEqual(2)
        expect(logic.values.sharedSaveDisabledReason).toBeTruthy()
        await logic.asyncActions.updateActiveView()
        expect(writes).toHaveLength(2)
        await logic.asyncActions.resetView()
        expect(workflowsListV2Logic.values.value.text).toEqual('remote')
        expect(workflowsListV2Logic.values.shownColumns).toEqual(['trigger'])
        expect(logic.values.activeView.version).toEqual(3)
        expect(logic.values.sharedSaveDisabledReason).toBeUndefined()
        expect(logic.values.isModified).toBe(false)
    })

    it('allows reset to read the latest shared view after the viewer loses write permission', async () => {
        useMocks({
            patch: { '/api/projects/:team_id/workflow_views/:id/': () => [409, { detail: 'View changed' }] },
            get: {
                '/api/projects/:team_id/workflow_views/:id/': () => [200, { ...savedView, version: 2, name: 'Latest' }],
            },
        })
        router.actions.push(urls.workflows(), { view: VIEW_ID })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        workflowsListV2Logic.actions.setValue({ filters: [], text: 'mine' })
        await logic.asyncActions.updateActiveView()
        window.POSTHOG_APP_CONTEXT!.resource_access_control!.hog_flow = AccessControlLevel.Viewer
        userLogic.actions.loadUserSuccess({ ...userLogic.values.user! })
        expect(logic.values.writeDisabledReason).toBeTruthy()
        await logic.asyncActions.resetView()
        expect(logic.values.activeView.name).toEqual('Latest')
        expect(logic.values.activeView.version).toEqual(2)
        expect(logic.values.isModified).toBe(false)
    })

    it('resolves My workflows to each viewer and saves the symbolic viewer rather than their identity', async () => {
        useMocks({
            patch: {
                '/api/projects/:team_id/workflow_views/:id/': async ({ request }) => {
                    const body = (await request.json()) as { state: WorkflowViewApi['state'] }
                    writes.push(body)
                    return [200, { ...myWorkflows, state: body.state, version: 2 }]
                },
            },
        })
        userLogic.actions.loadUserSuccess({ ...MOCK_DEFAULT_USER, uuid: FIXTURE_USERS.ada.uuid })
        router.actions.push(urls.workflows(), { view: myWorkflows.id })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        await expectLogic(workflowsListV2Logic, () => workflowsListV2Logic.actions.loadWorkflows()).toDispatchActions([
            'loadWorkflowsSuccess',
        ])
        expect(workflowsListV2Logic.values.filteredRows.map((row) => row.id)).toEqual([
            'wf-welcome',
            'wf-renewal',
            'wf-old-promo',
        ])
        const countForViewer = (): ReturnType<typeof createFacetCounter> =>
            createFacetCounter(
                workflowsListV2Logic.values.rows,
                workflowsListV2Logic.values.value,
                workflowsListV2Logic.values.facets,
                workflowsListV2Logic.values.matchesText
            )
        expect(countForViewer()('status')).toEqual([
            { value: 'active', count: 1 },
            { value: 'archived', count: 1 },
            { value: 'draft', count: 1 },
        ])
        expect(countForViewer()('owner')).toEqual([
            { value: 'ada', count: 2 },
            { value: 'maya', count: 1 },
        ])
        expect(countForViewer()('created-by')).toEqual([
            { value: FIXTURE_USERS.ada.uuid, count: 3 },
            { value: FIXTURE_USERS.lin.uuid, count: 1 },
        ])
        userLogic.actions.loadUserSuccess({ ...MOCK_DEFAULT_USER, uuid: FIXTURE_USERS.lin.uuid })
        expect(workflowsListV2Logic.values.filteredRows.map((row) => row.id)).toEqual(['wf-sync'])
        expect(countForViewer()('status')).toEqual([{ value: 'draft', count: 1 }])
        workflowsListV2Logic.actions.setVisibleColumns(['trigger'])
        await logic.asyncActions.updateActiveView()
        expect(writes).toEqual([
            {
                version: 1,
                state: {
                    filters: [{ facet: 'created-by', value: 'me', negated: false }],
                    text: '',
                    columns: ['trigger'],
                },
            },
        ])
    })

    it('deletes the active shared view and navigates coherently through missing-view links and empty overrides', async () => {
        const deletedVersions: string[] = []
        useMocks({
            delete: {
                '/api/projects/:team_id/workflow_views/:id/': ({ request }) => {
                    deletedVersions.push(new URL(request.url).searchParams.get('version')!)
                    storedViews = []
                    return [204, null]
                },
            },
        })
        router.actions.push(urls.workflows(), { view: VIEW_ID })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        await logic.asyncActions.deleteView(VIEW_ID)
        expect(deletedVersions).toEqual(['1'])
        expect(logic.values.activeViewId).toEqual('all')
        expect(workflowsListV2Logic.values.value).toEqual({ filters: [], text: '' })
        router.actions.push(urls.workflows(), { view: VIEW_ID, q: 'status:draft', text: '', columns: '' })
        expect(logic.values.activeViewId).toEqual('all')
        expect(workflowsListV2Logic.values.value).toEqual({
            filters: [{ facet: 'status', value: 'draft', negated: false }],
            text: '',
        })
        expect(workflowsListV2Logic.values.shownColumns).toEqual([])
        router.actions.push(urls.workflows(), { view: VIEW_ID })
        expect(logic.values.activeViewId).toEqual('all')
        expect(workflowsListV2Logic.values.value).toEqual({ filters: [], text: '' })
        expect(new URLSearchParams(router.values.location.search).get('view')).toEqual('all')
    })

    it('keeps local empty overrides on a saved-view link after reloading', async () => {
        router.actions.push(urls.workflows(), { view: VIEW_ID, q: '', text: '', columns: '' })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        expect(logic.values.activeViewId).toEqual(VIEW_ID)
        expect(workflowsListV2Logic.values.value).toEqual({ filters: [], text: '' })
        expect(workflowsListV2Logic.values.shownColumns).toEqual([])
        expect(logic.values.isModified).toBe(true)
    })

    it('guards duplicate saves and ignores a late shared update after the feature is disabled and re-enabled', async () => {
        let release: (() => void) | undefined
        let started: (() => void) | undefined
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        const requestStarted = new Promise<void>((resolve) => {
            started = resolve
        })
        useMocks({
            patch: {
                '/api/projects/:team_id/workflow_views/:id/': async ({ request }) => {
                    writes.push(await request.json())
                    started!()
                    await pending
                    return [200, { ...savedView, version: 2, name: 'Late update' }]
                },
            },
        })
        router.actions.push(urls.workflows(), { view: VIEW_ID })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        workflowsListV2Logic.actions.setValue({ filters: [], text: 'local' })
        const save = logic.asyncActions.updateActiveView()
        await requestStarted
        expect(logic.values.saving).toBe(true)
        await logic.asyncActions.updateActiveView()
        expect(writes).toHaveLength(1)
        await expectLogic(logic, () =>
            featureFlagLogic.actions.setFeatureFlags([], { [FEATURE_FLAGS.WORKFLOWS_LIST_V2]: true })
        ).toDispatchActions(['loadSavedViewsSuccess'])
        expect(logic.values.available).toBe(false)
        await logic.asyncActions.saveViewAs('Disabled')
        expect(writes).toHaveLength(1)
        await expectLogic(logic, () =>
            featureFlagLogic.actions.setFeatureFlags([], {
                [FEATURE_FLAGS.WORKFLOWS_LIST_V2]: true,
                [FEATURE_FLAGS.WORKFLOWS_SAVED_VIEWS]: true,
            })
        ).toDispatchActions(['loadSavedViewsSuccess'])
        release!()
        await save
        expect(logic.values.activeView.name).toEqual('Active flows')
        expect(logic.values.activeView.version).toEqual(1)
        expect(logic.values.saving).toBe(false)
    })

    it('does not install a late created view in a different project', async () => {
        let release: (() => void) | undefined
        let started: (() => void) | undefined
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        const requestStarted = new Promise<void>((resolve) => {
            started = resolve
        })
        useMocks({
            get: {
                '/api/projects/:team_id/workflow_views/': ({ request }) => {
                    requests.push(request.url)
                    return [200, paginated(new URL(request.url).pathname.includes('/998/') ? [] : storedViews)]
                },
            },
            post: {
                '/api/projects/:team_id/workflow_views/': async () => {
                    started!()
                    await pending
                    return [201, { ...savedView, id: '00000000-0000-4000-8000-000000000003', name: 'Old project view' }]
                },
            },
        })
        router.actions.push(urls.workflows())
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        const save = logic.asyncActions.saveViewAs('Old project view')
        await requestStarted
        await expectLogic(logic, () =>
            teamLogic.actions.loadCurrentTeamSuccess({ ...teamLogic.values.currentTeam!, id: 998 })
        ).toDispatchActions(['loadSavedViewsSuccess'])
        release!()
        await save
        expect(logic.values.currentTeamId).toEqual(998)
        expect(logic.values.views.some((view) => view.name === 'Old project view')).toBe(false)
        expect(requests.some((url) => url.includes('/998/'))).toBe(true)
    })

    it('keeps a late conflict attached to the edited view after switching tabs', async () => {
        let release: (() => void) | undefined
        let started: (() => void) | undefined
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        const requestStarted = new Promise<void>((resolve) => {
            started = resolve
        })
        useMocks({
            patch: {
                '/api/projects/:team_id/workflow_views/:id/': async () => {
                    started!()
                    await pending
                    return [409, { detail: 'View changed' }]
                },
            },
        })
        router.actions.push(urls.workflows(), { view: VIEW_ID })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        const save = logic.asyncActions.updateActiveView()
        await requestStarted
        logic.actions.applyView(logic.values.views.find((view) => view.id === 'drafts')!)
        release!()
        await save
        expect(logic.values.activeViewId).toEqual('drafts')
        expect(logic.values.conflictedViewId).toEqual(VIEW_ID)
        expect(logic.values.sharedSaveDisabledReason).toBeUndefined()
    })

    it('restores the deletable My workflows view from its original default state after reload', async () => {
        let tombstone = myWorkflows
        let restores = 0
        useMocks({
            post: {
                '/api/projects/:team_id/workflow_views/initialize/': () => [200, tombstone],
                '/api/projects/:team_id/workflow_views/restore_default/': () => {
                    restores++
                    return [200, myWorkflows]
                },
            },
            delete: {
                '/api/projects/:team_id/workflow_views/:id/': () => {
                    tombstone = { ...myWorkflows, deleted: true, version: 2 }
                    return [204, null]
                },
            },
        })
        router.actions.push(urls.workflows(), { view: myWorkflows.id })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        await logic.asyncActions.deleteView(myWorkflows.id)
        expect(logic.values.myWorkflowsDeleted).toBe(true)
        expect(logic.values.views.some((view) => view.id === myWorkflows.id)).toBe(false)
        logic.unmount()
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        expect(logic.values.myWorkflowsDeleted).toBe(true)
        expect(logic.values.views.some((view) => view.id === myWorkflows.id)).toBe(false)
        await logic.asyncActions.restoreMyWorkflows()
        expect(restores).toEqual(1)
        expect(logic.values.myWorkflowsDeleted).toBe(false)
        expect(logic.values.views.find((view) => view.id === myWorkflows.id)?.state).toEqual(myWorkflows.state)
    })

    it('preserves the baseline query when loading the saved-view API fails', async () => {
        useMocks({ get: { '/api/projects/:team_id/workflow_views/': () => [500, { detail: 'Unavailable' }] } })
        router.actions.push(urls.workflows(), { view: VIEW_ID, q: 'status:draft', text: 'renewal' })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        expect(logic.values.available).toBe(false)
        expect(logic.values.savedViewsLoadFailed).toBe(true)
        expect(workflowsListV2Logic.values.value).toEqual({
            filters: [{ facet: 'status', value: 'draft', negated: false }],
            text: 'renewal',
        })
        useMocks({ get: { '/api/projects/:team_id/workflow_views/': () => [200, paginated([savedView])] } })
        await logic.asyncActions.loadSavedViews()
        expect(logic.values.savedViewsLoadFailed).toBe(false)
    })

    it('lets a viewer select shared views but prevents all shared writes', async () => {
        window.POSTHOG_APP_CONTEXT!.resource_access_control!.hog_flow = AccessControlLevel.Viewer
        useMocks({
            patch: {
                '/api/projects/:team_id/workflow_views/:id/': () => {
                    writes.push('patch')
                    return [200, savedView]
                },
            },
            delete: {
                '/api/projects/:team_id/workflow_views/:id/': () => {
                    writes.push('delete')
                    return [204, null]
                },
            },
            post: {
                '/api/projects/:team_id/workflow_views/restore_default/': () => {
                    writes.push('restore')
                    return [200, myWorkflows]
                },
            },
        })
        router.actions.push(urls.workflows(), { view: VIEW_ID })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        expect(logic.values.available).toBe(true)
        expect(logic.values.activeViewId).toEqual(VIEW_ID)
        expect(logic.values.writeDisabledReason).toBeTruthy()
        workflowsListV2Logic.actions.setValue({ filters: [], text: 'mine' })
        await logic.asyncActions.updateActiveView()
        await logic.asyncActions.saveViewAs('Denied')
        await logic.asyncActions.renameView(VIEW_ID, 'Denied')
        await logic.asyncActions.deleteView(VIEW_ID)
        await logic.asyncActions.restoreMyWorkflows()
        expect(writes).toEqual([])
        logic.actions.resetView()
        expect(workflowsListV2Logic.values.value).toEqual({ filters: savedView.state.filters, text: '' })
    })

    it('waits for a completed flag evaluation before exposing persisted saved-view flags', async () => {
        window.POSTHOG_APP_CONTEXT!.persisted_feature_flags = [
            FEATURE_FLAGS.WORKFLOWS_LIST_V2,
            FEATURE_FLAGS.WORKFLOWS_SAVED_VIEWS,
        ]
        initKeaTests()
        router.actions.push(urls.workflows(), { q: 'status:draft' })
        logic = workflowsSavedViewsLogic()
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadSavedViewsSuccess'])
        expect(featureFlagLogic.values.receivedFeatureFlags).toBe(false)
        expect(logic.values.available).toBe(false)
        expect(requests).toEqual([])
        expect(workflowsListV2Logic.values.value.filters).toEqual([{ facet: 'status', value: 'draft', negated: false }])
        window.POSTHOG_APP_CONTEXT!.persisted_feature_flags = []
    })
})
