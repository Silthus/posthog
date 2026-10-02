// PROTOTYPE (throwaway): step four, the one dense screen: the Email brand form next to a live preview of the starter email.
import { useState } from 'react'

import { IconArrowRight, IconGithub, IconRefresh } from '@posthog/icons'
import { LemonBanner, LemonButton, Link } from '@posthog/lemon-ui'

import { buildStarterEmailHtml } from '../shared/brandEmail'
import { EmailFrame } from '../shared/EmailFrame'
import { HedgehogDeskWizard, HedgehogStampApproved, HedgehogSuccess } from '../shared/hoggies'
import { BRAND_FIELD_LABELS, BRAND_FIELD_ORDER, BrandSimulation } from '../simulation'
import { BrandFields } from './BrandFields'
import { ProgressStrip } from './StepScreen'

function listOf(items: string[]): string {
    return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function ReviewHeading({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { detectionRuns, selectedRepo } = sim.state
    const { detectedAnything, foundCount, missingFields, sourceSummary, filesRead } = sim.derived
    const allFound = foundCount === BRAND_FIELD_ORDER.length
    const Hoggie = !detectedAnything ? HedgehogDeskWizard : allFound ? HedgehogStampApproved : HedgehogSuccess
    const title = !detectedAnything
        ? 'Fill in your Email brand'
        : `Here's the ${sim.state.brand.name || 'brand'} we found`
    const subtitle =
        detectionRuns === 0
            ? 'Add your name, logo, colors and font. The preview updates as you type.'
            : !detectedAnything
              ? `We read ${filesRead} files in ${selectedRepo} and found no brand signals. Fill it in, it takes a minute.`
              : allFound
                ? `All ${foundCount} values came from ${sourceSummary}. Hover a tag to see the exact line. Change anything that looks off.`
                : `Found ${foundCount} of ${BRAND_FIELD_ORDER.length} in ${sourceSummary}. Fill in ${listOf(missingFields.map((key) => BRAND_FIELD_LABELS[key].toLowerCase()))}.`
    return (
        <div className="flex items-start gap-4">
            <Hoggie className="w-16 h-16 @md:w-20 @md:h-20 shrink-0" loading="eager" />
            <div className="flex flex-col gap-1 min-w-0">
                <h1 className="m-0 text-2xl @md:text-3xl font-bold leading-tight">{title}</h1>
                <p className="m-0 text-secondary">{subtitle}</p>
            </div>
        </div>
    )
}

function DetectAgainButton({ sim }: { sim: BrandSimulation }): JSX.Element {
    const detecting = sim.state.phase === 'detecting'
    if (sim.state.detectionRuns === 0) {
        return (
            <LemonButton
                size="small"
                type="secondary"
                icon={<IconGithub />}
                onClick={sim.state.githubConnected ? sim.actions.changeRepo : () => sim.actions.goTo('connect')}
            >
                Detect from GitHub
            </LemonButton>
        )
    }
    return (
        <LemonButton
            size="small"
            type="secondary"
            icon={<IconRefresh />}
            onClick={sim.actions.detectAgain}
            loading={detecting}
            data-attr="email-brand-steps-detect-again"
        >
            Detect again
        </LemonButton>
    )
}

function RedetectBanners({ sim }: { sim: BrandSimulation }): JSX.Element | null {
    const [dismissedRun, setDismissedRun] = useState(0)
    const { conflicts, lastUndo, detectionRuns, selectedRepo } = sim.state
    if (conflicts.length > 0) {
        return (
            <LemonBanner type="warning">
                <div className="flex flex-col gap-2">
                    <span>
                        {selectedRepo} has {conflicts.length === 1 ? 'a different value' : `different values`} for{' '}
                        {listOf(conflicts.map((c) => BRAND_FIELD_LABELS[c.key].toLowerCase()))}, which you edited. Pick
                        one below, or:
                    </span>
                    <span className="flex gap-2 flex-wrap">
                        <LemonButton
                            size="small"
                            type="secondary"
                            onClick={() => sim.actions.resolveAllConflicts('keep')}
                        >
                            Keep all mine
                        </LemonButton>
                        <LemonButton
                            size="small"
                            type="secondary"
                            onClick={() => sim.actions.resolveAllConflicts('detected')}
                        >
                            Use all detected
                        </LemonButton>
                    </span>
                </div>
            </LemonBanner>
        )
    }
    if (!lastUndo || dismissedRun === detectionRuns || sim.scenario.redetect === 'ask') {
        return null
    }
    if (sim.scenario.redetect === 'keep') {
        return (
            <LemonBanner type="info" onClose={() => setDismissedRun(detectionRuns)}>
                Detected again. Values you edited stayed as they were.
            </LemonBanner>
        )
    }
    return (
        <LemonBanner
            type="info"
            onClose={() => setDismissedRun(detectionRuns)}
            action={{ children: 'Undo', onClick: sim.actions.undoRedetect, 'data-attr': 'email-brand-steps-undo' }}
        >
            Detected again and replaced your edits with what's in {selectedRepo}.
        </LemonBanner>
    )
}

function StarterPreview({ sim }: { sim: BrandSimulation }): JSX.Element {
    const creating = sim.state.phase === 'creating'
    return (
        <div className="flex flex-col gap-3 items-center @5xl:sticky @5xl:top-4">
            <div className="w-full flex items-baseline justify-between gap-2 max-w-[408px]">
                <span className="text-sm font-semibold">Your starter email</span>
                <span className="text-xs text-secondary">Live preview</span>
            </div>
            <EmailFrame
                html={buildStarterEmailHtml(sim.state.brand)}
                scale={0.6}
                height={760}
                className="rounded-lg border shadow-sm"
            />
            <div className="w-full max-w-[408px] flex flex-col gap-2">
                <LemonButton
                    type="primary"
                    size="large"
                    fullWidth
                    center
                    sideIcon={<IconArrowRight />}
                    onClick={sim.actions.createTemplate}
                    loading={creating}
                    disabledReason={sim.state.conflicts.length > 0 ? 'Pick a value for each conflict first' : undefined}
                    data-attr="email-brand-steps-create-template"
                >
                    Save brand and create starter template
                </LemonButton>
                <span className="text-xs text-secondary text-center">
                    The template is a copy. Changing your brand later won't change it.
                </span>
            </div>
        </div>
    )
}

export function ReviewStep({ sim }: { sim: BrandSimulation }): JSX.Element {
    return (
        <div className="flex flex-col px-4 py-5 @md:px-8 gap-6" data-attr="email-brand-steps-review">
            <ProgressStrip phase="review" />
            <div className="w-full max-w-6xl mx-auto grid grid-cols-1 @5xl:grid-cols-[minmax(0,1fr)_auto] gap-8 items-start">
                <div className="flex flex-col gap-5 min-w-0">
                    <ReviewHeading sim={sim} />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <DetectAgainButton sim={sim} />
                        {sim.state.detectionRuns > 0 && (
                            <span className="text-sm">
                                <Link onClick={sim.actions.changeRepo} data-attr="email-brand-steps-change-repo">
                                    Change repo
                                </Link>
                            </span>
                        )}
                    </div>
                    <RedetectBanners sim={sim} />
                    <BrandFields sim={sim} />
                </div>
                <StarterPreview sim={sim} />
            </div>
        </div>
    )
}
