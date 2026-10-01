import { useActions, useValues } from 'kea'

import { IconGear, IconPlusSmall } from '@posthog/icons'
import { LemonButton, LemonSkeleton, LemonTabs } from '@posthog/lemon-ui'

import { SceneExport } from 'scenes/sceneTypes'
import { urls } from 'scenes/urls'

import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { SceneTitleSection } from '~/layout/scenes/components/SceneTitleSection'
import { ProductKey } from '~/queries/schema/schema-general'

import { EmailSuspensionBanner } from '../EmailSuspensionBanner'
import { optOutCategoriesLogic } from '../OptOuts/optOutCategoriesLogic'
import { SuppressionScene } from '../Suppression/SuppressionScene'
import { AudienceEngagement } from './AudienceEngagement'
import { audienceLogic } from './audienceLogic'
import { audienceSceneLogic } from './audienceSceneLogic'
import { AudienceSetup } from './AudienceSetup'
import { AudienceTopics } from './AudienceTopics'
import { CoverageGaps } from './CoverageGaps'
import { RecipientDetail } from './RecipientDetail'
import { RecipientsTable } from './RecipientsTable'

export const scene: SceneExport = {
    component: AudienceScene,
    logic: audienceSceneLogic,
    productKey: ProductKey.WORKFLOWS,
}

function AudienceActions(): JSX.Element | null {
    const { currentTab, selectedEmail } = useValues(audienceSceneLogic)
    const { openNewCategoryModal } = useActions(optOutCategoriesLogic)

    if (currentTab === 'topics') {
        return (
            <LemonButton
                data-attr="audience-new-topic"
                icon={<IconPlusSmall />}
                size="small"
                type="primary"
                onClick={() => openNewCategoryModal()}
            >
                New topic
            </LemonButton>
        )
    }
    if (currentTab === 'recipients' && !selectedEmail) {
        return (
            <LemonButton
                data-attr="audience-open-setup"
                icon={<IconGear />}
                size="small"
                type="secondary"
                to={urls.audience('setup')}
            >
                Set up
            </LemonButton>
        )
    }
    return null
}

export function AudienceScene(): JSX.Element {
    const { currentTab, selectedEmail } = useValues(audienceSceneLogic)
    const { isSetupNeeded } = useValues(audienceLogic)

    const showSetupOnly = currentTab === 'setup' || (isSetupNeeded && currentTab === 'recipients')

    return (
        <SceneContent>
            <SceneTitleSection
                name="Audience"
                description="The email addresses you can send to, their topic preferences, and how they engage"
                resourceType={{ type: 'workflows' }}
                actions={<AudienceActions />}
            />
            <EmailSuspensionBanner />
            {isSetupNeeded === null ? (
                <LemonSkeleton className="h-64" />
            ) : showSetupOnly ? (
                <div className="flex flex-col gap-4">
                    {!isSetupNeeded && (
                        <div>
                            <LemonButton type="tertiary" size="small" to={urls.audience()}>
                                Back to recipients
                            </LemonButton>
                        </div>
                    )}
                    <AudienceSetup />
                </div>
            ) : (
                <LemonTabs
                    activeKey={currentTab}
                    sceneInset
                    tabs={[
                        {
                            key: 'recipients',
                            label: 'Recipients',
                            link: urls.audience(),
                            content: selectedEmail ? (
                                <RecipientDetail />
                            ) : (
                                <div className="flex flex-col gap-4">
                                    <CoverageGaps />
                                    <RecipientsTable />
                                </div>
                            ),
                        },
                        {
                            key: 'engagement',
                            label: 'Engagement',
                            link: urls.audience('engagement'),
                            content: <AudienceEngagement />,
                        },
                        {
                            key: 'topics',
                            label: 'Topics',
                            link: urls.audience('topics'),
                            content: <AudienceTopics />,
                        },
                        {
                            key: 'suppression',
                            label: 'Suppression list',
                            link: urls.audience('suppression'),
                            content: <SuppressionScene />,
                        },
                    ]}
                />
            )}
        </SceneContent>
    )
}
