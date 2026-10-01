// PROTOTYPE (throwaway): "Hand this to an agent" modal shared by every click-through variant.
import { useMemo, useState } from 'react'

import { IconCopy, IconExternal } from '@posthog/icons'
import { LemonButton, LemonCheckbox, LemonModal, LemonSegmentedButton, lemonToast } from '@posthog/lemon-ui'

import { copyToClipboard } from 'lib/utils/copyToClipboard'

import { SetupSimulation } from '../simulation'
import { buildAgentPrompt } from './agentPrompts'
import { HedgehogRobot } from './hoggies'

type AgentKey = 'claude' | 'codex' | 'cursor' | 'other'

const AGENT_OPTIONS: { value: AgentKey; label: string }[] = [
    { value: 'claude', label: 'Claude' },
    { value: 'codex', label: 'Codex' },
    { value: 'cursor', label: 'Cursor' },
    { value: 'other', label: 'Other' },
]

export function AgentHandoffModal({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    const [agent, setAgent] = useState<AgentKey>('claude')
    const prompt = useMemo(
        () =>
            derived.sendingDomain
                ? buildAgentPrompt({
                      sendingDomain: derived.sendingDomain,
                      bouncePrefix: state.bouncePrefix,
                      host: state.host,
                      records: derived.records,
                      computerUse: state.computerUse,
                  })
                : '',
        [derived.sendingDomain, derived.records, state.bouncePrefix, state.host, state.computerUse]
    )
    const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
    const hostName = state.host?.name ?? 'your DNS host'

    const copyPrompt = async (): Promise<void> => {
        await copyToClipboard(prompt, 'prompt')
        lemonToast.success('Prompt copied. Paste it into your agent.')
    }

    return (
        <LemonModal
            isOpen={state.agentModalOpen}
            onClose={actions.closeAgentModal}
            title="Let an agent add the settings"
            description="Your coding agent gets the exact records plus the checks it should run. You stay in control of the approval."
            width={640}
            footer={
                <div className="flex flex-wrap gap-2 justify-end">
                    <LemonButton type="secondary" icon={<IconCopy />} onClick={() => void copyPrompt()}>
                        Copy prompt
                    </LemonButton>
                    {agent === 'claude' ? (
                        <LemonButton type="primary" icon={<IconExternal />} to={claudeUrl} targetBlank>
                            Open in Claude
                        </LemonButton>
                    ) : (
                        <LemonButton type="primary" icon={<IconCopy />} onClick={() => void copyPrompt()}>
                            Copy for {AGENT_OPTIONS.find((o) => o.value === agent)?.label}
                        </LemonButton>
                    )}
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="flex gap-4 items-start">
                    <HedgehogRobot className="w-20 shrink-0" />
                    <div className="flex flex-col gap-2 grow">
                        <LemonSegmentedButton
                            size="small"
                            value={agent}
                            onChange={(value) => setAgent(value)}
                            options={AGENT_OPTIONS}
                        />
                        <LemonCheckbox
                            checked={state.computerUse}
                            onChange={actions.setComputerUse}
                            label={`My agent can use a browser. Let it sign in to ${hostName} and add the records itself.`}
                        />
                    </div>
                </div>
                <ol className="list-decimal pl-5 text-sm text-secondary space-y-0.5">
                    {state.computerUse ? (
                        <>
                            <li>Opens {hostName} in a browser you are signed in to</li>
                            <li>Adds the {derived.records.length} records without touching anything else</li>
                            <li>Comes back here and clicks Check again until you are ready to send</li>
                        </>
                    ) : (
                        <>
                            <li>Reads the records through the PostHog MCP tools</li>
                            <li>Adds them at {hostName} through its API, or hands you an approval link</li>
                            <li>Polls PostHog until you are ready to send</li>
                        </>
                    )}
                </ol>
                <pre className="text-xs whitespace-pre-wrap border rounded bg-fill-primary p-3 max-h-60 overflow-auto m-0">
                    {prompt}
                </pre>
            </div>
        </LemonModal>
    )
}
