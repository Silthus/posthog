// PROTOTYPE, never merged: Silthus/personal#212. The Workflows row as the automations home: every workflow,
// filtered by view, with no copy of the messaging setup.
import { useActions, useValues } from 'kea'
import { router } from 'kea-router'

import { IconPlus } from '@posthog/icons'
import { Button, Text, ToggleGroup, ToggleGroupItem } from '@posthog/quill'

import { SceneExport } from 'scenes/sceneTypes'

import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { SceneTitleSection } from '~/layout/scenes/components/SceneTitleSection'
import { messagingSectionUrl, workflowsRowUrl } from '~/layout/today/messagingPrototype/messagingPrototypeNav'
import { MessagingSettingsDialog } from '~/layout/today/messagingPrototype/MessagingSettingsDialog'
import { startNew } from '~/layout/today/messagingPrototype/NewMessagingMenuItems'
import { ProductKey } from '~/queries/schema/schema-general'

import { WorkflowsTable } from './MessagingSectionContent'

export const scene: SceneExport = {
    component: WorkflowsRowPrototypeScene,
    productKey: ProductKey.WORKFLOWS,
}

const FILTERS = [
    { key: 'all', label: 'All', views: ['Messaging', 'Automation', 'Loop'] },
    { key: 'messaging', label: 'Messaging', views: ['Messaging'] },
    { key: 'automations', label: 'Automations', views: ['Automation'] },
    { key: 'loops', label: 'Loops', views: ['Loop'] },
] as const

export function WorkflowsRowPrototypeScene(): JSX.Element {
    const { searchParams } = useValues(router)
    const { push } = useActions(router)
    const filter = FILTERS.find((candidate) => candidate.key === searchParams.type) ?? FILTERS[0]

    return (
        <SceneContent>
            <SceneTitleSection
                name="Workflows"
                description="Automate user communication and internal processes"
                resourceType={{ type: 'workflows' }}
                actions={
                    <Button variant="primary" onClick={() => startNew('workflows')}>
                        <IconPlus />
                        New workflow
                    </Button>
                }
            />
            <ToggleGroup
                variant="outline"
                value={[filter.key]}
                onValueChange={(value: string[]) => value[0] && push(workflowsRowUrl(value[0]))}
                className="flex-wrap"
            >
                {FILTERS.map((candidate) => (
                    <ToggleGroupItem key={candidate.key} value={candidate.key}>
                        {candidate.label}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
            <WorkflowsTable views={filter.views} />
            <Text size="xs" variant="muted" className="m-0">
                Channels, recipients and sending limits for messages are in{' '}
                <Button variant="link" size="inline" onClick={() => push(messagingSectionUrl('channels'))}>
                    Messaging
                </Button>
                .
            </Text>
            <MessagingSettingsDialog />
        </SceneContent>
    )
}
