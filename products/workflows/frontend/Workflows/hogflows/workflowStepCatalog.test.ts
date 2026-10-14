import { FEATURE_FLAGS } from 'lib/constants'

import type { HogFunctionTemplateType } from '~/types'

import { isPickableDestination, StepCatalogContext, workflowStepSections } from './workflowStepCatalog'

const mainEnvironment = { id: 1, project_id: 1 }

const listed = (context: Partial<StepCatalogContext>): Record<string, string[]> =>
    Object.fromEntries(
        workflowStepSections({
            featureFlags: {},
            currentTeam: mainEnvironment,
            isRowScopedTrigger: false,
            ...context,
        }).map((section) => [section.title, section.steps.map((step) => step.name)])
    )

describe('workflowStepCatalog', () => {
    it('lists every step a workflow can always add, in the order the step picker shows them', () => {
        expect(listed({})).toEqual({
            Dispatch: ['Email', 'SMS', 'Slack', 'Webhook'],
            Delays: ['Delay', 'Time window', 'Wait until'],
            'Audience split': ['Conditional branch', 'Cohort branch'],
            'PostHog actions': ['Set variable', 'Capture event', 'Update person property', 'Set group property'],
            Support: ['Get ticket', 'Update ticket', 'Send message'],
        })
    })

    it.each([
        {
            name: 'adds the AI task behind its flag',
            context: { featureFlags: { [FEATURE_FLAGS.WORKFLOW_AI_TASK_ACTION]: true } },
            dispatch: ['Email', 'SMS', 'Slack', 'Webhook', 'Create AI task'],
        },
        {
            name: 'adds the scout step in the main environment',
            context: { featureFlags: { [FEATURE_FLAGS.WORKFLOW_RUN_SCOUT_ACTION]: true } },
            dispatch: ['Email', 'SMS', 'Slack', 'Webhook', 'Run scout'],
        },
        {
            name: 'leaves the scout step out of another environment',
            context: {
                featureFlags: { [FEATURE_FLAGS.WORKFLOW_RUN_SCOUT_ACTION]: true },
                currentTeam: { id: 2, project_id: 1 },
            },
            dispatch: ['Email', 'SMS', 'Slack', 'Webhook'],
        },
        {
            name: 'leaves the scout step out while the team loads',
            context: { featureFlags: { [FEATURE_FLAGS.WORKFLOW_RUN_SCOUT_ACTION]: true }, currentTeam: null },
            dispatch: ['Email', 'SMS', 'Slack', 'Webhook'],
        },
    ])('$name', ({ context, dispatch }) => {
        expect(listed(context).Dispatch).toEqual(dispatch)
    })

    it('offers no step that needs a person to a workflow that runs on warehouse rows', () => {
        const sections = listed({ isRowScopedTrigger: true })

        expect([sections.Delays, sections['Audience split']]).toEqual([
            ['Delay', 'Time window'],
            ['Conditional branch'],
        ])
    })

    it('keeps destinations that are already a step of their own out of the destination list', () => {
        const template = (id: string, name: string): HogFunctionTemplateType =>
            ({ id, name, type: 'destination', status: 'stable', description: '' }) as HogFunctionTemplateType

        const templates = [template('template-slack', 'Slack'), template('template-hubspot', 'HubSpot')]

        expect(templates.filter(isPickableDestination).map((template) => template.name)).toEqual(['HubSpot'])
    })
})
