import { MOCK_DEFAULT_TEAM } from 'lib/api.mock'

import '@testing-library/jest-dom'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'kea'
import { router } from 'kea-router'
import { expectLogic } from 'kea-test-utils'
import posthog from 'posthog-js'

import { teamLogic } from 'scenes/teamLogic'
import { urls } from 'scenes/urls'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'
import { AccessControlLevel, AccessControlResourceType } from '~/types'

import { NEW_WORKFLOW, workflowLogic } from 'products/workflows/frontend/Workflows/workflowLogic'

import { DefinitionView } from './DefinitionView'

Object.defineProperty(posthog, 'getGroups', { value: jest.fn(), configurable: true })

describe('selected event view to inactive editor to observed save', () => {
    let creates: number
    const event = {
        id: '71cf35ca-aade-40d8-86ef-7f084f2307df',
        name: ' Signup / Café & ?#% + 空 ',
        description: 'An observed event with no specified automation purpose.',
        hidden: false,
        verified: false,
        last_seen_at: '2026-01-01T00:00:00Z',
    }

    beforeEach(() => {
        localStorage.clear()
        creates = 0
        useMocks({
            get: {
                '/api/projects/:team/event_definitions/:id/': event,
                '/api/projects/:team/event_definitions/:id/metrics/': {},
                '/api/projects/:team/object_media_previews/': { results: [] },
                '/api/projects/:team/hog_function_templates/': { results: [], count: 0 },
                '/api/projects/:team/events/': { results: [{ properties: {} }] },
            },
            post: {
                '/api/environments/:team/hog_flows/': async ({ request }) => {
                    creates += 1
                    return [
                        201,
                        {
                            ...NEW_WORKFLOW,
                            ...((await request.json()) as Record<string, unknown>),
                            id: 'fb5ab377-9935-445f-9670-4c13d50cc001',
                        },
                    ]
                },
            },
        })
        initKeaTests()
        window.POSTHOG_APP_CONTEXT!.resource_access_control = Object.fromEntries(
            Object.values(AccessControlResourceType).map((resource) => [resource, AccessControlLevel.Editor])
        ) as Record<AccessControlResourceType, AccessControlLevel>
        jest.mocked(posthog.get_property).mockReset()
        jest.spyOn(posthog, 'getGroups').mockReturnValue({ project: MOCK_DEFAULT_TEAM.uuid })
        jest.spyOn(posthog, 'getFeatureFlagResult').mockImplementation((key) => ({
            key,
            enabled: true,
            variant: key === 'workflows-distribution' ? 'offer' : undefined,
            payload: undefined,
        }))
        jest.spyOn(posthog, 'capture').mockClear()
        router.actions.push(urls.eventDefinition(event.id))
    })

    afterEach(() => {
        cleanup()
        jest.restoreAllMocks()
    })

    it.each([
        'unseen',
        'hidden',
        'unknown visibility',
        'property',
        'missing',
        'unknown access',
        'viewer',
        'empty name',
        'oversized name',
    ])('does not promote an unsupported source: %s', async (reason) => {
        if (reason === 'unknown access' || reason === 'viewer') {
            window.POSTHOG_APP_CONTEXT!.resource_access_control.hog_flow =
                reason === 'viewer' ? AccessControlLevel.Viewer : undefined!
        }
        const definition = {
            ...event,
            ...(reason === 'unseen' ? { last_seen_at: null } : {}),
            ...(reason === 'hidden' ? { hidden: true } : {}),
            ...(reason === 'unknown visibility' ? { hidden: undefined } : {}),
            ...(reason === 'empty name' ? { name: '' } : {}),
            ...(reason === 'oversized name' ? { name: 'x'.repeat(401) } : {}),
        }
        useMocks({
            get: {
                '/api/projects/:team/event_definitions/:id/': reason === 'missing' ? [404, {}] : definition,
                '/api/projects/:team/property_definitions/:id/': definition,
            },
        })
        if (reason === 'property') {
            router.actions.push(urls.propertyDefinition(event.id))
        }
        render(
            <Provider>
                <DefinitionView id={event.id} />
            </Provider>
        )
        expect(screen.queryByRole('button', { name: 'Automate this event' })).not.toBeInTheDocument()
        await waitFor(() =>
            expect(
                document.querySelector('[data-attr="definition-description-view"]') ||
                    screen.queryByText('Event not found')
            ).toBeTruthy()
        )
        expect(screen.queryByRole('button', { name: 'Automate this event' })).not.toBeInTheDocument()
        expect(
            jest.mocked(posthog.capture).mock.calls.filter(([name]) => name.startsWith('workflow distribution'))
        ).toEqual([])
        expect(creates).toBe(0)
    })

    it.each(['control', 'off', 'unavailable', 'overridden'])(
        'records zero-click eligibility only for enrolled controls: %s',
        async (state) => {
            jest.mocked(posthog.getFeatureFlagResult).mockImplementation((key) =>
                state === 'unavailable'
                    ? undefined
                    : {
                          key,
                          enabled: state !== 'off',
                          variant: key === 'workflows-distribution' ? 'control' : undefined,
                          payload: undefined,
                      }
            )
            if (state === 'overridden') {
                jest.mocked(posthog.get_property).mockReturnValue({ 'workflows-distribution': 'control' })
            }
            render(
                <Provider>
                    <DefinitionView id={event.id} />
                </Provider>
            )
            await screen.findByText(event.description)
            expect(screen.queryByRole('button', { name: 'Automate this event' })).not.toBeInTheDocument()
            const captures = jest
                .mocked(posthog.capture)
                .mock.calls.filter(([name]) => name.startsWith('workflow distribution'))
            if (state === 'control') {
                expect(captures).toEqual([
                    [
                        'workflow distribution eligible',
                        expect.objectContaining({
                            project_uuid: MOCK_DEFAULT_TEAM.uuid,
                            placement_id: 'selected-event',
                            arm: 'control',
                            stage: 'eligible',
                        }),
                    ],
                ])
            } else {
                expect(captures).toEqual([])
            }
        }
    )

    it('keeps dismissal after remount, but offers a renamed event as a new context', async () => {
        let view = render(
            <Provider>
                <DefinitionView id={event.id} />
            </Provider>
        )
        fireEvent.click(await screen.findByRole('button', { name: 'Dismiss automation suggestion' }))
        expect(posthog.capture).toHaveBeenCalledWith(
            'workflow distribution dismissed',
            expect.objectContaining({ placement_id: 'selected-event' })
        )
        view.unmount()
        view = render(
            <Provider>
                <DefinitionView id={event.id} />
            </Provider>
        )
        await screen.findByText(event.description)
        expect(screen.queryByRole('button', { name: 'Automate this event' })).not.toBeInTheDocument()
        view.unmount()
        useMocks({ get: { '/api/projects/:team/event_definitions/:id/': { ...event, name: 'Workspace joined' } } })
        render(
            <Provider>
                <DefinitionView id={event.id} />
            </Provider>
        )
        expect(await screen.findByRole('button', { name: 'Automate this event' })).toBeInTheDocument()
    })

    it.each(['source', 'project', 'access'])('rejects a stale click after the %s changes', async (context) => {
        render(
            <Provider>
                <DefinitionView id={event.id} />
            </Provider>
        )
        const button = await screen.findByRole('button', { name: 'Automate this event' })
        act(() => {
            if (context === 'source') {
                router.actions.push(urls.eventDefinition('another-event'))
            } else if (context === 'project') {
                teamLogic.actions.loadCurrentTeamSuccess({ ...MOCK_DEFAULT_TEAM, uuid: 'another-project' })
            } else {
                window.POSTHOG_APP_CONTEXT!.resource_access_control.hog_flow = AccessControlLevel.Viewer
            }
            fireEvent.click(button)
        })
        expect(router.values.location.pathname).not.toContain('/workflows/')
        expect(creates).toBe(0)
        expect(posthog.capture).not.toHaveBeenCalledWith('workflow distribution clicked', expect.anything())
    })

    it('opens the exact observed event without choosing a purpose or creating, then credits only the saved ID', async () => {
        const view = render(
            <Provider>
                <DefinitionView id={event.id} />
            </Provider>
        )
        const button = await screen.findByRole('button', { name: 'Automate this event' })
        act(() => {
            fireEvent.click(button)
            fireEvent.click(button)
        })
        expect(
            jest.mocked(posthog.capture).mock.calls.filter(([name]) => name === 'workflow distribution clicked')
        ).toHaveLength(1)
        expect(router.values.location.pathname).toContain('/workflows/new/workflow')
        expect(router.values.searchParams.templateId).toBeUndefined()
        view.unmount()
        const editor = workflowLogic({
            id: 'new',
            triggerPrefill: router.values.searchParams.trigger as string,
            distributionContextKey: router.values.searchParams.distributionContext as string,
        })
        editor.mount()
        await expectLogic(editor).toDispatchActions(['loadWorkflowSuccess'])
        expect(editor.values.workflow.status).toBe('draft')
        expect(editor.values.workflow.actions.map((action) => action.type)).toEqual(['trigger', 'exit'])
        expect(editor.values.workflow.actions[0].config).toEqual({
            type: 'event',
            filters: { events: [{ id: event.name, name: event.name, type: 'events' }] },
        })
        expect(creates).toBe(0)
        editor.actions.setWorkflowValue('name', 'Observed event follow-up')
        await expectLogic(editor, () => editor.actions.saveWorkflow(editor.values.workflow)).toDispatchActions([
            'saveWorkflowSuccess',
        ])
        expect(creates).toBe(1)
        for (const stage of ['eligible', 'offer shown', 'clicked', 'editor arrived', 'draft created']) {
            expect(posthog.capture).toHaveBeenCalledWith(
                `workflow distribution ${stage}`,
                expect.objectContaining({ project_uuid: MOCK_DEFAULT_TEAM.uuid, placement_id: 'selected-event', stage })
            )
        }
        expect(posthog.capture).toHaveBeenCalledWith(
            'workflow distribution draft created',
            expect.objectContaining({ workflow_id: 'fb5ab377-9935-445f-9670-4c13d50cc001' })
        )
        expect(
            JSON.stringify(
                jest.mocked(posthog.capture).mock.calls.filter(([name]) => name.startsWith('workflow distribution'))
            )
        ).not.toContain(event.name)
        editor.unmount()
        act(() => router.actions.push(urls.eventDefinition(event.id)))
        render(
            <Provider>
                <DefinitionView id={event.id} />
            </Provider>
        )
        await waitFor(() => expect(screen.getByText(event.description)).toBeInTheDocument())
        expect(screen.queryByRole('button', { name: 'Automate this event' })).not.toBeInTheDocument()
    })
})
