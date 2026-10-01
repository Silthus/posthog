import { useActions, useValues } from 'kea'

import { IconDownload, IconExternal } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { userLogic } from 'scenes/userLogic'

import { customerIOImportLogic } from '../OptOuts/customerIOImportLogic'
import { CustomerIOImportModal } from '../OptOuts/CustomerIOImportModal'
import { OptOutCategories } from '../OptOuts/OptOutCategories'
import { OptOutList } from '../OptOuts/OptOutList'
import { optOutSceneLogic } from '../OptOuts/optOutSceneLogic'

export function AudienceTopics(): JSX.Element {
    const { user } = useValues(userLogic)
    const { preferencesUrlLoading } = useValues(optOutSceneLogic)
    const { openPreferencesPage } = useActions(optOutSceneLogic)
    const { openImportModal } = useActions(customerIOImportLogic)

    return (
        <div className="flex flex-col gap-8" data-attr="audience-topics">
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="max-w-2xl">
                        <h2 className="text-xl font-semibold m-0">Topics</h2>
                        <p className="text-muted m-0">
                            The kinds of email a recipient can subscribe to or unsubscribe from. Recipients see topics
                            on their preferences page, and your app sends them by key.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <LemonButton
                            type="secondary"
                            size="small"
                            onClick={() => openImportModal()}
                            icon={<IconDownload />}
                            tooltip="Import topics and preferences from Customer.io"
                        >
                            Import from Customer.io
                        </LemonButton>
                        <LemonButton
                            type="secondary"
                            size="small"
                            onClick={() => openPreferencesPage()}
                            loading={preferencesUrlLoading}
                            disabledReason={!user?.email ? 'Your account has no email address' : undefined}
                            tooltip="Open the preferences page as your own address sees it, in a new tab"
                            icon={<IconExternal />}
                        >
                            Preview preferences page
                        </LemonButton>
                    </div>
                </div>
                <OptOutCategories />
            </div>

            <div className="flex flex-col gap-2">
                <div>
                    <h2 className="text-xl font-semibold m-0">Unsubscribed from all marketing</h2>
                    <p className="text-muted m-0">
                        Recipients who left every marketing topic at once. They still get transactional email.
                    </p>
                </div>
                <OptOutList />
            </div>

            <CustomerIOImportModal />
        </div>
    )
}
