import { ReactNode } from 'react'

import { LemonButton, LemonDivider, LemonInput, LemonLabel, LemonTabs, LemonTag } from '@posthog/lemon-ui'

import { HogFunctionIcon } from 'scenes/hog-functions/configuration/HogFunctionIcon'

import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { SceneTitleSection } from '~/layout/scenes/components/SceneTitleSection'
import { HogFunctionType } from '~/types'

export function DestinationPageFrame({
    hogFunction,
    nameSuffix,
    actions,
    aboveTabs,
    configuration,
}: {
    hogFunction: HogFunctionType
    nameSuffix?: ReactNode
    actions: JSX.Element
    aboveTabs?: ReactNode
    configuration?: ReactNode
}): JSX.Element {
    return (
        <SceneContent>
            <SceneTitleSection
                name={hogFunction.name}
                nameSuffix={nameSuffix}
                description={hogFunction.description}
                descriptionAlwaysVisible
                resourceType={{
                    type: 'data_pipeline',
                    forceIcon: <HogFunctionIcon src={hogFunction.icon_url} size="small" />,
                }}
                canEdit={false}
                actions={actions}
            />
            {aboveTabs}
            <LemonTabs
                activeKey="configuration"
                tabs={[
                    {
                        key: 'configuration',
                        label: 'Configuration',
                        content: <>{configuration ?? <DestinationConfigurationStub />}</>,
                    },
                    { key: 'metrics', label: 'Metrics', content: <></> },
                    { key: 'invocations', label: 'Invocations', content: <></> },
                    { key: 'history', label: 'History', content: <></> },
                ]}
            />
        </SceneContent>
    )
}

export function DestinationConfigurationStub({ disabled = false }: { disabled?: boolean }): JSX.Element {
    return (
        <div className="flex flex-col gap-3">
            <LemonButton
                type="tertiary"
                size="small"
                className="border border-dashed"
                fullWidth
                disabledReason={disabled ? 'This destination is no longer edited here' : undefined}
            >
                <span className="flex flex-1 flex-wrap items-center gap-1">
                    Built from template: <span className="font-semibold">Slack</span>
                    <LemonTag type="success">stable</LemonTag>
                </span>
            </LemonButton>
            <div className="grid gap-4 @[48rem]/main-content:grid-cols-2">
                <div className="flex flex-col gap-3 rounded border border-primary bg-surface-primary p-3">
                    <h3 className="mb-0">Match events</h3>
                    <div className="flex flex-wrap items-center gap-1 text-sm">
                        <span className="text-muted">Trigger on</span>
                        <LemonTag type="default">user signed up</LemonTag>
                    </div>
                    <LemonDivider />
                    <h3 className="mb-0">Inputs</h3>
                    <LemonLabel>Slack workspace</LemonLabel>
                    <LemonInput value="Example Inc." disabled />
                    <LemonLabel>Channel</LemonLabel>
                    <LemonInput value="#signups" disabled />
                    <LemonLabel>Message</LemonLabel>
                    <LemonInput value="{person.properties.email} just signed up." disabled />
                </div>
                <div className="flex flex-col gap-3 rounded border border-primary bg-surface-primary p-3">
                    <h3 className="mb-0">Testing</h3>
                    <p className="mb-0 text-sm text-muted">Send a test event to check the message.</p>
                    <LemonButton
                        type="secondary"
                        size="small"
                        disabledReason={disabled ? 'Test the workflow instead' : undefined}
                    >
                        Test function
                    </LemonButton>
                </div>
            </div>
        </div>
    )
}
