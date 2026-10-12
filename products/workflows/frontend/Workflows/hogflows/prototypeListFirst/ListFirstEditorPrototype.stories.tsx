// PROTOTYPE (throwaway, never merges): stories for the list-first editor lane, Silthus/personal#34.
import type { Meta, StoryFn } from '@storybook/react'

import { FEATURE_FLAGS } from 'lib/constants'

import { mswDecorator } from '~/mocks/browser'
import _hogFunctionTemplatesDestinations from '~/mocks/fixtures/_hogFunctionTemplatesDestinations.json'
import { HogFunctionTemplateType } from '~/types'

import { PROTOTYPE_WORKFLOWS } from '../tree/prototypeWorkflows'
import type { HogFlow } from '../types'
import { ListFirstEditorPrototype } from './ListFirstEditorPrototype'

const AB_ID = 'prototype-larkspur-launch-ab-test'
const WELCOME_ID = 'prototype-fernwood-welcome'
const REGIONAL_ID = 'prototype-regional-season-opener'

const EMAIL_TEMPLATE: HogFunctionTemplateType = {
    id: 'template-email',
    type: 'destination',
    name: 'Email',
    description: 'The email message to send. Configure the recipient, sender, subject, and content.',
    status: 'hidden',
    free: false,
    code: '',
    code_language: 'hog',
    icon_url: '/static/posthog-icon.svg',
    inputs_schema: [
        {
            type: 'native_email',
            key: 'email',
            label: 'Email message',
            integration: 'email',
            required: true,
            secret: false,
            description: 'The email message to send.',
        },
    ],
}

const meta: Meta = {
    title: 'Products/Workflows/Editor/Prototype list-first',
    parameters: {
        featureFlags: [FEATURE_FLAGS.WORKFLOWS_LINEAR_VIEW],
        layout: 'fullscreen',
        mockDate: '2026-09-04 12:00:00',
        testOptions: { waitForSelector: '[data-attr=workflow-document]', viewport: { width: 1440, height: 900 } },
    },
    decorators: [
        mswDecorator({
            get: {
                '/api/environments/:team_id/hog_flows/:id/': ({ params }) => [
                    200,
                    PROTOTYPE_WORKFLOWS[String(params.id)] as HogFlow,
                ],
                '/api/environments/:team_id/messaging_categories': { count: 0, results: [] },
                '/api/projects/:team_id/hog_function_templates': {
                    count: _hogFunctionTemplatesDestinations.results.length + 1,
                    results: [...(_hogFunctionTemplatesDestinations.results as unknown[]), EMAIL_TEMPLATE],
                },
            },
        }),
    ],
}
export default meta

function MockNav(): JSX.Element {
    return (
        <aside className="flex w-[13.5rem] shrink-0 flex-col gap-1 border-r bg-surface-secondary p-2 text-[13px] text-secondary">
            <div className="mb-2 px-2 py-1 font-semibold text-primary">Fernwood Outfitters</div>
            {['Home', 'Product analytics', 'Web analytics', 'Session replay', 'Feature flags', 'Workflows', 'Data'].map(
                (item) => (
                    <div
                        key={item}
                        className={
                            item === 'Workflows' ? 'rounded bg-fill-highlight-100 px-2 py-1 text-primary' : 'px-2 py-1'
                        }
                    >
                        {item}
                    </div>
                )
            )}
        </aside>
    )
}

const AI_CHAT: Record<string, [string, string]> = {
    [AB_ID]: [
        'Build a launch flow for the Larkspur boot that tests three email angles.',
        'I created the Larkspur launch flow with three email variants. Each sends a launch email in the morning send window, waits five days for a purchase, and follows up with anyone who has not bought. It is saved as a draft.',
    ],
    [WELCOME_ID]: [
        'Set up a welcome series for new newsletter readers.',
        'I created a two-email welcome series: a greeting right away, then a getting started guide two days later. It is saved as a draft.',
    ],
    [REGIONAL_ID]: [
        'Send the season opener by region, tier and interest.',
        'I created the regional season opener. It routes people by region, membership tier and interest, then sends a season email and a nudge if they do not open the trail guide. It is saved as a draft.',
    ],
}

function MockAiPanel({ id }: { id: string }): JSX.Element {
    const [ask, answer] = AI_CHAT[id]
    return (
        <aside className="flex w-[420px] shrink-0 flex-col border-l bg-surface-secondary">
            <div className="border-b px-3 py-2 text-[13px] font-semibold">PostHog AI</div>
            <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3 text-[13px]">
                <div className="self-end rounded-lg bg-surface-primary px-3 py-2">
                    {ask}
                </div>
                <div className="rounded-lg px-1 py-1 leading-snug">{answer}</div>
            </div>
            <div className="m-3 rounded-md border bg-surface-primary px-3 py-2 text-[13px] text-tertiary">
                Ask PostHog AI…
            </div>
        </aside>
    )
}

function Frame({ id, aiPanel }: { id: string; aiPanel: boolean }): JSX.Element {
    return (
        <div className="flex h-screen w-full overflow-hidden">
            <MockNav />
            <main className="flex min-w-0 flex-1 flex-col">
                <ListFirstEditorPrototype id={id} />
            </main>
            {aiPanel && <MockAiPanel id={id} />}
        </div>
    )
}

export const LarkspurAbLaunchWithAiPanel: StoryFn = () => <Frame id={AB_ID} aiPanel />
export const LarkspurAbLaunch: StoryFn = () => <Frame id={AB_ID} aiPanel={false} />
export const WelcomeWithAiPanel: StoryFn = () => <Frame id={WELCOME_ID} aiPanel />
export const Welcome: StoryFn = () => <Frame id={WELCOME_ID} aiPanel={false} />
export const RegionalSeasonOpenerWithAiPanel: StoryFn = () => <Frame id={REGIONAL_ID} aiPanel />
export const RegionalSeasonOpener: StoryFn = () => <Frame id={REGIONAL_ID} aiPanel={false} />
