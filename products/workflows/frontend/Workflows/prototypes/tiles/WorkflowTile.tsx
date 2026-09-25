// PROTOTYPE (throwaway): one tile that answers "what does this workflow do?" without opening it.
// Workflows open on click through a stretched link. Templates get a dashed outline, a Template tag and
// "Use template" in place of the status. The side-panel button opens a quick look for both.
import { useActions, useValues } from 'kea'
import { router } from 'kea-router'
import { useMemo } from 'react'

import { IconSidePanel } from '@posthog/icons'
import { LemonButton, LemonCard, LemonTag, Link } from '@posthog/lemon-ui'

import { dayjs } from 'lib/dayjs'
import { ProfilePicture } from 'lib/lemon-ui/ProfilePicture'
import { cn } from 'lib/utils/css-classes'
import { urls } from 'scenes/urls'

import type { WorkflowListItem } from '../shared/workflowListItems'
import { ActivitySparkline } from './ActivitySparkline'
import { DispatchList } from './DispatchList'
import { FlowStrip } from './FlowStrip'
import { MiniCanvas } from './MiniCanvas'
import { tilesVariantLogic } from './tilesVariantLogic'
import { TriggerLine } from './TriggerLine'
import { describeDispatches, describeTrigger, orderedSteps } from './workflowSummaries'

export const STATUS_TAGS: Record<string, { label: string; type: 'success' | 'default' | 'muted' | 'highlight' }> = {
    active: { label: 'Active', type: 'success' },
    draft: { label: 'Draft', type: 'default' },
    archived: { label: 'Archived', type: 'muted' },
    template: { label: 'Template', type: 'highlight' },
}

export function useTileSummary(item: WorkflowListItem): {
    trigger: ReturnType<typeof describeTrigger>
    steps: ReturnType<typeof orderedSteps>
    dispatches: ReturnType<typeof describeDispatches>
} {
    const { schedules, schedulesLoading } = useValues(tilesVariantLogic)
    const schedule = item.id in schedules ? schedules[item.id] : schedulesLoading ? undefined : null
    return useMemo(() => {
        const steps = orderedSteps(item)
        return { trigger: describeTrigger(item, schedule), steps, dispatches: describeDispatches(item, steps) }
    }, [item, schedule])
}

export function startFromTemplate(item: WorkflowListItem): void {
    router.actions.push(urls.workflowNew(), { templateId: item.id })
}

export function WorkflowTile({ item }: { item: WorkflowListItem }): JSX.Element {
    const { density } = useValues(tilesVariantLogic)
    const { openPeek } = useActions(tilesVariantLogic)
    const { trigger, steps, dispatches } = useTileSummary(item)
    const isTemplate = item.kind === 'template'
    const compact = density === 'compact'
    const link = !isTemplate ? urls.workflow(item.id, 'workflow') : undefined
    const owner = item.owners[0]?.replace(/\.+$/, '')

    return (
        <LemonCard
            className={cn('flex flex-col gap-2 min-w-0', compact ? 'p-2.5' : 'p-3', isTemplate && 'border-dashed')}
            data-attr="workflows-prototype-tile"
        >
            <div className="flex items-start gap-2 min-w-0">
                <div className="flex flex-col min-w-0 flex-1">
                    {item.path.length ? (
                        <span className="text-xs text-secondary truncate">{item.path.join(' / ')}</span>
                    ) : null}
                    {link ? (
                        <Link
                            to={link}
                            subtle
                            className="font-semibold line-clamp-2 break-words after:absolute after:inset-0 after:content-['']"
                            title={item.name}
                        >
                            {item.leafName}
                        </Link>
                    ) : (
                        <span className="font-semibold line-clamp-2 break-words" title={item.name}>
                            {item.leafName}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0 relative z-10">
                    <LemonTag type={STATUS_TAGS[item.status].type}>{STATUS_TAGS[item.status].label}</LemonTag>
                    <LemonButton
                        size="xsmall"
                        icon={<IconSidePanel />}
                        tooltip="Quick look"
                        onClick={() => openPeek(item.id)}
                        data-attr="workflows-prototype-tile-peek"
                    />
                </div>
            </div>

            <TriggerLine trigger={trigger} />

            {compact ? (
                <div className="flex items-center justify-between gap-2 min-w-0">
                    <FlowStrip triggerKind={trigger.kind} steps={steps} showCounts={false} />
                </div>
            ) : (
                <div className="flex items-start gap-2 min-w-0">
                    <div className="flex-1 min-w-0">
                        <FlowStrip triggerKind={trigger.kind} steps={steps} />
                    </div>
                    <MiniCanvas item={item} className="h-14 w-10 shrink-0" />
                </div>
            )}

            <div className="border-t pt-2">
                <DispatchList item={item} dispatches={dispatches} limit={compact ? 1 : 3} />
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t pt-2 min-w-0">
                {isTemplate ? (
                    <>
                        <div className="flex flex-wrap gap-1 min-w-0">
                            {item.tags.map((tag) => (
                                <LemonTag key={tag} size="small">
                                    {tag}
                                </LemonTag>
                            ))}
                        </div>
                        <LemonButton
                            size="xsmall"
                            type="primary"
                            className="relative z-10"
                            onClick={() => startFromTemplate(item)}
                            data-attr="workflows-prototype-tile-use-template"
                        >
                            Use template
                        </LemonButton>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-1.5 min-w-0 text-xs text-secondary">
                            {item.createdBy && (!owner || owner === item.createdBy.first_name?.toLowerCase()) ? (
                                <ProfilePicture user={item.createdBy} size="xs" />
                            ) : null}
                            <span className="truncate">{owner ? `@${owner}` : (item.createdByName ?? 'Unknown')}</span>
                            {item.updatedAt ? (
                                <span className="whitespace-nowrap" title={dayjs(item.updatedAt).format('LLL')}>
                                    {`· ${dayjs(item.updatedAt).fromNow()}`}
                                </span>
                            ) : null}
                        </div>
                        <ActivitySparkline workflowId={item.id} />
                    </>
                )}
            </div>
        </LemonCard>
    )
}
