// PROTOTYPE (throwaway): the Source card: GitHub state, repo and app pickers, the detection stream and its summary.
import { useState } from 'react'

import { IconCheck, IconGithub, IconInfo, IconRefresh } from '@posthog/icons'
import { LemonBanner, LemonButton } from '@posthog/lemon-ui'

import { dayjs } from 'lib/dayjs'

import { BRAND_FIELD_ORDER, BrandSimulation } from '../simulation'
import { DetectionList, repoLabel } from './DetectionList'
import { AppPicker, RepoPicker } from './RepoPicker'
import { Section } from './Section'

export function SourceCard({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { phase } = sim.state
    return (
        <Section
            title="Source"
            description="Where PostHog reads your brand from. You can change any value it finds."
            data-attr="email-brand-page-source"
        >
            {phase === 'connect' && <ConnectGitHub sim={sim} />}
            {phase === 'repo' && <RepoPicker sim={sim} />}
            {phase === 'app' && <AppPicker sim={sim} />}
            {phase === 'detecting' && <DetectionList sim={sim} />}
            {phase === 'review' && <DetectionSummary sim={sim} />}
        </Section>
    )
}

function ConnectGitHub({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { installOverlayOpen, installing } = sim.state
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
                <IconGithub className="text-3xl shrink-0" />
                <div className="grow basis-60">
                    <div className="font-semibold">Read your brand from GitHub</div>
                    <div className="text-sm text-secondary">
                        PostHog reads your web app manifest, Tailwind config, CSS and logo files. Read-only, it never
                        changes your code.
                    </div>
                </div>
                <LemonButton
                    type="primary"
                    icon={<IconGithub />}
                    onClick={sim.actions.openInstall}
                    loading={installOverlayOpen || installing}
                >
                    Connect GitHub
                </LemonButton>
            </div>
            <div className="text-xs text-secondary">No GitHub, or rather not? Fill in the fields below yourself.</div>
        </div>
    )
}

function DetectionSummary({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { derived, state, actions, scenario } = sim
    const [detectedAt] = useState(() => dayjs())
    const missing = derived.missingFields.length
    const undoableEdits = scenario.redetect === 'overwrite' && state.lastUndo ? state.lastUndo.edited.length : 0

    return (
        <div className="flex flex-col gap-3" data-attr="email-brand-page-summary">
            {derived.detectedAnything ? (
                <div className="flex items-start gap-2 text-sm">
                    <IconCheck className="text-success text-base shrink-0 mt-0.5" />
                    <span>
                        Read {derived.filesRead} files in <code>{repoLabel(sim)}</code>, found {derived.foundCount} of{' '}
                        {BRAND_FIELD_ORDER.length} values.
                        {missing > 0 && ` Fill in the other ${missing} below.`}{' '}
                        <span className="text-secondary">Detected at {detectedAt.format('h:mm A')}</span>
                    </span>
                </div>
            ) : (
                <div className="flex items-start gap-2 text-sm">
                    <IconInfo className="text-secondary text-base shrink-0 mt-0.5" />
                    <span>
                        We read {derived.filesRead} files in <code>{repoLabel(sim)}</code> and found no brand signals.
                        Fill it in, it takes a minute.
                    </span>
                </div>
            )}
            {state.conflicts.length > 0 && (
                <LemonBanner type="warning">
                    <div className="flex flex-col gap-2">
                        <span>
                            Detecting again found {state.conflicts.length}{' '}
                            {state.conflicts.length === 1 ? 'value' : 'values'} that differ from your edits. Pick per
                            field below, or for all of them at once.
                        </span>
                        <div className="flex flex-wrap gap-2">
                            <LemonButton
                                size="small"
                                type="secondary"
                                onClick={() => actions.resolveAllConflicts('keep')}
                            >
                                Keep all mine
                            </LemonButton>
                            <LemonButton
                                size="small"
                                type="primary"
                                onClick={() => actions.resolveAllConflicts('detected')}
                            >
                                Use all detected
                            </LemonButton>
                        </div>
                    </div>
                </LemonBanner>
            )}
            {undoableEdits > 0 && (
                <LemonBanner type="info" action={{ children: 'Undo', onClick: actions.undoRedetect }}>
                    Detecting again replaced {undoableEdits} {undoableEdits === 1 ? 'value' : 'values'} you had edited.
                </LemonBanner>
            )}
            <div className="flex flex-wrap gap-2">
                <LemonButton type="secondary" size="small" icon={<IconRefresh />} onClick={actions.detectAgain}>
                    Detect again
                </LemonButton>
                <LemonButton type="tertiary" size="small" onClick={actions.changeRepo}>
                    Change repo
                </LemonButton>
            </div>
        </div>
    )
}
