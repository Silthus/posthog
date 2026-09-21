import type { Meta, StoryFn } from '@storybook/react'
import { useActions } from 'kea'
import { useEffect } from 'react'

import { mswDecorator } from '~/mocks/browser'

import type { HogFlow, HogFlowAction } from './hogflows/types'
import { workflowsLogic } from './workflowsLogic'
import { WorkflowsTable } from './WorkflowsTable'

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
        id: 'wf-base',
        team_id: 1,
        version: 3,
        name: 'Workflow',
        description: '',
        status: 'active',
        exit_condition: 'exit_only_at_end',
        actions: [] as HogFlowAction[],
        edges: [],
        trigger: { type: 'event', filters: {} },
        created_at: '2026-09-01T10:00:00.000Z',
        updated_at: '2026-09-18T10:00:00.000Z',
        created_by: USER,
        managed_by: 'gui',
        source_repository: null,
        source_path: null,
        source_ref: null,
        ...overrides,
    } as HogFlow
}

const WORKFLOWS: HogFlow[] = [
    workflow({
        id: 'wf-welcome',
        name: 'Welcome sequence',
        description: 'Greets a new account and checks in after a week.',
        managed_by: 'code',
        source_repository: 'github.com/example/flows',
        source_path: 'workflows/welcome.ts',
        source_ref: 'main',
    }),
    workflow({
        id: 'wf-renewal',
        name: 'Renewal window alerts',
        description: 'Warns the account team before a contract renews.',
        managed_by: 'code',
        source_repository: 'git.acme-internal.example.com/platform/flows',
        source_path: 'platform/workflows/renewal_window_alerts.ts',
        source_ref: 'release/2026-09',
    }),
    workflow({
        id: 'wf-trial',
        name: 'Trial nudges',
        description: 'Nudges a trial account that has not activated.',
        status: 'draft',
    }),
    workflow({
        id: 'wf-support',
        name: 'Support SLA routing',
        description: 'Routes a ticket that is close to its SLA.',
        trigger: { type: 'schedule', filters: {} } as HogFlow['trigger'],
    }),
    workflow({
        id: 'wf-winback',
        name: 'Win-back emails',
        description: 'Emails an account that churned last quarter.',
        status: 'draft',
        created_by: null,
    }),
    workflow({
        id: 'wf-cleanup',
        name: 'Pending ticket cleanup',
        description: 'Closes a ticket nobody has answered.',
        trigger: { type: 'manual', filters: {} } as HogFlow['trigger'],
    }),
]

const meta: Meta<typeof WorkflowsTable> = {
    title: 'Products/Workflows/Prototype/List',
    component: WorkflowsTable,
    parameters: {
        layout: 'padded',
        mockDate: '2026-09-21 12:00:00',
        testOptions: { waitForLoadersToDisappear: true },
    },
    decorators: [
        mswDecorator({
            get: {
                '/api/environments/:team_id/hog_flows/': () => [200, { count: WORKFLOWS.length, results: WORKFLOWS }],
                '/api/environments/:team_id/messaging_categories': { count: 0, results: [] },
            },
            post: {
                '/api/environments/:team_id/query/': { results: [], types: [], columns: [] },
            },
        }),
    ],
}
export default meta

function ManagedByCode({ children }: { children: JSX.Element }): JSX.Element {
    const { setFilters } = useActions(workflowsLogic)
    useEffect(() => {
        setFilters({ managedBy: 'code' })
    }, [setFilters])
    return children
}

export const WorkflowList: StoryFn = () => <WorkflowsTable />

export const WorkflowListNarrow: StoryFn = () => (
    <div className="w-[520px] border rounded p-2">
        <WorkflowsTable />
    </div>
)

export const ManagedByFilterApplied: StoryFn = () => (
    <ManagedByCode>
        <WorkflowsTable />
    </ManagedByCode>
)
