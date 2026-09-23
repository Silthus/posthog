import { useActions, useValues } from 'kea'

import { Search } from 'lib/components/Search/Search'
import { DialogPrimitive, DialogPrimitiveTitle } from 'lib/ui/DialogPrimitive/DialogPrimitive'

import { osSpotlightLogic } from './osSpotlightLogic'

/** The app's command menu, with results that open in OS windows. Replaces `Command` on the OS page. */
export function OsSpotlight(): JSX.Element {
    const { isCommandOpen } = useValues(osSpotlightLogic)
    const { closeSpotlight, selectResult } = useActions(osSpotlightLogic)

    return (
        <DialogPrimitive open={isCommandOpen} onOpenChange={(open) => !open && closeSpotlight()} className="w-[640px]">
            <DialogPrimitiveTitle>Spotlight</DialogPrimitiveTitle>
            <Search.Root
                logicKey="command"
                isActive={isCommandOpen}
                onItemSelect={(item, newWindow) => selectResult(item, !!newWindow)}
                onAskAiClick={closeSpotlight}
                showAskAiLink
            >
                <Search.Input autoFocus />
                <Search.Status />
                <Search.Separator />
                <Search.Results listClassName="pt-0 bg-surface-primary" groupLabelClassName="bg-surface-secondary" />
                <Search.Footer />
            </Search.Root>
        </DialogPrimitive>
    )
}
