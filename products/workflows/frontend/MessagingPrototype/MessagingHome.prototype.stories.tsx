// PROTOTYPE, never merged: Silthus/personal#212. Round 1 of the Messaging home, in the today-rail-nav shell.
import type { Meta, StoryObj } from '@storybook/react'

import { FEATURE_FLAGS } from 'lib/constants'
import { App } from 'scenes/App'

import {
    MessagingPrototypeVariant,
    messagingPrototypeLogic,
} from '~/layout/today/messagingPrototype/messagingPrototypeLogic'
import { messagingLandingSection } from '~/layout/today/messagingPrototype/messagingPrototypeNav'
import { MessagingPrototypeSwitcher } from '~/layout/today/messagingPrototype/MessagingPrototypeSwitcher'
import { mswDecorator } from '~/mocks/browser'

function pageUrl(variant: MessagingPrototypeVariant): string {
    return `/messaging-prototype/${messagingLandingSection(variant)}?variant=${variant}`
}

const meta: Meta = {
    component: App,
    title: 'Prototypes/Messaging home',
    decorators: [
        mswDecorator({
            post: {
                '/api/projects/:team_id/file_system/home_folder/': [
                    200,
                    { id: 'home-folder', path: 'Users/Alex Example' },
                ],
            },
        }),
        (Story, { parameters }) => {
            // The shell reads the variant while it maps the first URL to a pane, so it has to be set before render.
            messagingPrototypeLogic.mount()
            if (!messagingPrototypeLogic.values.variant) {
                messagingPrototypeLogic.actions.setVariant(parameters.variant)
            }
            return (
                <>
                    <Story />
                    <MessagingPrototypeSwitcher />
                </>
            )
        },
    ],
    parameters: {
        layout: 'fullscreen',
        viewMode: 'story',
        mockDate: '2026-10-28 10:00:00',
        featureFlags: [FEATURE_FLAGS.TODAY_RAIL_NAV, FEATURE_FLAGS.WORKFLOWS_TRANSACTIONAL_EMAIL_API],
    },
}
export default meta

type Story = StoryObj

export const VariantA: Story = { parameters: { variant: 'A', pageUrl: pageUrl('A') } }
export const VariantB: Story = { parameters: { variant: 'B', pageUrl: pageUrl('B') } }
export const VariantC: Story = { parameters: { variant: 'C', pageUrl: pageUrl('C') } }
