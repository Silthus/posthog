// PROTOTYPE ONLY (silthus/posthog#212). The three steps after picking an email: make it yours, send yourself
// a test, turn it on. Each variant passes its own way of customizing.
import { useActions, useValues } from 'kea'

import { IconCheckCircle } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { FlowStep, firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { SIGNED_IN_USER } from '../firstRunScenario'
import { DeliveredEmail } from './DeliveredEmail'
import { DraftPreview } from './DraftPreview'
import { TurnOnSummary } from './TurnOnSummary'

const STEPS: { key: FlowStep; label: string }[] = [
    { key: 'customize', label: 'Make it yours' },
    { key: 'test', label: 'Send yourself a test' },
    { key: 'turn-on', label: 'Turn it on' },
]

export function FlowStepsHeader(): JSX.Element {
    const { flowStep, testSent } = useValues(firstRunPrototypeLogic)
    const { setFlowStep } = useActions(firstRunPrototypeLogic)
    const currentIndex = STEPS.findIndex((step) => step.key === flowStep)

    return (
        <div className="flex flex-wrap items-center gap-2">
            {STEPS.map((step, index) => {
                const done = index < currentIndex
                const reachable = step.key === 'customize' || testSent
                return (
                    <LemonButton
                        key={step.key}
                        size="small"
                        type={step.key === flowStep ? 'primary' : 'tertiary'}
                        icon={done ? <IconCheckCircle className="text-success" /> : <span>{index + 1}</span>}
                        onClick={() => setFlowStep(step.key)}
                        disabledReason={reachable ? undefined : 'Send yourself a test first'}
                    >
                        {step.label}
                    </LemonButton>
                )
            })}
        </div>
    )
}

export function FlowSteps({ customizePanel }: { customizePanel: React.ReactNode }): JSX.Element | null {
    const { flowStep, draft } = useValues(firstRunPrototypeLogic)
    const { sendTest, setFlowStep } = useActions(firstRunPrototypeLogic)
    if (!draft) {
        return null
    }

    return (
        <div className="@container flex flex-col gap-4">
            <FlowStepsHeader />
            <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_22rem] gap-6 items-start">
                {flowStep === 'test' ? <DeliveredEmail /> : <DraftPreview draft={draft} />}
                <div className="flex flex-col gap-3">
                    {flowStep === 'customize' && (
                        <>
                            {customizePanel}
                            <LemonButton type="primary" size="large" onClick={sendTest} center>
                                Send me a test
                            </LemonButton>
                            <span className="text-xs text-secondary">Only you get it, at {SIGNED_IN_USER.email}.</span>
                        </>
                    )}
                    {flowStep === 'test' && (
                        <>
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
                        </>
                    )}
                    {flowStep === 'turn-on' && <TurnOnSummary />}
                </div>
            </div>
        </div>
    )
}
