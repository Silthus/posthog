// PROTOTYPE (throwaway): the inline repo and app pickers inside the Source card.
import { useState } from 'react'

import { IconArrowRight, IconCheck, IconGithub, IconLock, IconMagicWand } from '@posthog/icons'
import { LemonButton, LemonTag } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { BrandSimulation, PrototypeApp, PrototypeRepo } from '../simulation'

export function RepoPicker({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { derived, actions } = sim
    const [browsing, setBrowsing] = useState(false)
    const [repoBeforeChange] = useState(sim.state.selectedRepo)
    const repo = derived.selectedRepo ?? derived.suggestedRepo
    const cameBackFromReview = sim.state.detectionRuns > 0

    const pick = (fullName: string): void => {
        actions.pickRepo(fullName)
        setBrowsing(false)
    }

    const cancelChange = (): void => {
        if (repoBeforeChange && repoBeforeChange !== sim.state.selectedRepo) {
            actions.pickRepo(repoBeforeChange)
        }
        actions.goTo('review')
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="text-sm">
                {browsing ? 'Pick the repo with your customer-facing app.' : 'PostHog will read this repo:'}
            </div>
            {browsing ? (
                <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto">
                    {derived.repos.map((option) => (
                        <ChoiceRow
                            key={option.fullName}
                            selected={option.fullName === repo.fullName}
                            onClick={() => pick(option.fullName)}
                        >
                            <RepoSummary repo={option} />
                        </ChoiceRow>
                    ))}
                </div>
            ) : (
                <ChoiceRow selected>
                    <RepoSummary repo={repo} />
                    {repo.suggested && <WhyList reasons={repo.suggestedWhy} />}
                </ChoiceRow>
            )}
            <div className="flex flex-wrap gap-2">
                {repo.apps.length > 1 ? (
                    <LemonButton type="primary" sideIcon={<IconArrowRight />} onClick={actions.confirmRepo}>
                        Use this repo
                    </LemonButton>
                ) : (
                    <LemonButton type="primary" icon={<IconMagicWand />} onClick={actions.confirmRepo}>
                        Detect from GitHub
                    </LemonButton>
                )}
                {derived.repos.length > 1 && (
                    <LemonButton type="secondary" onClick={() => setBrowsing(!browsing)}>
                        {browsing ? 'Back to the suggestion' : 'Pick another repo'}
                    </LemonButton>
                )}
                {cameBackFromReview && (
                    <LemonButton type="tertiary" onClick={cancelChange}>
                        Cancel
                    </LemonButton>
                )}
            </div>
        </div>
    )
}

export function AppPicker({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { derived, actions, state } = sim
    return (
        <div className="flex flex-col gap-3">
            <div className="text-sm">
                <code>{state.selectedRepo}</code> holds {derived.apps.length} apps. Which one looks the way your
                customers see you?
            </div>
            <div className="flex flex-col gap-1.5">
                {derived.apps.map((app) => (
                    <ChoiceRow
                        key={app.path}
                        selected={app.path === state.selectedApp}
                        onClick={() => actions.pickApp(app.path)}
                    >
                        <AppSummary app={app} />
                    </ChoiceRow>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
                <LemonButton
                    type="primary"
                    icon={<IconMagicWand />}
                    onClick={actions.confirmApp}
                    disabledReason={state.selectedApp ? undefined : 'Pick an app first'}
                >
                    Detect from {state.selectedApp ?? 'this app'}
                </LemonButton>
                <LemonButton type="tertiary" onClick={actions.changeRepo}>
                    Change repo
                </LemonButton>
            </div>
        </div>
    )
}

interface ChoiceRowProps {
    selected: boolean
    onClick?: () => void
    children: React.ReactNode
}

function ChoiceRow({ selected, onClick, children }: ChoiceRowProps): JSX.Element {
    const className = cn(
        'flex flex-col gap-2 rounded border p-3 text-left w-full',
        selected && 'border-accent bg-accent-highlight-secondary',
        onClick && 'cursor-pointer hover:bg-fill-button-tertiary-hover'
    )
    if (!onClick) {
        return <div className={className}>{children}</div>
    }
    return (
        <button type="button" className={className} onClick={onClick} aria-pressed={selected}>
            {children}
        </button>
    )
}

export function RepoSummary({ repo }: { repo: PrototypeRepo }): JSX.Element {
    return (
        <div className="flex items-start gap-2.5 min-w-0">
            <IconGithub className="text-lg mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold font-mono text-sm break-all">{repo.fullName}</span>
                    {repo.suggested && (
                        <LemonTag type="highlight" size="small">
                            Suggested
                        </LemonTag>
                    )}
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-secondary">
                    {repo.description && <span>{repo.description}</span>}
                    <span>{repo.language}</span>
                    <span>Pushed {repo.pushedAgo}</span>
                    {repo.private && (
                        <span className="flex items-center gap-0.5">
                            <IconLock /> Private
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

function AppSummary({ app }: { app: PrototypeApp }): JSX.Element {
    return (
        <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold font-mono text-sm">{app.path}</span>
                <span className="text-xs text-secondary">{app.framework}</span>
                {app.suggested && (
                    <LemonTag type="highlight" size="small">
                        Suggested
                    </LemonTag>
                )}
            </div>
            <div className="text-xs text-secondary">{app.why}</div>
        </div>
    )
}

function WhyList({ reasons }: { reasons: string[] }): JSX.Element {
    return (
        <ul className="m-0 pl-7 list-none flex flex-col gap-1 text-xs text-secondary">
            {reasons.map((reason) => (
                <li key={reason} className="flex items-center gap-1.5">
                    <IconCheck className="text-success shrink-0" /> {reason}
                </li>
            ))}
        </ul>
    )
}
