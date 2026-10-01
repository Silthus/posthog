import { IconCheck } from '@posthog/icons'
import { LemonBanner, LemonButton } from '@posthog/lemon-ui'

export interface SpottedEmailToolCardProps {
    toolName: string
    domain: string
    onImportUnsubscribes?: () => void
    onDismiss?: () => void
}

export function SpottedEmailToolCard({
    toolName,
    domain,
    onImportUnsubscribes,
    onDismiss,
}: SpottedEmailToolCardProps): JSX.Element {
    return (
        <LemonBanner type="info" onClose={onDismiss} alignItems="start">
            <div className="flex flex-col gap-2">
                <p className="m-0 font-medium">
                    We spotted {toolName} on {domain}
                </p>
                <p className="m-0 text-secondary text-sm">Your current sending keeps working:</p>
                <ul className="m-0 pl-0 list-none text-sm flex flex-col gap-1">
                    <li className="flex items-center gap-1.5">
                        <IconCheck className="text-success shrink-0" />
                        Our records sit on their own names and don't replace yours.
                    </li>
                    <li className="flex items-center gap-1.5">
                        <IconCheck className="text-success shrink-0" />
                        We keep your existing DMARC record.
                    </li>
                    <li className="flex items-center gap-1.5">
                        <IconCheck className="text-success shrink-0" />
                        Bounces go through our own feedback subdomain, so nothing changes for {toolName}.
                    </li>
                </ul>
                {onImportUnsubscribes && (
                    <div className="flex flex-wrap gap-2 pt-1">
                        <LemonButton
                            type="secondary"
                            size="small"
                            onClick={onImportUnsubscribes}
                            data-attr="email-domain-import-unsubscribes"
                        >
                            Bring your unsubscribes over
                        </LemonButton>
                    </div>
                )}
            </div>
        </LemonBanner>
    )
}
