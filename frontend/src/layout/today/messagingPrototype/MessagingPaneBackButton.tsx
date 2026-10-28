// PROTOTYPE, never merged: Silthus/personal#212.
import { useActions } from 'kea'

import { IconChevronLeft } from '@posthog/icons'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@posthog/quill'

import { todayShellLogic } from '../todayShellLogic'

/** Variant C: the Messaging pane is a drill-in from Products, so its title row leads back there. */
export function MessagingPaneBackButton(): JSX.Element {
    const { pickPane } = useActions(todayShellLogic)
    return (
        <Tooltip>
            <TooltipTrigger
                delay={0}
                render={
                    <Button
                        size="icon"
                        className="-ms-2 shrink-0 text-muted-foreground"
                        aria-label="Back to Products"
                        onClick={() => pickPane('products')}
                    />
                }
            >
                <IconChevronLeft />
            </TooltipTrigger>
            <TooltipContent>Back to Products</TooltipContent>
        </Tooltip>
    )
}
