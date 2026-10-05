// PROTOTYPE ONLY (silthus/posthog#212). One screen to make a template yours: the real Unlayer email editor,
// the detected brand, PostHog AI in the side panel, then a test to yourself and on to the workflow.
import { useActions, useValues } from 'kea'

import { IconArrowLeft, IconSparkles } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonModal, LemonSwitch } from '@posthog/lemon-ui'

import { EmailTemplater } from 'scenes/hog-functions/email-templater/EmailTemplater'

import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { SHARED_SENDER, SIGNED_IN_USER } from './firstRunScenario'
import { sendsFor } from './realTemplates'
import { BrandPanel } from './shared/BrandPanel'
import { DeliveredEmail } from './shared/DeliveredEmail'

export function EmailWorkspace(): JSX.Element | null {
    const { template, email } = useValues(firstRunPrototypeLogic)
    const { closeTemplate, setEmail } = useActions(firstRunPrototypeLogic)
    if (!template || !email) {
        return null
    }

    return (
        <div className="flex flex-col gap-4 py-2">
            <div className="flex items-start gap-3">
                <LemonButton size="small" icon={<IconArrowLeft />} onClick={closeTemplate}>
                    All templates
                </LemonButton>
                <div className="flex flex-col">
                    <h2 className="text-xl font-semibold mb-0">Make it yours: {template.name}</h2>
                    <span className="text-sm text-secondary">{sendsFor(template)}.</span>
                </div>
            </div>
            <div className="grid grid-cols-[1fr_22rem] gap-4">
                <div className="flex flex-col h-[calc(100vh-15rem)] min-h-[32rem] border rounded overflow-hidden">
                    <EmailTemplater
                        key={template.id}
                        type="native_email"
                        layout="inline"
                        templating="liquid"
                        value={email as any}
                        onChange={(value) => setEmail(value as any)}
                    />
                </div>
                <WorkspaceSidebar />
            </div>
            <InboxModal />
        </div>
    )
}

function WorkspaceSidebar(): JSX.Element {
    const { testHtml, enableOnOpen, captureEngagement } = useValues(firstRunPrototypeLogic)
    const { askPostHogAi, sendTest, openInbox, openWorkflow, setEnableOnOpen, setCaptureEngagement } =
        useActions(firstRunPrototypeLogic)

    return (
        <div className="flex flex-col gap-3">
            <div className="rounded border border-primary bg-surface-primary p-3">
                <BrandPanel compact />
            </div>
            <LemonButton
                type="secondary"
                size="large"
                icon={<IconSparkles className="text-ai" />}
                onClick={askPostHogAi}
                center
            >
                Change with PostHog AI
            </LemonButton>
            <span className="text-xs text-secondary">Or click any text in the email to edit it.</span>
            <div className="flex flex-col gap-2 mt-auto">
                {testHtml ? (
                    <LemonBanner type="success" action={{ children: 'View', onClick: openInbox }}>
                        Test sent to {SIGNED_IN_USER.email}
                    </LemonBanner>
                ) : null}
                <LemonButton type="secondary" onClick={sendTest} center>
                    {testHtml ? 'Send another test' : 'Send me a test'}
                </LemonButton>
                <LemonButton type="primary" size="large" onClick={openWorkflow} center>
                    {enableOnOpen ? 'Enable and open workflow' : 'Open workflow'}
                </LemonButton>
                <LemonSwitch
                    checked={enableOnOpen}
                    onChange={setEnableOnOpen}
                    label="Enable workflow"
                    bordered
                    fullWidth
                />
                <span className="text-xs text-secondary">
                    {enableOnOpen
                        ? `It starts sending emails right away, from ${SHARED_SENDER.address}.`
                        : 'It opens as a draft and sends no emails until you enable it.'}
                </span>
                <LemonSwitch
                    checked={captureEngagement}
                    onChange={setCaptureEngagement}
                    label="Capture engagement events"
                    bordered
                    fullWidth
                />
                <span className="text-xs text-secondary">
                    {captureEngagement
                        ? 'Opens and clicks become PostHog events you can use in insights and funnels. They count toward your event usage.'
                        : "Opens and clicks only show in this workflow's metrics."}
                </span>
            </div>
        </div>
    )
}

function InboxModal(): JSX.Element {
    const { inboxOpen } = useValues(firstRunPrototypeLogic)
    const { closeInbox } = useActions(firstRunPrototypeLogic)
    return (
        <LemonModal isOpen={inboxOpen} onClose={closeInbox} title="Your inbox (simulated)" width={760}>
            <DeliveredEmail />
        </LemonModal>
    )
}
