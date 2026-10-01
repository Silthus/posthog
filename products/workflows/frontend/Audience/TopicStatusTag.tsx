import { LemonTag } from '@posthog/lemon-ui'

import type { AudienceTopicStatus } from './audienceFixtures'

const STATUS_LABEL: Record<AudienceTopicStatus, string> = {
    subscribed: 'Subscribed',
    unsubscribed: 'Unsubscribed',
    no_preference: 'No preference',
}

export function TopicStatusTag({ status, label }: { status: AudienceTopicStatus; label?: string }): JSX.Element {
    const type = status === 'subscribed' ? 'success' : status === 'unsubscribed' ? 'warning' : 'muted'
    return (
        <LemonTag type={type} size="small" className="whitespace-nowrap">
            {label ? `${label}: ${STATUS_LABEL[status]}` : STATUS_LABEL[status]}
        </LemonTag>
    )
}
