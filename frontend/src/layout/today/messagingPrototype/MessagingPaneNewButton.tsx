// PROTOTYPE, never merged: Silthus/personal#212.
import { IconChevronDown, IconPlus } from '@posthog/icons'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@posthog/quill'

import { NewMessagingMenuItems } from './NewMessagingMenuItems'

export function MessagingPaneNewButton(): JSX.Element {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="primary" size="sm" />}>
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
