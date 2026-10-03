// PROTOTYPE ONLY (silthus/posthog#212). Edit the email's words by hand.
import { useActions, useValues } from 'kea'

import { LemonInput, LemonTextArea } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'

export function DraftFields(): JSX.Element | null {
    const { draft } = useValues(firstRunPrototypeLogic)
    const { updateDraft } = useActions(firstRunPrototypeLogic)
    if (!draft) {
        return null
    }
    return (
        <div className="flex flex-col gap-2 text-sm">
            <label className="flex flex-col gap-1">
                <span className="text-secondary text-xs">Subject</span>
                <LemonInput size="small" value={draft.subject} onChange={(subject) => updateDraft({ subject })} />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-secondary text-xs">Heading</span>
                <LemonInput size="small" value={draft.heading} onChange={(heading) => updateDraft({ heading })} />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-secondary text-xs">Message</span>
                <LemonTextArea value={draft.body} onChange={(body) => updateDraft({ body })} minRows={4} />
            </label>
        </div>
    )
}
