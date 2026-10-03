// PROTOTYPE ONLY (silthus/posthog#212). One template from the library, with why it fits this project.
import { IconCheckCircle, IconWarning } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { StarterPick } from '../starterEmails'
import { DraftPreview } from './DraftPreview'

export function StarterCard({
    pick,
    onSelect,
    selected,
    showThumbnail,
}: {
    pick: StarterPick
    onSelect: () => void
    selected?: boolean
    showThumbnail?: boolean
}): JSX.Element {
    return (
        <div
            className={`flex flex-col gap-2 rounded border p-3 bg-surface-primary ${
                selected ? 'border-2 border-accent' : 'border-primary'
            } ${pick.ready ? '' : 'opacity-70'}`}
        >
            {showThumbnail && (
                <div className="h-40 overflow-hidden rounded pointer-events-none">
                    <div className="origin-top-left scale-50 w-[200%]">
                        <DraftPreview draft={pick.starter.draft} heightClass="h-[20rem]" showHeader={false} />
                    </div>
                </div>
            )}
            <span className="font-semibold leading-tight">{pick.starter.name}</span>
            <span className="text-xs text-secondary flex-1">{pick.starter.description}</span>
            <span className="text-xs flex items-center gap-1">
                {pick.ready ? <IconCheckCircle className="text-success" /> : <IconWarning className="text-warning" />}
                {pick.reason}
            </span>
            <LemonButton
                type={selected ? 'primary' : 'secondary'}
                size="small"
                onClick={onSelect}
                disabledReason={pick.ready ? undefined : 'Your app does not send the event this needs yet'}
                center
            >
                {selected ? 'Selected' : 'Use this email'}
            </LemonButton>
        </div>
    )
}
