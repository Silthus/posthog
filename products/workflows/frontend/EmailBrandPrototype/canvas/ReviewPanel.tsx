import { useState } from 'react'

// PROTOTYPE (throwaway): the panel for checking and editing the brand next to the live email.
import { IconGithub, IconMagicWand, IconRefresh, IconWarning } from '@posthog/icons'
import { LemonBanner, LemonButton } from '@posthog/lemon-ui'

import { HedgehogMagnifyingGlass } from '../shared/hoggies'
import { BRAND_FIELD_ORDER, BrandFieldKey, BrandSimulation } from '../simulation'
import { FieldRow, FocusRequest } from './FieldRow'
import { PanelLayout } from './PanelLayout'

interface ReviewPanelProps {
    sim: BrandSimulation
    highlighted: BrandFieldKey | null
    focusRequest: FocusRequest | null
    onHover: (key: BrandFieldKey | null) => void
}

export function ReviewPanel({ sim, highlighted, focusRequest, onHover }: ReviewPanelProps): JSX.Element {
    const { state, actions } = sim
    const [dismissedUndoRun, setDismissedUndoRun] = useState<number | null>(null)
    const showUndo =
        !!state.lastUndo && sim.scenario.redetect === 'overwrite' && dismissedUndoRun !== state.detectionRuns
    const creating = state.phase === 'creating'

    return (
        <PanelLayout
            {...reviewIntro(sim)}
            footer={
                <>
                    <LemonButton
                        type="primary"
                        fullWidth
                        center
                        icon={<IconMagicWand />}
                        onClick={actions.createTemplate}
                        loading={creating}
                        disabledReason={state.brand.name.trim() ? undefined : 'Add your brand name first'}
                        data-attr="email-brand-canvas-create"
                    >
                        Save brand and create starter template
                    </LemonButton>
                    {state.selectedRepo && (
                        <div className="flex flex-wrap justify-center gap-1">
                            <LemonButton
                                size="small"
                                type="tertiary"
                                icon={<IconGithub />}
                                onClick={actions.changeRepo}
                                disabledReason={creating ? 'Saving' : undefined}
                            >
                                Change repo
                            </LemonButton>
                            <LemonButton
                                size="small"
                                type="tertiary"
                                icon={<IconRefresh />}
                                onClick={actions.detectAgain}
                                disabledReason={creating ? 'Saving' : undefined}
                            >
                                Detect again
                            </LemonButton>
                        </div>
                    )}
                </>
            }
        >
            {!state.selectedRepo && <ConnectLater sim={sim} />}
            {showUndo && (
                <LemonBanner
                    type="info"
                    action={{ children: 'Undo', onClick: actions.undoRedetect }}
                    onClose={() => setDismissedUndoRun(state.detectionRuns)}
                >
                    Detected again and replaced your values with what we found.
                </LemonBanner>
            )}
            {state.conflicts.length > 0 && (
                <div className="flex flex-col gap-2 rounded border border-warning bg-warning-highlight p-3 text-sm">
                    <div className="flex items-start gap-2">
                        <IconWarning className="text-warning text-base shrink-0 mt-0.5" />
                        <span>
                            {state.conflicts.length === 1
                                ? 'One value you edited differs from what we just found.'
                                : `${state.conflicts.length} values you edited differ from what we just found.`}{' '}
                            Pick one below, or decide for all of them.
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        <LemonButton size="xsmall" type="secondary" onClick={() => actions.resolveAllConflicts('keep')}>
                            Keep all mine
                        </LemonButton>
                        <LemonButton
                            size="xsmall"
                            type="secondary"
                            onClick={() => actions.resolveAllConflicts('detected')}
                        >
                            Use all detected
                        </LemonButton>
                    </div>
                </div>
            )}
            <div className="flex flex-col gap-1 -mx-1">
                {BRAND_FIELD_ORDER.map((key) => (
                    <FieldRow
                        key={key}
                        sim={sim}
                        fieldKey={key}
                        highlighted={highlighted === key}
                        focusRequest={focusRequest}
                        onHover={onHover}
                    />
                ))}
            </div>
        </PanelLayout>
    )
}

function reviewIntro(sim: BrandSimulation): { title: string; description: JSX.Element | string } {
    const { state, derived } = sim
    if (!state.selectedRepo) {
        return {
            title: 'Fill in your Email brand',
            description: 'It takes a minute. Click any part of the email to jump to its value.',
        }
    }
    if (!derived.detectedAnything) {
        return {
            title: 'No brand signals found',
            description: (
                <div className="flex items-start gap-2">
                    <HedgehogMagnifyingGlass className="w-12 shrink-0" />
                    <span>
                        We read {derived.filesRead} files in {state.selectedRepo} and found no brand signals. Fill it
                        in, it takes a minute.
                    </span>
                </div>
            ),
        }
    }
    const missing = derived.missingFields.length
    return {
        title: 'Here is your Email brand',
        description: `Found ${derived.foundCount} of ${BRAND_FIELD_ORDER.length} in ${derived.sourceSummary}. ${
            missing ? `${missing} left for you, marked below.` : 'Check it over and you are set.'
        }`,
    }
}

function ConnectLater({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { state, actions } = sim
    const waiting = state.installOverlayOpen || state.installing
    return (
        <LemonButton
            type="secondary"
            size="small"
            icon={<IconGithub />}
            onClick={state.githubConnected ? actions.changeRepo : actions.openInstall}
            loading={waiting}
        >
            Read it from GitHub instead
        </LemonButton>
    )
}
