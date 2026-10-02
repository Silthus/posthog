import { useState } from 'react'

// PROTOTYPE (throwaway): stands in for the GitHub app install popup the authorizeUrl flow opens.
import { IconGithub, IconLock } from '@posthog/icons'
import { LemonButton, Spinner } from '@posthog/lemon-ui'

import { LemonRadio } from 'lib/lemon-ui/LemonRadio'

import { BrandSimulation } from '../simulation'

export function GitHubInstallOverlay({ sim }: { sim: BrandSimulation }): JSX.Element | null {
    const [scope, setScope] = useState<'all' | 'selected'>('all')
    if (!sim.state.installOverlayOpen) {
        return null
    }
    return (
        <div
            className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-6"
            data-attr="email-brand-github-popup"
        >
            <div className="w-full max-w-md rounded-lg overflow-hidden shadow-2xl bg-white text-[#1f2328] font-sans">
                <div className="flex items-center gap-2 px-4 py-2 bg-[#f6f8fa] border-b border-[#d0d7de] text-xs text-[#57606a]">
                    <IconLock /> github.com/apps/posthog/installations/new
                </div>
                <div className="p-6 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <IconGithub className="text-3xl" />
                        <div>
                            <div className="font-semibold text-lg leading-tight">Install PostHog</div>
                            <div className="text-sm text-[#57606a]">on the acme organization</div>
                        </div>
                    </div>
                    <div className="text-sm">
                        <div className="font-semibold mb-2">Repository access</div>
                        <LemonRadio
                            value={scope}
                            onChange={setScope}
                            options={[
                                { value: 'all', label: 'All repositories' },
                                { value: 'selected', label: 'Only select repositories' },
                            ]}
                        />
                    </div>
                    <div className="text-xs text-[#57606a] border border-[#d0d7de] rounded p-3">
                        <div className="font-semibold text-[#1f2328] mb-1">with these permissions</div>
                        Read access to code and metadata. Read and write access to pull requests.
                    </div>
                    <div className="flex gap-2 justify-end">
                        <LemonButton
                            type="secondary"
                            onClick={sim.actions.cancelInstall}
                            disabledReason={sim.state.installing ? 'Installing' : undefined}
                        >
                            Cancel
                        </LemonButton>
                        <LemonButton
                            type="primary"
                            status="default"
                            onClick={sim.actions.approveInstall}
                            loading={sim.state.installing}
                            className="bg-[#1f883d]"
                        >
                            {sim.state.installing ? <Spinner /> : null} Install
                        </LemonButton>
                    </div>
                </div>
            </div>
        </div>
    )
}
