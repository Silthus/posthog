// PROTOTYPE ONLY: a light stand-in for the Workflows scene header and tabs so a variant is judged
// next to the chrome it replaces, not in a vacuum.
import { ReactNode } from 'react'

import { IconDecisionTree } from '@posthog/icons'
import { LemonTabs } from '@posthog/lemon-ui'

const TABS = ['Workflows', 'Library', 'Channels', 'Opt-outs', 'Suppression list', 'Reputation']

export function PrototypeFrame({ children, actions }: { children: ReactNode; actions?: ReactNode }): JSX.Element {
    return (
        <div className="min-h-screen bg-primary pb-32">
            <div className="px-6 pt-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="size-9 rounded flex items-center justify-center bg-[var(--color-product-workflows-light)] text-white text-xl">
                            <IconDecisionTree />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold mb-0">Workflows</h1>
                            <p className="text-sm text-secondary mb-0">
                                Message users when it matters: email, SMS and push on any event or cohort.
                            </p>
                        </div>
                    </div>
                    {actions}
                </div>
                <LemonTabs
                    activeKey="Workflows"
                    tabs={TABS.map((tab) => ({ key: tab, label: tab, content: null }))}
                    size="small"
                />
            </div>
            <div className="px-6">{children}</div>
        </div>
    )
}
