// PROTOTYPE, never merged: Silthus/personal#212.
import { IconChevronDown, IconPlus } from '@posthog/icons'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@posthog/quill'

import { NewMessagingMenuItems } from '~/layout/today/messagingPrototype/NewMessagingMenuItems'

/** One "New" menu for everything Messaging creates. It stays secondary, so each page's own create button leads. */
export function MessagingHeaderActions(): JSX.Element {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
                <IconPlus />
                New
                <IconChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <NewMessagingMenuItems />
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
