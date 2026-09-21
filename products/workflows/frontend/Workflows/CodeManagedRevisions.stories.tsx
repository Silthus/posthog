import type { Meta, StoryFn } from '@storybook/react'

import { mswDecorator } from '~/mocks/browser'

import type { HogFlow, HogFlowAction } from './hogflows/types'
import type { WorkflowRevisionRow } from './revisions/revisionSource'
import { WorkflowRevisions } from './WorkflowRevisions'

const CODE_WORKFLOW_ID = 'wf-code-managed'
const GUI_WORKFLOW_ID = 'wf-ui-managed'

const USER = {
    id: 1,
    uuid: 'user-1',
    distinct_id: 'user-1',
    first_name: 'Nadia',
    last_name: 'Okafor',
    email: 'nadia@example.com',
}

function workflow(overrides: Partial<HogFlow>): HogFlow {
    return {
        id: CODE_WORKFLOW_ID,
        team_id: 1,
        version: 6,
        name: 'Welcome sequence',
        description: 'Greets a new account and checks in after a week.',
        status: 'active',
        exit_condition: 'exit_only_at_end',
        actions: [] as HogFlowAction[],
        edges: [],
        trigger: { type: 'event', filters: {} },
        created_at: '2026-09-01T10:00:00.000Z',
        updated_at: '2026-09-18T10:00:00.000Z',
        created_by: USER,
        managed_by: 'code',
        source_repository: 'github.com/example/flows',
        source_path: 'workflows/welcome.ts',
        source_ref: 'main',
        ...overrides,
    } as HogFlow
}

const CODE_WORKFLOW = workflow({})
const GUI_WORKFLOW = workflow({
    id: GUI_WORKFLOW_ID,
    name: 'Trial nudges',
    managed_by: 'gui',
    source_repository: null,
    source_path: null,
    source_ref: null,
})

const CODE_REVISIONS: WorkflowRevisionRow[] = [
    {
        version: 6,
        created_at: '2026-09-18T10:00:00.000Z',
        created_by: null,
        created_via: 'api',
        source: {
            commit: '4c1f9a2e77d0b6153f8ab4c2e19d7f0a5b3c8d21',
            ref: 'main',
            repository: 'github.com/example/flows',
            path: 'workflows/welcome.ts',
            run_url: 'https://github.com/example/flows/actions/runs/1842',
            author: 'Priya Raman',
            message: 'Shorten the check-in delay to three days',
        },
    },
    {
        version: 5,
        created_at: '2026-09-15T09:30:00.000Z',
        created_by: null,
        created_via: 'api',
        source: {
            commit: 'b70d3418ca95e2f7106d4b8c3a25e91f7d604c8b',
            ref: 'release/2026-09',
            repository: 'git.acme-internal.example.com/platform/flows',
            path: 'platform/workflows/welcome.ts',
            run_url: 'https://git.acme-internal.example.com/platform/flows/-/jobs/9917',
            author: 'Tomas Berg',
            message: 'Move the welcome copy into the shared block',
        },
    },
    {
        version: 4,
        created_at: '2026-09-12T14:05:00.000Z',
        created_by: USER,
        created_via: 'web',
        source: null,
    },
    {
        version: 3,
        created_at: '2026-09-10T08:15:00.000Z',
        created_by: null,
        created_via: 'web',
        source: null,
    },
    {
        version: 2,
        created_at: '2026-09-08T16:40:00.000Z',
        created_by: null,
        created_via: 'mcp',
        source: null,
    },
    {
        version: 1,
        created_at: '2026-09-05T11:20:00.000Z',
        created_by: null,
        created_via: 'self_driving',
        source: null,
    },
    {
        version: 0,
        created_at: '2026-09-01T10:00:00.000Z',
        created_by: null,
        created_via: null,
        source: null,
    },
]

const GUI_REVISIONS: WorkflowRevisionRow[] = [
    { version: 6, created_at: '2026-09-18T10:00:00.000Z', created_by: USER, created_via: 'web', source: null },
    { version: 5, created_at: '2026-09-15T09:30:00.000Z', created_by: USER, created_via: 'web', source: null },
    { version: 4, created_at: '2026-09-12T14:05:00.000Z', created_by: null, created_via: 'mcp', source: null },
    { version: 3, created_at: '2026-09-10T08:15:00.000Z', created_by: null, created_via: 'api', source: null },
]

const WORKFLOWS: Record<string, HogFlow> = {
    [CODE_WORKFLOW_ID]: CODE_WORKFLOW,
    [GUI_WORKFLOW_ID]: GUI_WORKFLOW,
}

const REVISIONS: Record<string, WorkflowRevisionRow[]> = {
    [CODE_WORKFLOW_ID]: CODE_REVISIONS,
    [GUI_WORKFLOW_ID]: GUI_REVISIONS,
}

const meta: Meta<typeof WorkflowRevisions> = {
    title: 'Products/Workflows/Prototype/Revisions',
    component: WorkflowRevisions,
    parameters: {
        layout: 'padded',
        mockDate: '2026-09-21 12:00:00',
        testOptions: { waitForLoadersToDisappear: true },
    },
    decorators: [
        mswDecorator({
            get: {
                '/api/environments/:team_id/hog_flows/:id/': ({ params }) => [
                    200,
                    WORKFLOWS[String(params.id)] ?? CODE_WORKFLOW,
                ],
                '/api/projects/:team_id/hog_flows/:id/revisions/': ({ params }) => {
                    const rows = REVISIONS[String(params.id)] ?? CODE_REVISIONS
                    return [200, { count: rows.length, results: rows }]
                },
                '/api/environments/:team_id/messaging_categories': { count: 0, results: [] },
            },
            post: {
                '/api/environments/:team_id/query/': { results: [], types: [], columns: [] },
            },
        }),
    ],
}
export default meta

export const RevisionHistory: StoryFn = () => <WorkflowRevisions id={CODE_WORKFLOW_ID} />

export const RevisionHistoryNarrow: StoryFn = () => (
    <div className="w-[520px] max-w-full border rounded p-2">
        <WorkflowRevisions id={CODE_WORKFLOW_ID} />
    </div>
)

export const SourceColumnLast: StoryFn = () => <WorkflowRevisions id={CODE_WORKFLOW_ID} sourceColumnPosition="last" />

export const RevisionHistoryEditable: StoryFn = () => <WorkflowRevisions id={GUI_WORKFLOW_ID} />
