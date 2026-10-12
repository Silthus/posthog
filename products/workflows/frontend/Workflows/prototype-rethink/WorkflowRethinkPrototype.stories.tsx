import type { Meta, StoryFn } from '@storybook/react'
import { BindLogic } from 'kea'

import { FEATURE_FLAGS } from 'lib/constants'

import { mswDecorator } from '~/mocks/browser'

import { PROTOTYPE_WORKFLOWS } from '../hogflows/tree/prototypeWorkflows'
import type { HogFlow } from '../hogflows/types'
import { workflowLogic } from '../workflowLogic'
import { WorkflowRethinkPrototype } from './WorkflowRethinkPrototype'

const meta: Meta = {
    title: 'Products/Workflows/Prototype/Rethink',
    parameters: {
        featureFlags: [FEATURE_FLAGS.WORKFLOWS_LINEAR_VIEW],
        layout: 'fullscreen',
        mockDate: '2026-09-04 12:00:00',
        testOptions: { viewport: { width: 1440, height: 1000 } },
    },
    decorators: [
        mswDecorator({
            get: {
                '/api/environments/:team_id/hog_flows/:id/': ({ params }) => [
                    200,
                    PROTOTYPE_WORKFLOWS[String(params.id)],
                ],
                '/api/environments/:team_id/messaging_categories': { count: 0, results: [] },
            },
            patch: {
                '/api/environments/:team_id/hog_flows/:id/': async ({ request, params }) => [
                    200,
                    {
                        ...PROTOTYPE_WORKFLOWS[String(params.id)],
                        ...((await request.json()) as Partial<HogFlow>),
                        updated_at: '2026-09-04T12:01:00.000Z',
                    },
                ],
            },
        }),
    ],
}
export default meta

const Scene = ({ id, aiPanel }: { id: string; aiPanel: boolean }): JSX.Element => (
    <BindLogic logic={workflowLogic} props={{ id }}>
        <WorkflowRethinkPrototype id={id} aiPanel={aiPanel} />
    </BindLogic>
)

export const LarkspurAbTestWithAiPanel: StoryFn = () => <Scene id="prototype-larkspur-launch-ab-test" aiPanel />
export const LarkspurAbTestFullWidth: StoryFn = () => <Scene id="prototype-larkspur-launch-ab-test" aiPanel={false} />
export const WelcomeWithAiPanel: StoryFn = () => <Scene id="prototype-fernwood-welcome" aiPanel />
export const WelcomeFullWidth: StoryFn = () => <Scene id="prototype-fernwood-welcome" aiPanel={false} />
export const RegionalSeasonOpenerWithAiPanel: StoryFn = () => <Scene id="prototype-regional-season-opener" aiPanel />
export const RegionalSeasonOpenerFullWidth: StoryFn = () => (
    <Scene id="prototype-regional-season-opener" aiPanel={false} />
)
