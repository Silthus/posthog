// PROTOTYPE (throwaway): the panel when GitHub is not connected yet.
import { IconGithub, IconLock } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { BrandSimulation } from '../simulation'
import { PanelLayout } from './PanelLayout'

export function ConnectPanel({ sim }: { sim: BrandSimulation }): JSX.Element {
    const waiting = sim.state.installOverlayOpen || sim.state.installing
    return (
        <PanelLayout
            title="Make this email yours"
            description="PostHog reads your name, logo, colors and font from one GitHub repo and paints them onto this email."
            footer={
                <>
                    <LemonButton
                        type="primary"
                        fullWidth
                        center
                        icon={<IconGithub />}
                        onClick={sim.actions.openInstall}
                        loading={waiting}
                    >
                        {waiting ? 'Waiting for GitHub' : 'Connect GitHub'}
                    </LemonButton>
                    <LemonButton
                        type="tertiary"
                        fullWidth
                        center
                        size="small"
                        onClick={() => sim.actions.goTo('review')}
                        disabledReason={waiting ? 'Finish or cancel the GitHub step first' : undefined}
                    >
                        Skip, I'll fill it in by hand
                    </LemonButton>
                </>
            }
        >
            <div className="flex gap-2 rounded border bg-surface-secondary p-3 text-xs text-secondary">
                <IconLock className="text-base shrink-0 mt-0.5" />
                <span>
                    Read-only. We look at package.json, your web app manifest, theme files and logo files. We never
                    change your code.
                </span>
            </div>
        </PanelLayout>
    )
}
