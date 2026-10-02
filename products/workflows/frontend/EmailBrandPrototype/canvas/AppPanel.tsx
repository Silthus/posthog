// PROTOTYPE (throwaway): the panel for picking one app inside a mono-repo.
import { IconArrowLeft, IconArrowRight } from '@posthog/icons'
import { LemonButton, LemonTag } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { BrandSimulation } from '../simulation'
import { PanelLayout } from './PanelLayout'

export function AppPanel({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { derived, state, actions } = sim
    return (
        <PanelLayout
            title="Which app has your brand?"
            description={`${state.selectedRepo} holds ${derived.apps.length} apps. We picked the one your customers see.`}
            footer={
                <>
                    <LemonButton
                        type="primary"
                        fullWidth
                        center
                        sideIcon={<IconArrowRight />}
                        onClick={actions.confirmApp}
                        disabledReason={state.selectedApp ? undefined : 'Pick an app'}
                    >
                        Read {state.selectedApp ?? 'this app'}
                    </LemonButton>
                    <LemonButton
                        type="tertiary"
                        fullWidth
                        center
                        size="small"
                        icon={<IconArrowLeft />}
                        onClick={() => actions.goTo('repo')}
                    >
                        Pick another repo
                    </LemonButton>
                </>
            }
        >
            <div className="flex flex-col gap-2" role="radiogroup">
                {derived.apps.map((app) => {
                    const selected = app.path === state.selectedApp
                    return (
                        <button
                            key={app.path}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => actions.pickApp(app.path)}
                            className={cn(
                                'text-left rounded-lg border p-3 flex flex-col gap-1 cursor-pointer bg-surface-primary hover:bg-surface-secondary',
                                selected &&
                                    'border-2 border-accent bg-accent-highlight-secondary hover:bg-accent-highlight-secondary'
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-sm">{app.path}</span>
                                {app.suggested && (
                                    <LemonTag size="small" type="highlight">
                                        Suggested
                                    </LemonTag>
                                )}
                            </div>
                            <div className="text-xs text-secondary">
                                {app.framework} · {app.why}
                            </div>
                        </button>
                    )
                })}
            </div>
        </PanelLayout>
    )
}
