// PROTOTYPE, never merged: Silthus/personal#212.
import { useActions } from 'kea'

import { IconChevronDown, IconGear, IconPlus } from '@posthog/icons'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@posthog/quill'

import { messagingPrototypeLogic } from '~/layout/today/messagingPrototype/messagingPrototypeLogic'
import { NewMessagingMenuItems } from '~/layout/today/messagingPrototype/NewMessagingMenuItems'

/** Variant A: Settings closes the side menu, as a control that opens a dialog rather than a section. */
export function MessagingSettingsMenuButton(): JSX.Element {
    const { setSettingsOpen } = useActions(messagingPrototypeLogic)
    return (
        <Button
            left
            className="text-muted-foreground @min-[48rem]/main-content:w-full"
            onClick={() => setSettingsOpen(true)}
        >
            <IconGear />
            Settings
        </Button>
    )
}

/** One "New" menu for everything Messaging creates, with the settings control beside it when asked. */
export function MessagingHeaderActions({ showSettings = true }: { showSettings?: boolean }): JSX.Element {
    const { setSettingsOpen } = useActions(messagingPrototypeLogic)
    return (
        <div className="flex items-center gap-2">
            {showSettings && (
                <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                    <IconGear />
                    Settings
                </Button>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="primary" />}>
                    <IconPlus />
                    New
                    <IconChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <NewMessagingMenuItems />
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
