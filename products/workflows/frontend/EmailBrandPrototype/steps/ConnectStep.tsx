// PROTOTYPE (throwaway): step one, connect GitHub so PostHog can read the brand from a repo.
import { IconGithub, IconLock } from '@posthog/icons'
import { LemonButton, Link } from '@posthog/lemon-ui'

import { HedgehogExplorer } from '../shared/hoggies'
import { BrandSimulation } from '../simulation'
import { StepScreen } from './StepScreen'

const FILES_WE_READ = ['package.json', 'manifest.json', 'tailwind.config', 'your CSS', 'logo files']

export function ConnectStep({ sim }: { sim: BrandSimulation }): JSX.Element {
    const waitingForGitHub = sim.state.installOverlayOpen || sim.state.installing
    return (
        <StepScreen
            phase="connect"
            hoggie={HedgehogExplorer}
            title="Let's find your brand on GitHub"
            subtitle="PostHog reads your name, logo, colors and font from one repo. It only reads, it never changes your code."
            primary={
                <LemonButton
                    type="primary"
                    size="large"
                    icon={<IconGithub />}
                    onClick={sim.actions.openInstall}
                    loading={waitingForGitHub}
                    data-attr="email-brand-steps-connect-github"
                >
                    {waitingForGitHub ? 'Waiting for GitHub' : 'Connect GitHub'}
                </LemonButton>
            }
            secondary={
                <Link onClick={() => sim.actions.goTo('review')} data-attr="email-brand-steps-skip-github">
                    Skip, I'll fill it in by hand
                </Link>
            }
        >
            <div className="flex flex-col items-center gap-2">
                <div className="flex flex-wrap justify-center gap-1.5">
                    {FILES_WE_READ.map((file) => (
                        <span
                            key={file}
                            className="font-mono text-xs rounded border bg-surface-primary px-2 py-0.5 text-secondary"
                        >
                            {file}
                        </span>
                    ))}
                </div>
                <div className="text-xs text-tertiary flex items-center gap-1">
                    <IconLock /> Read-only. You pick the repo next.
                </div>
            </div>
        </StepScreen>
    )
}
