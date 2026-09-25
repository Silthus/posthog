// PROTOTYPE (throwaway): one line that says what starts a workflow, for example "Schedule · Mondays 07:00".
import {
    IconBolt,
    IconCalendar,
    IconCursor,
    IconDatabase,
    IconEye,
    IconGithub,
    IconMessage,
    IconPeople,
    IconServer,
    IconWebhooks,
} from '@posthog/icons'

import type { TriggerKind, TriggerSummary } from './workflowSummaries'

const TRIGGER_ICONS: Record<TriggerKind, JSX.Element> = {
    event: <IconBolt />,
    schedule: <IconCalendar />,
    batch: <IconPeople />,
    webhook: <IconWebhooks />,
    manual: <IconCursor />,
    tracking_pixel: <IconEye />,
    'data-warehouse-table': <IconDatabase />,
    'data-warehouse-view': <IconDatabase />,
    slack: <IconMessage />,
    github: <IconGithub />,
    'internal-event': <IconServer />,
    unknown: <IconBolt />,
}

export function triggerIcon(kind: TriggerKind): JSX.Element {
    return TRIGGER_ICONS[kind]
}

export function TriggerLine({ trigger }: { trigger: TriggerSummary }): JSX.Element {
    return (
        <div className="flex items-center gap-1.5 min-w-0 text-sm" title={`${trigger.label}: ${trigger.detail}`}>
            <span className="flex shrink-0 text-base text-secondary">{triggerIcon(trigger.kind)}</span>
            <span className="font-semibold shrink-0">{trigger.label}</span>
            <span className="truncate text-secondary">{trigger.detail}</span>
        </div>
    )
}
