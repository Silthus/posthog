import { MOCK_DEFAULT_TEAM } from 'lib/api.mock'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { router } from 'kea-router'
import { expectLogic } from 'kea-test-utils'
import posthog from 'posthog-js'

import { featureFlagLogic } from 'lib/logic/featureFlagLogic'
import { hogFunctionConfigurationLogic } from 'scenes/hog-functions/configuration/hogFunctionConfigurationLogic'
import { teamLogic } from 'scenes/teamLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'
import {
    AccessControlLevel,
    AccessControlResourceType,
    CyclotronJobFiltersType,
    HogFunctionTemplateType,
    HogFunctionType,
} from '~/types'

import { NEW_WORKFLOW, workflowLogic } from './workflowLogic'

jest.setTimeout(15000)

Object.defineProperty(posthog, 'getGroups', { value: jest.fn(), configurable: true })

const template: HogFunctionTemplateType = {
    id: 'template-sendgrid',
    type: 'destination',
    name: 'SendGrid',
    description: 'Update marketing contacts',
    code: 'return null',
    code_language: 'hog',
    free: false,
    status: 'stable',
    inputs_schema: [{ key: 'api_key', type: 'string', label: 'API key', secret: true, required: true }],
    filters: null,
}

const credential = 'fake-credential-sentinel-for-testing'
const workflowId = '875b9932-a2ae-4698-a672-1d56386c119b'

describe('provider configuration to inactive editor and saved draft', () => {
    let creates: number
    let popup: { opener: unknown; location: { replace: jest.Mock } }

    beforeEach(() => {
        localStorage.clear()
        creates = 0
        useMocks({
            get: {
                '/api/projects/:team_id/hog_function_templates/:template_id/': template,
                '/api/projects/:team_id/hog_function_templates/': { results: [], count: 0 },
            },
            post: {
                '/api/environments/:team_id/hog_flows/': () => {
                    creates++
                    return [201, { ...NEW_WORKFLOW, id: workflowId }]
                },
            },
        })
        initKeaTests()
        window.POSTHOG_APP_CONTEXT!.resource_access_control = Object.fromEntries(
            Object.values(AccessControlResourceType).map((resource) => [resource, AccessControlLevel.Editor])
        ) as Record<AccessControlResourceType, AccessControlLevel>
        jest.mocked(posthog.get_property).mockReset()
        jest.mocked(posthog.capture).mockClear()
        jest.spyOn(posthog, 'getGroups').mockReturnValue({ project: MOCK_DEFAULT_TEAM.uuid })
        jest.spyOn(posthog, 'getFeatureFlagResult').mockImplementation((key) => ({
            key,
            enabled: true,
            variant: key === 'workflows-distribution' ? 'offer' : undefined,
            payload: undefined,
        }))
        popup = { opener: window, location: { replace: jest.fn() } }
        jest.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    })

    afterEach(() => {
        cleanup()
        jest.restoreAllMocks()
    })

    it.each(['template-sendgrid', 'template-customerio'])(
        'preserves unsaved %s configuration and credits only an explicit inactive save',
        async (provider) => {
            useMocks({
                get: { '/api/projects/:team_id/hog_function_templates/:template_id/': { ...template, id: provider } },
            })
            router.actions.push(`/functions/new/${provider}`)
            const { HogFunctionConfiguration } =
                await import('scenes/hog-functions/configuration/HogFunctionConfiguration')
            render(<HogFunctionConfiguration templateId={provider} />)
            const action = await screen.findByText('Try Workflows')
            const configuration = hogFunctionConfigurationLogic({ templateId: provider })
            act(() => configuration.actions.setConfigurationValue('inputs.api_key', { value: credential }))
            const original = configuration.values.configuration
            const sourcePath = router.values.location.pathname
            fireEvent.click(action)
            expect(configuration.values.configuration).toEqual(original)
            expect(router.values.location.pathname).toBe(sourcePath)
            expect(creates).toBe(0)
            const url = new URL(popup.location.replace.mock.calls[0][0], 'http://localhost')
            expect(url.pathname).toBe(`/project/${MOCK_DEFAULT_TEAM.id}/workflows/new/workflow`)
            expect(url.searchParams.get('mode')).toBe('editor')
            expect(url.searchParams.has('trigger')).toBe(false)
            expect(JSON.stringify([url.href, localStorage, jest.mocked(posthog.capture).mock.calls])).not.toContain(
                credential
            )
            expect(posthog.capture).not.toHaveBeenCalledWith('workflow distribution editor arrived', expect.anything())
            const editor = workflowLogic({
                id: 'new',
                distributionContextKey: url.searchParams.get('distributionContext')!,
            })
            editor.mount()
            await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
            expect(editor.values.workflow.status).toBe('draft')
            expect(creates).toBe(0)
            act(() => editor.actions.setWorkflowValue('name', 'Account notification'))
            await expectLogic(editor, () => editor.actions.saveWorkflow(editor.values.workflow)).toDispatchActions([
                'saveWorkflowSuccess',
            ])
            expect(creates).toBe(1)
            expect(posthog.capture).toHaveBeenCalledWith(
                'workflow distribution draft created',
                expect.objectContaining({
                    workflow_id: workflowId,
                    project_uuid: MOCK_DEFAULT_TEAM.uuid,
                    placement_id: 'native-destination',
                })
            )
            act(() => editor.unmount())
            await waitFor(() => expect(screen.queryByText('Try Workflows')).toBeNull())
        }
    )
    it.each([
        ['bare event', { events: [{ id: 'membership_created', type: 'events' }] }, true],
        [
            'property restriction',
            {
                events: [
                    {
                        id: 'membership_created',
                        type: 'events',
                        properties: [{ key: 'plan', value: 'paid', type: 'event', operator: 'exact' }],
                    },
                ],
            },
            false,
        ],
        [
            'compound events',
            {
                events: [
                    { id: 'membership_created', type: 'events' },
                    { id: 'membership_updated', type: 'events' },
                ],
            },
            false,
        ],
        [
            'test account restriction',
            { events: [{ id: 'membership_created', type: 'events' }], filter_test_accounts: true },
            false,
        ],
        ['time restriction', { events: [{ id: 'membership_created', type: 'events', after: '-7d' }] }, false],
        ['oversized event', { events: [{ id: 'é'.repeat(257), type: 'events' }] }, false],
    ])('offers with %s and binds only a lossless starting event', async (_, filters, binds) => {
        const { HogFunctionConfiguration } = await import('scenes/hog-functions/configuration/HogFunctionConfiguration')
        render(<HogFunctionConfiguration templateId="template-sendgrid" />)
        await screen.findByText('Try Workflows')
        const configuration = hogFunctionConfigurationLogic({ templateId: 'template-sendgrid' })
        act(() => configuration.actions.setConfigurationValue('filters', filters as CyclotronJobFiltersType))
        fireEvent.click(screen.getByText('Try Workflows'))
        const url = new URL(popup.location.replace.mock.calls[0][0], 'http://localhost')
        expect(url.searchParams.has('trigger')).toBe(binds)
        if (binds) {
            expect(JSON.parse(url.searchParams.get('trigger')!)).toEqual({
                type: 'event',
                filters: { events: [{ id: 'membership_created', name: 'membership_created', type: 'events' }] },
            })
        }
        expect(configuration.values.configuration.filters).toEqual(filters)
        expect(JSON.stringify(jest.mocked(posthog.capture).mock.calls)).not.toContain('membership_created')
        expect(creates).toBe(0)
    })

    it('keeps a blocked popup retry explicit and remembers dismissal for only that provider', async () => {
        jest.mocked(window.open).mockReturnValueOnce(null)
        const { HogFunctionConfiguration } = await import('scenes/hog-functions/configuration/HogFunctionConfiguration')
        const source = render(<HogFunctionConfiguration templateId="template-sendgrid" />)
        const action = await screen.findByText('Try Workflows')
        fireEvent.click(action)
        expect(screen.getByText('Try Workflows')).toBeTruthy()
        expect(popup.location.replace).not.toHaveBeenCalled()
        expect(posthog.capture).not.toHaveBeenCalledWith('workflow distribution clicked', expect.anything())
        fireEvent.click(screen.getByText('Keep configuring SendGrid'))
        source.unmount()
        const repeated = render(<HogFunctionConfiguration templateId="template-sendgrid" />)
        await screen.findAllByText('API key')
        expect(screen.queryByText('Try Workflows')).toBeNull()
        repeated.unmount()
        useMocks({
            get: {
                '/api/projects/:team_id/hog_function_templates/:template_id/': {
                    ...template,
                    id: 'template-customerio',
                },
            },
        })
        render(<HogFunctionConfiguration templateId="template-customerio" />)
        fireEvent.click(await screen.findByText('Try Workflows'))
        expect(popup.location.replace).toHaveBeenCalledTimes(1)
        expect(creates).toBe(0)
    })

    it.each(['control', 'off', 'unknown', 'overridden', 'denied', 'wrong provider', 'wrong type', 'missing source'])(
        'does not render an offer for %s',
        async (reason) => {
            if (reason === 'control' || reason === 'off' || reason === 'unknown') {
                jest.mocked(posthog.getFeatureFlagResult).mockImplementation((key) => ({
                    key,
                    enabled: reason !== 'off',
                    variant: key === 'workflows-distribution' ? reason : undefined,
                    payload: undefined,
                }))
            } else if (reason === 'overridden') {
                jest.mocked(posthog.get_property).mockReturnValue({ 'workflows-distribution-native-destination': true })
            } else if (reason === 'denied') {
                window.POSTHOG_APP_CONTEXT!.resource_access_control.hog_flow = AccessControlLevel.Viewer
            }
            useMocks({
                get: {
                    '/api/projects/:team_id/hog_function_templates/:template_id/':
                        reason === 'missing source'
                            ? [404, {}]
                            : {
                                  ...template,
                                  id: reason === 'wrong provider' ? 'template-webhook' : template.id,
                                  type: reason === 'wrong type' ? 'site_destination' : template.type,
                              },
                },
            })
            const { HogFunctionConfiguration } =
                await import('scenes/hog-functions/configuration/HogFunctionConfiguration')
            render(<HogFunctionConfiguration templateId="template-sendgrid" />)
            if (reason === 'missing source') {
                await screen.findByText(/not found/i)
            } else {
                await screen.findAllByText('API key')
            }
            expect(screen.queryByText('Try Workflows')).toBeNull()
            const captures = jest
                .mocked(posthog.capture)
                .mock.calls.filter(([event]) => event.startsWith('workflow distribution'))
            expect(captures).toHaveLength(reason === 'control' ? 1 : 0)
            if (reason === 'control') {
                expect(posthog.capture).toHaveBeenCalledWith(
                    'workflow distribution eligible',
                    expect.objectContaining({
                        arm: 'control',
                        project_uuid: MOCK_DEFAULT_TEAM.uuid,
                        placement_id: 'native-destination',
                    })
                )
            }
            expect(creates).toBe(0)
        }
    )

    it.each([false, true])('offers existing accessible configurations but excludes deleted=%s', async (deleted) => {
        const destination: HogFunctionType = {
            ...template,
            id: 'b22f731e-0e65-4b70-a9ae-0b985971e049',
            description: 'A saved contact destination',
            status: undefined,
            hog: 'return null',
            template: { ...template },
            enabled: false,
            deleted,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            created_by: null,
        }
        useMocks({ get: { '/api/environments/:team_id/hog_functions/:id/': destination } })
        const { HogFunctionConfiguration } = await import('scenes/hog-functions/configuration/HogFunctionConfiguration')
        render(<HogFunctionConfiguration id={destination.id} />)
        await screen.findAllByText('API key')
        expect(Boolean(screen.queryByText('Try Workflows'))).toBe(!deleted)
        expect(creates).toBe(0)
    })

    it('retains the provider test and save paths after opening Workflows', async () => {
        const requests: { action: string; body: unknown }[] = []
        useMocks({
            post: {
                '/api/environments/:team_id/hog_functions/new/invocations/': async ({ request }) => {
                    requests.push({ action: 'test', body: await request.json() })
                    return [200, { result: null, logs: [], errors: [] }]
                },
                '/api/environments/:team_id/hog_functions/': async ({ request }) => {
                    const body = (await request.json()) as HogFunctionType
                    requests.push({ action: 'save', body })
                    return [
                        201,
                        {
                            ...body,
                            id: 'c297548e-c06f-48b4-b53e-247345011313',
                            template,
                            created_at: '2026-01-01T00:00:00Z',
                            updated_at: '2026-01-01T00:00:00Z',
                            created_by: null,
                        },
                    ]
                },
            },
        })
        const { HogFunctionConfiguration } = await import('scenes/hog-functions/configuration/HogFunctionConfiguration')
        render(<HogFunctionConfiguration templateId="template-sendgrid" />)
        await screen.findByText('Try Workflows')
        const configuration = hogFunctionConfigurationLogic({ templateId: 'template-sendgrid' })
        act(() => configuration.actions.setConfigurationValue('inputs.api_key', { value: credential }))
        fireEvent.click(screen.getByText('Try Workflows'))
        const { hogFunctionTestLogic } = await import('scenes/hog-functions/configuration/hogFunctionTestLogic')
        const testing = hogFunctionTestLogic({ templateId: 'template-sendgrid' })
        await expectLogic(testing, () => testing.actions.submitTestInvocation()).toDispatchActions([
            'submitTestInvocationSuccess',
        ])
        await expectLogic(configuration, () => configuration.actions.submitConfiguration()).toDispatchActions([
            'submitConfigurationSuccess',
        ])
        expect(requests.map((request) => request.action)).toEqual(['test', 'save'])
        expect(requests[1].body).toMatchObject({ inputs: { api_key: { value: credential } } })
        expect(creates).toBe(0)
    })

    it('waits for available assignment and removes the offer when its gate turns off', async () => {
        jest.mocked(posthog.getFeatureFlagResult).mockReturnValue(undefined)
        const { HogFunctionConfiguration } = await import('scenes/hog-functions/configuration/HogFunctionConfiguration')
        render(<HogFunctionConfiguration templateId="template-sendgrid" />)
        await screen.findAllByText('API key')
        expect(screen.queryByText('Try Workflows')).toBeNull()
        jest.mocked(posthog.getFeatureFlagResult).mockImplementation((key) => ({
            key,
            enabled: true,
            variant: key === 'workflows-distribution' ? 'offer' : undefined,
            payload: undefined,
        }))
        act(() => featureFlagLogic.actions.setFeatureFlags([], {}))
        await screen.findByText('Try Workflows')
        jest.mocked(posthog.getFeatureFlagResult).mockReturnValue(undefined)
        act(() => featureFlagLogic.actions.setFeatureFlags([], {}))
        expect(screen.queryByText('Try Workflows')).toBeNull()
    })
    it('does not enroll a stale source form after switching projects', async () => {
        const { HogFunctionConfiguration } = await import('scenes/hog-functions/configuration/HogFunctionConfiguration')
        render(<HogFunctionConfiguration templateId="template-sendgrid" />)
        await screen.findByText('Try Workflows')
        jest.mocked(posthog.getGroups).mockReturnValue({ project: 'other-project-uuid' })
        act(() =>
            teamLogic.actions.loadCurrentTeamSuccess({ ...MOCK_DEFAULT_TEAM, id: 998, uuid: 'other-project-uuid' })
        )
        expect(screen.queryByText('Try Workflows')).toBeNull()
        expect(posthog.capture).not.toHaveBeenCalledWith(
            'workflow distribution eligible',
            expect.objectContaining({ project_uuid: 'other-project-uuid' })
        )
    })
})
