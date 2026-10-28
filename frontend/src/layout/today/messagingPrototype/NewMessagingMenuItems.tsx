// PROTOTYPE, never merged: Silthus/personal#212.
import { router } from 'kea-router'

import { IconSparkles } from '@posthog/icons'
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, toast } from '@posthog/quill'

import { EVENT_SUGGESTIONS } from 'products/workflows/frontend/MessagingPrototype/prototypeData'

import { SECTION_ICONS, messagingSectionUrl } from './messagingPrototypeNav'

const NEW_ITEMS = [
    {
        section: 'broadcasts',
        label: 'Broadcast',
        description: 'A one-time or scheduled message to a group of people',
        opens: 'the broadcast wizard',
    },
    {
        section: 'transactional',
        label: 'Transactional email',
        description: 'An email template your code sends with one API call',
        opens: 'the transactional email editor',
    },
    {
        section: 'workflows',
        label: 'Workflow',
        description: 'Messages that react to what people do',
        opens: 'the New workflow chooser',
    },
] as const

export function startNew(section: (typeof NEW_ITEMS)[number]['section']): void {
    const item = NEW_ITEMS.find((candidate) => candidate.section === section)
    router.actions.push(messagingSectionUrl(section))
    toast.info({ title: `Prototype: this opens ${item?.opens}.` })
}

/** Hands a prompt to PostHog AI. The prototype only says what would happen. */
export function startWithAgent(prompt: string): void {
    toast.info({
        title: 'Prototype: PostHog AI drafts this for you to review',
        description: prompt || 'It asks what you want to send and to whom.',
    })
}

function startFromSuggestion(suggestion: (typeof EVENT_SUGGESTIONS)[number]): void {
    router.actions.push(messagingSectionUrl(suggestion.section))
    toast.info({
        title: `Prototype: this opens a draft ${suggestion.section === 'workflows' ? 'workflow' : 'broadcast'}`,
        description: `PostHog AI builds "${suggestion.title}" from your events for you to review.`,
    })
}

/** Every "New" menu in the prototype: the agent start, suggestions from the project's events, then the three kinds. */
export function NewMessagingMenuItems(): JSX.Element {
    return (
        <>
            <DropdownMenuItem
                description="Describe what to send and to whom, and it drafts it"
                onClick={() => startWithAgent('')}
            >
                <IconSparkles />
                Start with PostHog AI
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                <DropdownMenuLabel>Suggested from your events</DropdownMenuLabel>
                {EVENT_SUGGESTIONS.map((suggestion) => (
                    <DropdownMenuItem
                        key={suggestion.id}
                        description={suggestion.reason}
                        onClick={() => startFromSuggestion(suggestion)}
                    >
                        {SECTION_ICONS[suggestion.section]}
                        {suggestion.title}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {NEW_ITEMS.map((item) => (
                <DropdownMenuItem
                    key={item.section}
                    description={item.description}
                    onClick={() => startNew(item.section)}
                >
                    {SECTION_ICONS[item.section]}
                    {item.label}
                </DropdownMenuItem>
            ))}
        </>
    )
}
