// PROTOTYPE ONLY (silthus/posthog#212). Ask PostHog AI to change the email. Canned edits stand in for real
// generation, but the preview changes, so the loop is clickable.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconSparkles } from '@posthog/icons'
import { LemonButton, LemonInput } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { AI_EDITS, aiEditFor } from '../starterEmails'

export function AiCustomizer({ showLog = true }: { showLog?: boolean }): JSX.Element {
    const { chat } = useValues(firstRunPrototypeLogic)
    const { askAi } = useActions(firstRunPrototypeLogic)
    const [prompt, setPrompt] = useState('')

    const submit = (): void => {
        if (prompt.trim()) {
            askAi(prompt.trim(), aiEditFor(prompt))
            setPrompt('')
        }
    }

    return (
        <div className="flex flex-col gap-2 rounded border border-primary p-3 bg-surface-primary">
            <span className="font-semibold text-sm flex items-center gap-1.5">
                <IconSparkles className="text-ai" /> Change it with PostHog AI
            </span>
            {showLog && chat.length > 0 && (
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto text-sm">
                    {chat.map((message, index) => (
                        <div
                            key={index}
                            className={
                                message.from === 'user'
                                    ? 'self-end rounded-lg bg-fill-highlight-100 px-3 py-1.5'
                                    : 'self-start text-secondary'
                            }
                        >
                            {message.text}
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap gap-1.5">
                {AI_EDITS.map((edit) => (
                    <LemonButton
                        key={edit.key}
                        size="xsmall"
                        type="secondary"
                        onClick={() => askAi(edit.label, edit.key)}
                    >
                        {edit.label}
                    </LemonButton>
                ))}
            </div>
            <LemonInput
                placeholder="Or describe a change, like “mention our onboarding call”"
                value={prompt}
                onChange={setPrompt}
                onPressEnter={submit}
                suffix={
                    <LemonButton
                        size="xsmall"
                        type="primary"
                        onClick={submit}
                        disabledReason={!prompt.trim() ? 'Type a change first' : undefined}
                    >
                        Ask
                    </LemonButton>
                }
            />
        </div>
    )
}
