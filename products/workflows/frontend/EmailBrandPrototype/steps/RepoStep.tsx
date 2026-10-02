// PROTOTYPE (throwaway): step two, confirm the suggested repo (or pick another), then the app inside a mono-repo.
import { useState } from 'react'

import { IconArrowRight, IconCheck, IconLock, IconSearch } from '@posthog/icons'
import { LemonButton, LemonInput, LemonTag, Link } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { HedgehogMagnifyingGlass, HedgehogWizard } from '../shared/hoggies'
import { BrandSimulation, PrototypeApp, PrototypeRepo } from '../simulation'
import { StepScreen } from './StepScreen'

function ChoiceCard({
    selected,
    onClick,
    children,
}: {
    selected: boolean
    onClick: () => void
    children: React.ReactNode
}): JSX.Element {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={cn(
                'w-full text-left rounded-lg border p-3 flex gap-3 items-start cursor-pointer bg-surface-primary hover:border-accent',
                selected && 'border-accent border-2 bg-accent-highlight-secondary'
            )}
        >
            <span
                className={cn(
                    'mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center text-xs',
                    selected ? 'border-accent bg-accent text-white' : 'border-primary'
                )}
            >
                {selected && <IconCheck />}
            </span>
            <span className="grow min-w-0 flex flex-col gap-1">{children}</span>
        </button>
    )
}

function RepoMeta({ repo }: { repo: PrototypeRepo }): JSX.Element {
    return (
        <span className="text-xs text-secondary flex flex-wrap items-center gap-x-2">
            <span>{repo.language}</span>
            <span>pushed {repo.pushedAgo}</span>
            {repo.private && (
                <span className="flex items-center gap-0.5">
                    <IconLock /> private
                </span>
            )}
        </span>
    )
}

function OtherRepos({ sim }: { sim: BrandSimulation }): JSX.Element {
    const [search, setSearch] = useState('')
    const others = sim.derived.repos.filter((repo) => !repo.suggested)
    const matching = others.filter((repo) =>
        `${repo.fullName} ${repo.description}`.toLowerCase().includes(search.toLowerCase())
    )
    return (
        <div className="flex flex-col gap-2">
            {others.length > 4 && (
                <LemonInput
                    type="search"
                    prefix={<IconSearch />}
                    placeholder="Search repos"
                    value={search}
                    onChange={setSearch}
                    autoFocus
                />
            )}
            <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                {matching.map((repo) => (
                    <ChoiceCard
                        key={repo.fullName}
                        selected={sim.state.selectedRepo === repo.fullName}
                        onClick={() => sim.actions.pickRepo(repo.fullName)}
                    >
                        <span className="font-semibold font-mono text-sm truncate">{repo.fullName}</span>
                        {repo.description && (
                            <span className="text-xs text-secondary truncate">{repo.description}</span>
                        )}
                        <RepoMeta repo={repo} />
                    </ChoiceCard>
                ))}
                {matching.length === 0 && (
                    <div className="text-sm text-secondary text-center py-3">No repo matches "{search}".</div>
                )}
            </div>
        </div>
    )
}

export function RepoStep({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { suggestedRepo, repos } = sim.derived
    const selected = sim.state.selectedRepo
    const pickedOther = !!selected && selected !== suggestedRepo.fullName
    const [showOthers, setShowOthers] = useState(pickedOther)
    const otherCount = repos.length - 1
    return (
        <StepScreen
            phase="repo"
            hoggie={HedgehogMagnifyingGlass}
            title={repos.length === 1 ? 'Read your brand from this repo?' : 'Is this the repo with your brand?'}
            subtitle="Pick the one with your website or web app. That's where the logo and colors live."
            primary={
                <LemonButton
                    type="primary"
                    size="large"
                    sideIcon={<IconArrowRight />}
                    onClick={sim.actions.confirmRepo}
                    disabledReason={selected ? undefined : 'Pick a repo first'}
                    data-attr="email-brand-steps-confirm-repo"
                >
                    {selected ? `Read ${selected}` : 'Read this repo'}
                </LemonButton>
            }
        >
            <div className="flex flex-col gap-3">
                <ChoiceCard
                    selected={selected === suggestedRepo.fullName}
                    onClick={() => sim.actions.pickRepo(suggestedRepo.fullName)}
                >
                    <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold font-mono text-base">{suggestedRepo.fullName}</span>
                        {repos.length > 1 && (
                            <LemonTag type="success" size="small">
                                Suggested
                            </LemonTag>
                        )}
                    </span>
                    <RepoMeta repo={suggestedRepo} />
                    <ul className="m-0 mt-1 p-0 list-none flex flex-col gap-0.5">
                        {suggestedRepo.suggestedWhy.map((reason) => (
                            <li key={reason} className="text-sm flex items-center gap-1.5">
                                <IconCheck className="text-success shrink-0" />
                                {reason}
                            </li>
                        ))}
                    </ul>
                </ChoiceCard>
                {otherCount > 0 &&
                    (showOthers ? (
                        <OtherRepos sim={sim} />
                    ) : (
                        <div className="text-center">
                            <Link onClick={() => setShowOthers(true)} data-attr="email-brand-steps-other-repos">
                                Not this one? Pick from {otherCount} other {otherCount === 1 ? 'repo' : 'repos'}
                            </Link>
                        </div>
                    ))}
            </div>
        </StepScreen>
    )
}

function AppChoice({
    app,
    selected,
    onClick,
}: {
    app: PrototypeApp
    selected: boolean
    onClick: () => void
}): JSX.Element {
    return (
        <ChoiceCard selected={selected} onClick={onClick}>
            <span className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold font-mono text-sm">{app.path}</span>
                <span className="text-xs text-secondary">{app.framework}</span>
                {app.suggested && (
                    <LemonTag type="success" size="small">
                        Suggested
                    </LemonTag>
                )}
            </span>
            <span className={cn('text-sm', app.suggested ? 'text-primary' : 'text-secondary')}>{app.why}</span>
        </ChoiceCard>
    )
}

export function AppStep({ sim }: { sim: BrandSimulation }): JSX.Element {
    const selected = sim.state.selectedApp
    return (
        <StepScreen
            phase="app"
            hoggie={HedgehogWizard}
            title="Which app looks like your brand?"
            subtitle={`${sim.state.selectedRepo} has ${sim.derived.apps.length} apps. Pick the one your customers see.`}
            primary={
                <LemonButton
                    type="primary"
                    size="large"
                    sideIcon={<IconArrowRight />}
                    onClick={sim.actions.confirmApp}
                    disabledReason={selected ? undefined : 'Pick an app first'}
                    data-attr="email-brand-steps-confirm-app"
                >
                    {selected ? `Read ${selected}` : 'Read this app'}
                </LemonButton>
            }
            secondary={<Link onClick={sim.actions.changeRepo}>Pick a different repo</Link>}
        >
            <div className="flex flex-col gap-1.5">
                {sim.derived.apps.map((app) => (
                    <AppChoice
                        key={app.path}
                        app={app}
                        selected={selected === app.path}
                        onClick={() => sim.actions.pickApp(app.path)}
                    />
                ))}
            </div>
        </StepScreen>
    )
}
