import { StoryObj } from '@storybook/react'
import { useValues } from 'kea'
import { FEATURE_FLAGS } from 'lib/constants'
import { panelLayoutLogic } from '~/layout/panel-layout/panelLayoutLogic'
import { SidePanel } from '~/layout/navigation-3000/sidepanel/SidePanel'
import { mswDecorator } from '~/mocks/browser'
import { EMPTY_PAGINATED_RESPONSE, toPaginatedResponse } from '~/mocks/handlers'
import { WELCOME_SEQUENCE_ID, SANDBOX_SENDER, globalTemplates, projectThatSends } from './firstRunStoryFixtures'
import { WorkflowsFirstRunMakeItYours } from './WorkflowsFirstRunMakeItYours'
function Proof(): JSX.Element {
    const { sidePanelWidth } = useValues(panelLayoutLogic)
    return <div className="flex min-h-screen"><div className="min-w-0 p-4" style={{width: `calc(100% - ${sidePanelWidth}px)`}}><WorkflowsFirstRunMakeItYours templateId={WELCOME_SEQUENCE_ID} /></div><SidePanel /></div>
}
export default {
    component: Proof,
    title: 'Scratch/First run email agent proof',
    parameters: { layout: 'fullscreen', featureFlags: [FEATURE_FLAGS.WORKFLOWS_FIRST_RUN, FEATURE_FLAGS.WORKFLOWS_SANDBOX_SENDER, FEATURE_FLAGS.PHAI_SANDBOX_MODE] },
    decorators: [mswDecorator({ get: {
        '/api/projects/:team_id/hog_flow_templates/': toPaginatedResponse(globalTemplates),
        '/api/projects/:team_id/integrations/': toPaginatedResponse([SANDBOX_SENDER]),
        '/api/projects/:team_id/messaging_templates/': EMPTY_PAGINATED_RESPONSE,
    }}), mswDecorator(projectThatSends(['signed_up', '$pageview', '$feature_view']))],
}
export const OpenPanel: StoryObj = {}
