// Generated from a workflow definition by sdk/generate.ts. Throwaway prototype output.
import { branch, declarative, delay, email, fn, onEvent, path, type Conditions } from '../sdk'

export const onboarding = declarative({
    name: 'Onboarding nudge (composable steps)',
    description: 'Prototype workflow. One step value placed twice.',
    status: 'draft',
    exitCondition: 'exit_only_at_end',
    on: onEvent({ event: 'user signed up' }),
    steps: path(
        delay('1d', { name: 'Wait a day' }),
        branch({
            name: 'Which plan?',
            branches: [
                {
                    name: 'Paid plan',
                    when: [
                        { key: 'plan', operator: 'exact', value: ['pro', 'enterprise'], type: 'person' },
                    ] as Conditions,
                    then: path(
                        email({
                            name: 'Welcome the paid customer',
                            to: '{person.properties.email}',
                            subject: 'Welcome aboard',
                            text: 'Thanks for upgrading. Here is how to get started.',
                            html: '<p>Thanks for upgrading. Here is how to get started.</p>',
                        }),
                        fn({
                            name: 'Tell the CRM to follow up',
                            templateId: 'template-webhook',
                            inputs: {
                                url: 'https://example.com/hooks/onboarding',
                                method: 'POST',
                                body: { distinct_id: '{event.distinct_id}', plan: '{person.properties.plan}' },
                                signing_secret: 'placeholder-signing-secret',
                            },
                        })
                    ),
                },
                {
                    name: 'Free plan',
                    when: [{ key: 'plan', operator: 'exact', value: ['free'], type: 'person' }] as Conditions,
                    then: path(
                        delay('2d', { name: 'Give the free plan two days' }),
                        fn({
                            name: 'Tell the CRM to follow up',
                            templateId: 'template-webhook',
                            inputs: {
                                url: 'https://example.com/hooks/onboarding',
                                method: 'POST',
                                body: { distinct_id: '{event.distinct_id}', plan: '{person.properties.plan}' },
                                signing_secret: 'placeholder-signing-secret',
                            },
                        })
                    ),
                },
            ],
        })
    ),
    exit: { reason: 'Onboarding nudge finished' },
})
