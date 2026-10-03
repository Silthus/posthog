// PROTOTYPE ONLY (silthus/posthog#212). The Workflows quick start list the first-run flow proposes.
import type { ProductSetupConfig, SetupTask, SetupTaskId } from 'lib/components/ProductSetup'
import { urls } from 'scenes/urls'

import { ProductKey } from '~/queries/schema/schema-general'

import { SETUP_TASK, firstWorkflowUrl } from './firstRunScenario'

const task = (id: string, rest: Omit<SetupTask, 'id'>): SetupTask => ({ id: id as SetupTaskId, ...rest })

export const FIRST_RUN_SETUP_CONFIG: ProductSetupConfig = {
    productKey: ProductKey.WORKFLOWS,
    title: 'Get started with Workflows',
    tasks: [
        task(SETUP_TASK.sendExample, {
            title: 'Send yourself a test email',
            description: 'Pick an email that fits your app, make it yours, and see it in your inbox.',
            taskType: 'onboarding',
            getUrl: () => urls.workflows(),
        }),
        task(SETUP_TASK.turnOnWelcome, {
            title: 'Turn on your first email',
            description: 'It goes out on its own from a shared PostHog address until you add your domain.',
            taskType: 'onboarding',
            getUrl: () => firstWorkflowUrl(),
            targetSelector: '[data-attr="workflow-launch"]',
        }),
        task(SETUP_TASK.ownDomain, {
            title: 'Send from your own domain',
            description: 'Replies reach you, and your emails build your own sending reputation.',
            taskType: 'setup',
            getUrl: () => urls.workflows('channels'),
        }),
        task(SETUP_TASK.brand, {
            title: 'Make your emails look like you',
            description: 'Logo, colors and footer, picked up from your website.',
            taskType: 'setup',
            requiresManualCompletion: true,
            getUrl: () => urls.workflows('library'),
        }),
        task(SETUP_TASK.nudgeQuiet, {
            title: 'Bring back people who went quiet',
            description: 'Email people who have not visited for two weeks.',
            taskType: 'explore',
            requiresManualCompletion: true,
            getUrl: () => urls.workflows('library'),
        }),
        task(SETUP_TASK.broadcast, {
            title: 'Announce something to everyone',
            description: 'Send a one-off broadcast, like a feature launch.',
            taskType: 'explore',
            requiresManualCompletion: true,
            getUrl: () => urls.workflows(),
        }),
        task(SETUP_TASK.templates, {
            title: 'Browse the template library',
            description: 'Start from a ready-made workflow for onboarding, trials or re-engagement.',
            taskType: 'explore',
            requiresManualCompletion: true,
            getUrl: () => urls.workflows('library'),
        }),
    ],
}
