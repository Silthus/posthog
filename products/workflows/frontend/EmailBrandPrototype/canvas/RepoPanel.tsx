import { useEffect, useState } from 'react'

// PROTOTYPE (throwaway): the panel for picking which repo holds the brand, with the suggestion preselected.
import { IconArrowRight, IconCheck, IconLock, IconSearch } from '@posthog/icons'
import { LemonButton, LemonInput, LemonTag } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { BrandSimulation, PrototypeRepo } from '../simulation'
import { PanelLayout } from './PanelLayout'

export function RepoPanel({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { derived, state, actions } = sim
    const [browsing, setBrowsing] = useState(false)
    const [search, setSearch] = useState('')
    const selected = derived.selectedRepo ?? derived.suggestedRepo
    const others = derived.repos.filter((repo) => repo.fullName.toLowerCase().includes(search.toLowerCase()))

    useEffect(() => {
        if (!state.selectedRepo) {
            actions.pickRepo(derived.suggestedRepo.fullName)
        }
    }, [state.selectedRepo, actions, derived.suggestedRepo.fullName])

    return (
        <PanelLayout
            title="Pick the repo with your brand"
            description={
                derived.repos.length > 1 ? `We picked the likeliest of your ${derived.repos.length} repos.` : undefined
            }
            footer={
                <>
                    <LemonButton
                        type="primary"
                        fullWidth
                        center
                        sideIcon={<IconArrowRight />}
                        onClick={actions.confirmRepo}
                        disabledReason={state.selectedRepo ? undefined : 'Pick a repo'}
                    >
                        Read {selected.fullName}
                    </LemonButton>
                    {state.detectionRuns > 0 && (
                        <LemonButton
                            type="tertiary"
                            fullWidth
                            center
                            size="small"
                            onClick={() => actions.goTo('review')}
                        >
                            Back to your brand
                        </LemonButton>
                    )}
                </>
            }
        >
            <div className="rounded-lg border-2 border-accent bg-accent-highlight-secondary p-3 flex flex-col gap-2">
                <RepoSummary repo={selected} />
                {selected.suggestedWhy.length > 0 && (
                    <ul className="m-0 p-0 list-none flex flex-col gap-1 text-xs">
                        {selected.suggestedWhy.map((why) => (
                            <li key={why} className="flex items-center gap-1.5">
                                <IconCheck className="text-success shrink-0" /> {why}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {derived.repos.length > 1 && !browsing && (
                <LemonButton type="tertiary" size="small" onClick={() => setBrowsing(true)}>
                    Pick another repo
                </LemonButton>
            )}
            {browsing && (
                <div className="flex flex-col gap-2">
                    {derived.repos.length > 5 && (
                        <LemonInput
                            size="small"
                            type="search"
                            placeholder="Find a repo"
                            prefix={<IconSearch />}
                            value={search}
                            onChange={setSearch}
                            autoFocus
                        />
                    )}
                    <div className="flex flex-col rounded border divide-y overflow-hidden">
                        {others.map((repo) => (
                            <button
                                key={repo.fullName}
                                type="button"
                                onClick={() => actions.pickRepo(repo.fullName)}
                                className={cn(
                                    'text-left px-3 py-2 cursor-pointer bg-surface-primary hover:bg-surface-secondary',
                                    repo.fullName === state.selectedRepo && 'bg-accent-highlight-secondary'
                                )}
                            >
                                <RepoSummary repo={repo} compact />
                            </button>
                        ))}
                        {others.length === 0 && (
                            <div className="px-3 py-2 text-xs text-secondary">No repo matches "{search}".</div>
                        )}
                    </div>
                </div>
            )}
        </PanelLayout>
    )
}

function RepoSummary({ repo, compact }: { repo: PrototypeRepo; compact?: boolean }): JSX.Element {
    return (
        <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
                <span className={cn('font-semibold truncate', compact ? 'text-sm' : 'text-base')}>{repo.fullName}</span>
                {repo.private && <IconLock className="text-secondary shrink-0" />}
                {repo.suggested && compact && (
                    <LemonTag size="small" type="highlight">
                        Suggested
                    </LemonTag>
                )}
            </div>
            <div className="text-xs text-secondary truncate">
                {[repo.language, `pushed ${repo.pushedAgo}`, repo.description].filter(Boolean).join(' · ')}
            </div>
        </div>
    )
}
