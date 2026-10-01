import type { Meta, StoryFn } from '@storybook/react'
import { useEffect, useState } from 'react'
import { Slide, ToastContainer } from 'react-toastify'

import { LemonTag } from '@posthog/lemon-ui'

import { AgentHandoffModal } from './shared/AgentHandoffModal'
import { CloudflareApprovalOverlay } from './shared/CloudflareApprovalOverlay'
import { HostKey, OutcomeKey, SetupScenario, SpeedKey, TrustKey, useSetupSimulation } from './simulation'
import { CLICK_THROUGH_VARIANTS, DEFAULT_CLICK_THROUGH_VARIANT } from './variants'
import { VariantSwitcher } from './VariantSwitcher'

// PROTOTYPE (throwaway): click through the whole email domain setup in three different shapes.
// The floating bar switches variant and scenario. Arrow keys cycle variants when no input is focused.

interface ClickThroughArgs {
    variant: string
    host: HostKey
    outcome: OutcomeKey
    speed: SpeedKey
    trust: TrustKey
    width: 'full' | 'narrow'
}

const meta: Meta<ClickThroughArgs> = {
    title: 'Products/Workflows/Email domain prototype/Click-through',
    parameters: {
        layout: 'fullscreen',
        viewMode: 'story',
        testOptions: { skip: true },
    },
    argTypes: {
        variant: { control: 'radio', options: CLICK_THROUGH_VARIANTS.map((v) => v.key) },
        host: { control: 'select', options: ['cloudflare', 'route53', 'namecheap', 'unknown'] },
        outcome: { control: 'radio', options: ['success', 'stuck'] },
        speed: { control: 'radio', options: [1, 4] },
        trust: { control: 'select', options: ['inline', 'step4', 'later', 'checklist'] },
        width: { control: 'radio', options: ['full', 'narrow'], description: '"narrow" pins the scene to 520px' },
    },
    args: {
        variant: DEFAULT_CLICK_THROUGH_VARIANT,
        host: 'cloudflare',
        outcome: 'success',
        speed: 1,
        trust: 'inline',
        width: 'full',
    },
}
export default meta

function SceneChrome({ width, children }: { width: 'full' | 'narrow'; children: React.ReactNode }): JSX.Element {
    return (
        <div className="min-h-screen bg-primary flex flex-col">
            <div className="flex items-center gap-2 px-4 h-10 border-b bg-surface-primary text-xs text-secondary">
                <span>Workflows</span>
                <span>/</span>
                <span>Channels</span>
                <span>/</span>
                <span>Email</span>
                <span>/</span>
                <span className="text-primary font-medium">New sending domain</span>
                <LemonTag type="warning" size="small" className="ml-auto">
                    Prototype
                </LemonTag>
            </div>
            <div className={width === 'narrow' ? 'max-w-130 border-r border-dashed grow' : 'grow'}>
                <div className="@container h-full pb-28">{children}</div>
            </div>
            <ToastContainer autoClose={4000} transition={Slide} position="bottom-right" />
        </div>
    )
}

function ClickThroughScene(args: ClickThroughArgs): JSX.Element {
    const [variantKey, setVariantKey] = useState(args.variant)
    const [scenario, setScenario] = useState<SetupScenario>({
        host: args.host,
        outcome: args.outcome,
        speed: args.speed,
        trust: args.trust,
    })
    const [runId, setRunId] = useState(0)
    useEffect(() => setVariantKey(args.variant), [args.variant])
    useEffect(
        () => setScenario({ host: args.host, outcome: args.outcome, speed: args.speed, trust: args.trust }),
        [args.host, args.outcome, args.speed, args.trust]
    )

    const current =
        CLICK_THROUGH_VARIANTS.find((v) => v.key === variantKey) ??
        CLICK_THROUGH_VARIANTS.find((v) => v.key === DEFAULT_CLICK_THROUGH_VARIANT)!

    return (
        <SceneChrome width={args.width}>
            <SimulatedVariant key={runId} scenario={scenario} Component={current.Component}>
                {(reset) => (
                    <VariantSwitcher
                        variants={CLICK_THROUGH_VARIANTS}
                        current={current}
                        onVariantChange={setVariantKey}
                        scenario={scenario}
                        onScenarioChange={(next) => {
                            setScenario(next)
                            if (next.host !== scenario.host || next.outcome !== scenario.outcome) {
                                reset()
                            }
                        }}
                        onReset={() => {
                            reset()
                            setRunId((id) => id + 1)
                        }}
                    />
                )}
            </SimulatedVariant>
        </SceneChrome>
    )
}

function SimulatedVariant({
    scenario,
    Component,
    children,
}: {
    scenario: SetupScenario
    Component: (props: { sim: ReturnType<typeof useSetupSimulation> }) => JSX.Element
    children: (reset: () => void) => JSX.Element
}): JSX.Element {
    const sim = useSetupSimulation(scenario)
    return (
        <>
            <Component sim={sim} />
            <AgentHandoffModal sim={sim} />
            <CloudflareApprovalOverlay sim={sim} />
            {children(sim.actions.reset)}
        </>
    )
}

const Template: StoryFn<ClickThroughArgs> = (args) => <ClickThroughScene {...args} />

export const ClickThrough = Template.bind({})
ClickThrough.parameters = {
    docs: {
        description: {
            story: 'Use the floating bar (or ← →) to switch variants. Change host or outcome to see the auto-configure, named host, unknown host and stuck paths.',
        },
    },
}

export const Focus = Template.bind({})
Focus.args = { variant: 'focus' }

export const Board = Template.bind({})
Board.args = { variant: 'board' }

export const Max = Template.bind({})
Max.args = { variant: 'max' }

export const FocusNarrow = Template.bind({})
FocusNarrow.args = { variant: 'focus', width: 'narrow' }
