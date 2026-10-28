// PROTOTYPE, never merged: Silthus/personal#212.
import { IconPlus } from '@posthog/icons'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@posthog/quill'

import { NewMessagingMenuItems } from './NewMessagingMenuItems'

export function MessagingPaneNewButton(): JSX.Element {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={<Button size="icon" className="-me-2 text-muted-foreground" aria-label="New" tooltip="New" />}
            >
                <IconPlus />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <NewMessagingMenuItems />
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
