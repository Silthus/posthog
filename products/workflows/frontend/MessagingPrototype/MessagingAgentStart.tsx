// PROTOTYPE, never merged: Silthus/personal#212. Most people start a message with the agent, so each list opens
// with a prompt field and a few starting prompts above the manual create button's results.
import { useState } from 'react'

import { IconArrowRight, IconSparkles } from '@posthog/icons'
import { Button, InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@posthog/quill'

import type { AiFirstSuggestion } from 'scenes/max/aiFirstCreate/AiFirstCreateScene'

import { startWithAgent } from '~/layout/today/messagingPrototype/NewMessagingMenuItems'

export function MessagingAgentStart({
    placeholder,
    suggestions,
}: {
    placeholder: string
    suggestions: AiFirstSuggestion[]
}): JSX.Element {
    const [prompt, setPrompt] = useState('')
    const submit = (): void => {
        startWithAgent(prompt.trim())
        setPrompt('')
    }

    return (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-primary p-3">
            <form
                onSubmit={(event) => {
                    event.preventDefault()
                    submit()
                }}
            >
                <InputGroup>
                    <InputGroupAddon>
                        <IconSparkles />
                    </InputGroupAddon>
                    <InputGroupInput
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder={placeholder}
                        aria-label={placeholder}
                    />
                    <InputGroupAddon align="inline-end">
                        <InputGroupButton type="submit" aria-label="Start with PostHog AI" disabled={!prompt.trim()}>
                            <IconArrowRight />
                        </InputGroupButton>
                    </InputGroupAddon>
                </InputGroup>
            </form>
            <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 3).map((suggestion) => (
                    <Button
                        key={suggestion.title}
                        size="sm"
                        variant="outline"
                        onClick={() => startWithAgent(suggestion.prompt)}
                    >
                        {suggestion.title}
                    </Button>
                ))}
            </div>
        </div>
    )
}
