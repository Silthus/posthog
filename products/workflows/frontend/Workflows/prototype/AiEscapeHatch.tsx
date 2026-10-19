import { IconSparkles } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { AgentPromptButton } from 'lib/components/AgentPromptButton/AgentPromptButton'
import { lemonToast } from 'lib/lemon-ui/LemonToast/LemonToast'

import { buildAgentPrompt } from './destinationMoveFixtures'

export const AI_COMPOSER_SEED = 'Turn this destination into a workflow and also '

export function AiEscapeHatch({
    stacked = false,
    size = 'small',
}: {
    stacked?: boolean
    size?: 'small' | 'medium'
}): JSX.Element {
    return (
        <div className={`flex gap-2 ${stacked ? 'flex-col' : 'flex-wrap items-center'}`}>
            <LemonButton
                type="secondary"
                size={size}
                icon={<IconSparkles />}
                fullWidth={stacked}
                onClick={() =>
                    lemonToast.info(
                        `PostHog AI opens in the side panel with the composer prefilled: "${AI_COMPOSER_SEED}"`
                    )
                }
                data-attr="destination-preview-ask-posthog-ai"
            >
                Ask PostHog AI
            </LemonButton>
            <AgentPromptButton
                size={size === 'small' ? 'sm' : 'default'}
                labelMode="action"
                actions={[{ key: 'build-workflow', label: 'prompt for your agent', buildPrompt: buildAgentPrompt }]}
                data-attr="destination-preview-copy-agent-prompt"
            />
        </div>
    )
}
