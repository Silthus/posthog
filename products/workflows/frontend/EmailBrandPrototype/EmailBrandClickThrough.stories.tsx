import type { Meta, StoryFn } from '@storybook/react'
import { useEffect, useState } from 'react'
// @ts-expect-error -- the workflows package does not list react-toastify; Vite resolves it from frontend/ at runtime
import { Slide, ToastContainer } from 'react-toastify'

import { LemonTag } from '@posthog/lemon-ui'

import { ChannelsEntry } from './entry/ChannelsEntry'
import { TemplateLibraryEntry } from './entry/TemplateLibraryEntry'
import { GitHubInstallOverlay } from './shared/GitHubInstallOverlay'
import { BrandScenario, BrandSimulation, SCENARIO_LABELS, useBrandSimulation } from './simulation'
import { CLICK_THROUGH_VARIANTS, DEFAULT_CLICK_THROUGH_VARIANT } from './variants'
import { VariantSwitcher } from './VariantSwitcher'

// PROTOTYPE (throwaway): click through the whole Email brand flow in three different shapes.
// The floating bar switches variant and scenario. Arrow keys cycle variants when no input is focused.

interface ClickThroughArgs extends BrandScenario {
    variant: string
    width: 'full' | 'narrow'
}

const DEFAULT_SCENARIO: BrandScenario = {
    entry: 'library',
    github: 'not_connected',
    repos: 'many',
    outcome: 'full',
    redetect: 'ask',
    speed: 1,
}

const meta: Meta<ClickThroughArgs> = {
    title: 'Products/Workflows/Email brand prototype/Click-through',
    parameters: { layout: 'fullscreen', viewMode: 'story', testOptions: { skip: true } },
    argTypes: {
        variant: { control: 'radio', options: CLICK_THROUGH_VARIANTS.map((v) => v.key) },
        entry: { control: 'radio', options: Object.keys(SCENARIO_LABELS.entry) },
        github: { control: 'radio', options: Object.keys(SCENARIO_LABELS.github) },
        repos: { control: 'radio', options: Object.keys(SCENARIO_LABELS.repos) },
        outcome: { control: 'radio', options: Object.keys(SCENARIO_LABELS.outcome) },
        redetect: { control: 'radio', options: Object.keys(SCENARIO_LABELS.redetect) },
        speed: { control: 'radio', options: [1, 4] },
        width: { control: 'radio', options: ['full', 'narrow'], description: '"narrow" pins the scene to 520px' },
    },
    args: { variant: DEFAULT_CLICK_THROUGH_VARIANT, ...DEFAULT_SCENARIO, width: 'full' },
}
export default meta

const CRUMBS: Record<BrandScenario['entry'], string[]> = {
    library: ['Workflows', 'Templates'],
    channels: ['Workflows', 'Channels'],
}

function SceneChrome({
    width,
    entry,
    children,
}: {
    width: 'full' | 'narrow'
    entry: BrandScenario['entry']
    children: React.ReactNode
}): JSX.Element {
    return (
        <div className="min-h-screen bg-primary flex flex-col">
            <div className="flex items-center gap-2 px-4 h-10 border-b bg-surface-primary text-xs text-secondary">
                {CRUMBS[entry].map((crumb) => (
                    <span key={crumb} className="flex items-center gap-2">
                        <span>{crumb}</span>
                        <span>/</span>
                    </span>
                ))}
                <span className="text-primary font-medium">Email brand</span>
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
    const [scenario, setScenario] = useState<BrandScenario>(args)
    const [runId, setRunId] = useState(0)
    useEffect(() => setVariantKey(args.variant), [args.variant])
    useEffect(
        () =>
            setScenario({
                entry: args.entry,
                github: args.github,
                repos: args.repos,
                outcome: args.outcome,
                redetect: args.redetect,
                speed: args.speed,
            }),
        [args.entry, args.github, args.repos, args.outcome, args.redetect, args.speed]
    )
    const current = CLICK_THROUGH_VARIANTS.find((v) => v.key === variantKey) ?? CLICK_THROUGH_VARIANTS[0]

    return (
        <SceneChrome width={args.width} entry={scenario.entry}>
            <SimulatedVariant
                key={`${runId}-${scenario.entry}-${scenario.github}-${scenario.repos}-${scenario.outcome}`}
                scenario={scenario}
                Component={current.Component}
            >
                {(reset) => (
                    <VariantSwitcher
                        variants={CLICK_THROUGH_VARIANTS}
                        current={current}
                        onVariantChange={setVariantKey}
                        scenario={scenario}
                        onScenarioChange={setScenario}
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
    scenario: BrandScenario
    Component: (props: { sim: BrandSimulation }) => JSX.Element
    children: (reset: () => void) => JSX.Element
}): JSX.Element {
    const sim = useBrandSimulation(scenario)
    useEffect(() => {
        ;(window as unknown as { __emailBrandSim?: BrandSimulation }).__emailBrandSim = sim
    }, [sim])
    const atEntry = sim.state.phase === 'entry'
    return (
        <>
            {atEntry && scenario.entry === 'library' && (
                <TemplateLibraryEntry onStart={sim.actions.start} brandSaved={sim.state.brandSaved} />
            )}
            {atEntry && scenario.entry === 'channels' && (
                <ChannelsEntry onStart={sim.actions.start} brandSaved={sim.state.brandSaved} brand={sim.state.brand} />
            )}
            {!atEntry && <Component sim={sim} />}
            <GitHubInstallOverlay sim={sim} />
            {children(sim.actions.reset)}
        </>
    )
}

const Template: StoryFn<ClickThroughArgs> = (args) => <ClickThroughScene {...args} />

export const ClickThrough = Template.bind({})
ClickThrough.parameters = {
    docs: {
        description: {
            story: 'Use the floating bar (or ← →) to switch variants. Change the knobs to see GitHub not connected, mono-repos, and partial or empty detection.',
        },
    },
}

export const Steps = Template.bind({})
Steps.args = { variant: 'steps' }

export const Canvas = Template.bind({})
Canvas.args = { variant: 'canvas' }

export const Page = Template.bind({})
Page.args = { variant: 'page' }

export const StepsNarrow = Template.bind({})
StepsNarrow.args = { variant: 'steps', width: 'narrow' }
