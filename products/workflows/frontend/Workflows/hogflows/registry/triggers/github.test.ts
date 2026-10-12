import './github'

import { PropertyOperator } from '~/types'

import { GithubActorMode, decodeGithubFilters, encodeGithubFilters } from './githubTriggerFilters'
import { getRegisteredTriggerTypes } from './triggerTypeRegistry'

describe('github event trigger', () => {
    const getTriggerType = (): ReturnType<typeof getRegisteredTriggerTypes>[number] => {
        const triggerType = getRegisteredTriggerTypes().find((t) => t.value === 'github-event')
        if (!triggerType) {
            throw new Error('GitHub event trigger type not registered')
        }
        return triggerType
    }

    describe('filters round-trip', () => {
        const ISSUE_EVENTS = ['issues', 'issue_comment']

        it.each<{ name: string; mode: GithubActorMode; logins: string[]; eventTypes: string[]; onlyFailures: boolean }>(
            [
                {
                    name: 'write access',
                    mode: 'write_access',
                    logins: [],
                    eventTypes: ISSUE_EVENTS,
                    onlyFailures: false,
                },
                { name: 'anyone', mode: 'anyone', logins: [], eventTypes: ISSUE_EVENTS, onlyFailures: false },
                {
                    name: 'anyone except bots',
                    mode: 'people',
                    logins: [],
                    eventTypes: ISSUE_EVENTS,
                    onlyFailures: false,
                },
                {
                    name: 'specific people',
                    mode: 'specific_people',
                    logins: ['octocat'],
                    eventTypes: ISSUE_EVENTS,
                    onlyFailures: false,
                },
                {
                    name: 'all CI results',
                    mode: 'write_access',
                    logins: [],
                    eventTypes: ['check_suite'],
                    onlyFailures: false,
                },
                {
                    name: 'CI failures only',
                    mode: 'write_access',
                    logins: [],
                    eventTypes: ['check_suite'],
                    onlyFailures: true,
                },
            ]
        )('survives a save and reload for $name', ({ mode, logins, eventTypes, onlyFailures }) => {
            // The editor reads its controls back out of the stored filters, so a mode that encodes
            // to something decode can't recognize silently resets the control on reopen.
            const filters = {
                repository: 'PostHog/posthog',
                eventTypes,
                actorMode: mode,
                actorLogins: logins,
                onlyFailures,
                additional: [],
            }
            expect(decodeGithubFilters(encodeGithubFilters(filters))).toEqual(filters)
        })

        it.each([
            {
                name: 'a title match',
                eventTypes: ['issues'],
                custom: { key: 'title', value: ['fire'], operator: PropertyOperator.IContains, type: 'event' },
            },
            {
                // Written through the API, this is not what "Only failures" writes, so the checkbox must
                // not claim it and overwrite it on the next save.
                name: 'a conclusion other than failures',
                eventTypes: ['check_suite'],
                custom: { key: 'conclusion', value: ['success'], operator: PropertyOperator.Exact, type: 'event' },
            },
            {
                name: 'failing conclusions on a person property',
                eventTypes: ['check_suite'],
                custom: {
                    key: 'conclusion',
                    value: ['failure', 'timed_out', 'action_required'],
                    operator: PropertyOperator.Exact,
                    type: 'person',
                },
            },
        ])('keeps $name, which the native controls do not own', ({ eventTypes, custom }) => {
            const encoded = encodeGithubFilters({
                repository: 'PostHog/posthog',
                eventTypes,
                actorMode: 'write_access',
                actorLogins: [],
                onlyFailures: false,
                additional: [custom],
            })

            expect(encoded).toContainEqual(custom)
            expect(decodeGithubFilters(encoded).additional).toEqual([custom])
        })

        it('excludes bots on the nullable login, not a boolean', () => {
            // A boolean property compared against a filter's string value never matches, so the
            // editor writes this against bot_sender instead.
            const encoded = encodeGithubFilters({
                repository: null,
                eventTypes: [],
                actorMode: 'people',
                actorLogins: [],
                onlyFailures: false,
                additional: [],
            })
            expect(encoded).toContainEqual(
                expect.objectContaining({ key: 'bot_sender', operator: PropertyOperator.IsNotSet })
            )
        })

        it('keeps specific people selected before any login is typed', () => {
            // The control re-derives from the stored filters on every render, so a mode that
            // encodes to nothing snaps straight back the moment you pick it.
            const encoded = encodeGithubFilters({
                repository: null,
                eventTypes: [],
                actorMode: 'specific_people',
                actorLogins: [],
                onlyFailures: false,
                additional: [],
            })
            expect(decodeGithubFilters(encoded).actorMode).toBe('specific_people')
        })
    })

    describe('registry entry', () => {
        it.each([
            { name: 'no repository', properties: [], valid: false },
            {
                name: 'repository but no event types',
                properties: [{ key: 'repository', value: ['PostHog/posthog'] }],
                valid: false,
            },
            {
                name: 'repository and event types',
                properties: [
                    { key: 'repository', value: ['PostHog/posthog'] },
                    { key: 'event_type', value: ['issues'] },
                ],
                valid: true,
            },
            {
                name: 'only CI failures',
                properties: [
                    { key: 'repository', value: ['PostHog/posthog'] },
                    { key: 'event_type', value: ['check_suite'] },
                    {
                        key: 'conclusion',
                        value: ['failure', 'timed_out', 'action_required'],
                        operator: 'exact',
                        type: 'event',
                    },
                ],
                valid: true,
            },
            {
                // Issues carry no conclusion, so the failures filter would stop them ever starting a run.
                name: 'only CI failures mixed with another event type',
                properties: [
                    { key: 'repository', value: ['PostHog/posthog'] },
                    { key: 'event_type', value: ['issues', 'check_suite'] },
                    {
                        key: 'conclusion',
                        value: ['failure', 'timed_out', 'action_required'],
                        operator: 'exact',
                        type: 'event',
                    },
                ],
                valid: false,
            },
        ])('validate returns valid=$valid for $name', ({ properties, valid }) => {
            const result = getTriggerType().validate!({
                type: 'internal-event',
                filters: {
                    source: 'internal-events',
                    events: [{ id: '$github_event_received', type: 'events' }],
                    properties,
                },
            } as any)
            expect(result?.valid).toBe(valid)
        })

        it('validate returns null for a non github-event config', () => {
            expect(getTriggerType().validate!({ type: 'event', filters: {} } as any)).toBeNull()
        })

        it('is gated behind the github-workflow-triggers feature flag', () => {
            expect(getTriggerType().featureFlag).toBe('github-workflow-triggers')
        })

        it('defaults to write access, so a drive-by comment cannot start a run', () => {
            expect(decodeGithubFilters(getTriggerType().buildConfig().filters.properties).actorMode).toBe(
                'write_access'
            )
        })
    })
})
