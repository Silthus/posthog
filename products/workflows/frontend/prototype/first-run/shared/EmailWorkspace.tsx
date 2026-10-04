// PROTOTYPE ONLY (silthus/posthog#212). Opens on a template: the real Unlayer email editor for inline edits,
// the brand and PostHog AI next to it, then a test to yourself, then turning it on.
import { useActions, useValues } from 'kea'

import { IconCheckCircle } from '@posthog/icons'
import { LemonButton, LemonModal } from '@posthog/lemon-ui'

import { EmailTemplater } from 'scenes/hog-functions/email-templater/EmailTemplater'

import { FlowStep, firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { SIGNED_IN_USER } from '../firstRunScenario'
import { AiCustomizer } from './AiCustomizer'
import { BrandPanel } from './BrandPanel'
import { DeliveredEmail } from './DeliveredEmail'
import { TurnOnSummary } from './TurnOnSummary'

const STEPS: { key: FlowStep; label: string }[] = [
    { key: 'customize', label: 'Make it yours' },
    { key: 'test', label: 'Send yourself a test' },
    { key: 'turn-on', label: 'Turn it on' },
]

function StepsHeader(): JSX.Element {
    const { flowStep, testHtml } = useValues(firstRunPrototypeLogic)
    const { setFlowStep } = useActions(firstRunPrototypeLogic)
    const currentIndex = STEPS.findIndex((step) => step.key === flowStep)

    return (
        <div className="flex flex-wrap items-center gap-2">
            {STEPS.map((step, index) => (
                <LemonButton
                    key={step.key}
                    size="small"
                    type={step.key === flowStep ? 'primary' : 'tertiary'}
                    icon={
                        index < currentIndex ? <IconCheckCircle className="text-success" /> : <span>{index + 1}</span>
                    }
                    onClick={() => setFlowStep(step.key)}
                    disabledReason={step.key === 'customize' || testHtml ? undefined : 'Send yourself a test first'}
                >
                    {step.label}
                </LemonButton>
            ))}
        </div>
    )
}

export function EmailWorkspace(): JSX.Element {
    const { template, email, flowStep } = useValues(firstRunPrototypeLogic)
    const { closeTemplate, setEmail, sendTest, setFlowStep } = useActions(firstRunPrototypeLogic)

    return (
        <LemonModal
            isOpen={Boolean(template && email)}
            onClose={closeTemplate}
            title={template?.name}
            description={template?.description}
            fullScreen
        >
            {template && email && (
                <div className="flex flex-col gap-4 h-full">
                    <StepsHeader />
                    {flowStep === 'customize' && (
                        <div className="grid grid-cols-[1fr_24rem] gap-4 flex-1 min-h-0">
                            <div className="flex flex-col h-[calc(100vh-14rem)] min-h-[32rem] border rounded overflow-hidden">
                                <EmailTemplater
                                    key={template.id}
                                    type="native_email"
                                    layout="inline"
                                    templating="liquid"
                                    value={email as any}
                                    onChange={(value) => setEmail(value as any)}
                                />
                            </div>
                            <div className="flex flex-col gap-3 overflow-y-auto h-[calc(100vh-14rem)] min-h-[32rem]">
                                <div className="rounded border border-primary bg-surface-primary p-3">
                                    <BrandPanel compact />
                                </div>
                                <AiCustomizer />
                                <LemonButton type="primary" size="large" onClick={sendTest} center>
                                    Send me a test
                                </LemonButton>
                                <span className="text-xs text-secondary">
                                    Only you get it, at {SIGNED_IN_USER.email}. Click any text in the email to edit it.
                                </span>
                            </div>
                        </div>
                    )}
                    {flowStep === 'test' && (
                        <div className="grid grid-cols-[1fr_24rem] gap-4">
                            <DeliveredEmail />
                            <div className="flex flex-col gap-3">
                                <h3 className="text-base font-semibold mb-0">It just landed in your inbox</h3>
                                <p className="text-sm text-secondary mb-0">
                                    This is exactly what your users will get, with their own name in it.
                                </p>
                                <LemonButton type="primary" size="large" onClick={() => setFlowStep('turn-on')} center>
                                    Looks good
                                </LemonButton>
                                <LemonButton type="secondary" onClick={() => setFlowStep('customize')} center>
                                    Change something
                                </LemonButton>
                            </div>
                        </div>
                    )}
                    {flowStep === 'turn-on' && (
                        <div className="grid grid-cols-[1fr_24rem] gap-4">
                            <DeliveredEmail />
                            <TurnOnSummary />
                        </div>
                    )}
                </div>
            )}
        </LemonModal>
    )
}
