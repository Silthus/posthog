// The same workflow as the old prototype's example/onboarding.workflow.ts, written for the
// model where the file is a definition. It exports a workflow and stops. Running it with
// node does nothing, because there is nothing in it to run.

import { onEvent, person, secret, workflow } from '../sdk'

export const onboarding = workflow({
    name: 'Onboarding nudge (workflows as code)',
    description: 'Prototype workflow, authored in TypeScript and pushed from CI.',
})
    .on(onEvent({ event: 'user signed up' }))
    .delay('1d', { name: 'Wait a day' })
    .branch({
        name: 'On a paid plan?',
        branches: [
            {
                name: 'Paid plan',
                when: [person('plan', 'exact', ['pro', 'enterprise'])],
                then: (path) =>
                    path.webhook({
                        name: 'Tell the CRM to follow up',
                        url: 'https://example.com/hooks/onboarding',
                        body: { distinct_id: '{event.distinct_id}', plan: '{person.properties.plan}' },
                        signingSecret: secret('ONBOARDING_WEBHOOK_SECRET'),
                    }),
            },
        ],
    })
    .exit('Onboarding nudge finished')
