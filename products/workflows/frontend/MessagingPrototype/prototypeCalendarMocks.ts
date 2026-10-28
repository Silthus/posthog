// PROTOTYPE, never merged: Silthus/personal#212. Invented send calendar data for the stories, around 2026-10-28.
import { toPaginatedResponse } from '~/mocks/handlers'

import type { MessageCategoryApi } from 'products/messaging/frontend/generated/api.schemas'
import type {
    HogFlowScheduleApi,
    SendCalendarBatchJobApi,
    SendCalendarFlowApi,
    UserBasicApi,
} from 'products/workflows/frontend/generated/api.schemas'

const uuid = (prefix: string, n: number): string => `0199e0aa-0000-7000-8000-${prefix}${String(n).padStart(4, '0')}`

const person = (id: number, first_name: string): UserBasicApi =>
    ({ id, uuid: uuid('00000001', id), first_name, email: `${first_name.toLowerCase()}@example.com` }) as UserBasicApi

const PRIYA = person(1, 'Priya')
const SAM = person(2, 'Sam')

const category = (n: number, name: string): MessageCategoryApi =>
    ({
        id: uuid('00000003', n),
        key: name.toLowerCase().replace(/\W+/g, '-'),
        name,
        category_type: 'marketing',
    }) as MessageCategoryApi

const PRODUCT_UPDATES = category(1, 'Product updates')
const EVENTS = category(2, 'Events')
const CATEGORIES = [PRODUCT_UPDATES, EVENTS]

const COHORTS = [
    { id: 31, name: 'All active users', count: 18450 },
    { id: 32, name: 'Webinar sign-ups', count: 312 },
    { id: 33, name: 'Trial users', count: 1204 },
].map((cohort) => ({
    ...cohort,
    is_static: false,
    is_calculating: false,
    deleted: false,
    filters: { properties: { type: 'OR', values: [] } },
    groups: [],
}))

const schedule = (n: number, rrule: string, starts_at: string): HogFlowScheduleApi => ({
    id: uuid('00000002', n),
    rrule,
    starts_at,
    timezone: 'UTC',
    status: 'active',
    next_run_at: null,
    created_at: starts_at,
    updated_at: starts_at,
})

const job = (id: string, created_at: string): SendCalendarBatchJobApi => ({ id, status: 'completed', created_at })

const flow = (
    n: number,
    name: string,
    origin_product: 'broadcasts' | null,
    created_by: UserBasicApi,
    cohortId: number,
    messageCategory: MessageCategoryApi,
    schedules: HogFlowScheduleApi[],
    batch_jobs: SendCalendarBatchJobApi[] = []
): SendCalendarFlowApi =>
    ({
        id: uuid('00000000', n),
        name,
        origin_product,
        created_by,
        user_access_level: 'editor',
        trigger_type: 'batch',
        audience_properties: [{ key: 'id', type: 'cohort', value: cohortId }],
        audience_type: null,
        email_to: null,
        message_category_id: messageCategory.id,
        schedules,
        batch_jobs,
    }) as SendCalendarFlowApi

const FLOWS: SendCalendarFlowApi[] = [
    flow(1, 'November product update', 'broadcasts', PRIYA, 31, PRODUCT_UPDATES, [
        schedule(1, 'FREQ=DAILY;COUNT=1', '2026-11-03T09:00:00Z'),
    ]),
    flow(2, 'Webinar reminder: data pipelines', 'broadcasts', SAM, 32, EVENTS, [
        schedule(2, 'FREQ=DAILY;COUNT=1', '2026-10-30T15:00:00Z'),
    ]),
    flow(
        3,
        'Weekly activation loop',
        null,
        SAM,
        33,
        PRODUCT_UPDATES,
        [schedule(3, 'FREQ=WEEKLY;BYDAY=MO', '2026-09-07T10:00:00Z')],
        [job('loop-oct-26', '2026-10-26T10:00:03Z'), job('loop-oct-19', '2026-10-19T10:00:02Z')]
    ),
    flow(
        4,
        'October product update',
        'broadcasts',
        PRIYA,
        31,
        PRODUCT_UPDATES,
        [],
        [job('october-update', '2026-10-06T09:00:04Z')]
    ),
]

/** The `get` mocks the send calendar needs. */
export const CALENDAR_MOCKS = {
    '/api/projects/:team_id/hog_flows/send_calendar/': (): [number, SendCalendarFlowApi[]] => [200, FLOWS],
    '/api/projects/:team_id/cohorts/': toPaginatedResponse(COHORTS),
    '/api/projects/:team_id/cohorts/:id/': (info: { params: Record<string, string | readonly string[]> }) => {
        const match = COHORTS.find((cohort) => String(cohort.id) === info.params.id)
        return match ? [200, match] : [404, { detail: 'Not found.' }]
    },
    '/api/projects/:team_id/messaging_categories/': toPaginatedResponse(CATEGORIES),
}
