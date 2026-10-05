// PROTOTYPE ONLY (silthus/posthog#212). The first screen: the real template library, filtered to what the
// project's data can drive, in the library's own cards, spread across the full width, with a blank one last.
import { useActions, useValues } from 'kea'
import { router } from 'kea-router'
import { useState } from 'react'

import { IconBolt, IconClock, IconStarFilled, IconWarning } from '@posthog/icons'
import { LemonSegmentedButton, LemonTag, Link } from '@posthog/lemon-ui'

import { PropertyKeyInfo } from 'lib/components/PropertyKeyInfo'
import { TaxonomicFilterGroupType } from 'lib/components/TaxonomicFilter/types'
import { urls } from 'scenes/urls'

import { WorkflowTemplateBlankPreview } from '../../Workflows/templates/WorkflowTemplateBlankPreview'
import { WorkflowTemplateCard } from '../../Workflows/templates/WorkflowTemplateCard'
import { WorkflowTemplateSteps } from '../../Workflows/templates/WorkflowTemplateSteps'
import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { StartsOn, TemplateFit } from './realTemplates'
import { SignupsLine } from './shared/SignupsLine'

export function TemplateGallery(): JSX.Element {
    const { fits, recommendation } = useValues(firstRunPrototypeLogic)
    const [filter, setFilter] = useState<'picked' | 'all'>('picked')
    const ready = fits.filter((fit) => fit.ready)
    const isRecommended = (fit: TemplateFit): boolean => fit.template.id === recommendation?.templateId
    const shown = [...(filter === 'picked' && ready.length ? ready : fits)].sort(
        (a, b) => Number(isRecommended(b)) - Number(isRecommended(a))
    )

    return (
        <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-semibold mb-0">Emails that fit your app</h2>
                <SignupsLine />
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <LemonSegmentedButton
                    size="small"
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'picked', label: `Picked for your data (${ready.length})` },
                        { value: 'all', label: `All email templates (${fits.length})` },
                    ]}
                />
                <Link to={urls.workflows('library')} className="text-sm">
                    Open the template library
                </Link>
            </div>
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(22rem,100%),1fr))]">
                {shown.map((fit) => (
                    <TemplateTile
                        key={fit.template.id}
                        fit={fit}
                        recommendedBecause={isRecommended(fit) ? recommendation?.reason : undefined}
                    />
                ))}
                <WorkflowTemplateCard
                    name="Start playing"
                    description="A blank workflow. Pick any trigger and add your own steps on the canvas."
                    preview={<WorkflowTemplateBlankPreview />}
                    footer={<StartsOnLine startsOn={{ kind: 'event', detail: 'Any trigger you pick' }} />}
                    onClick={() => router.actions.push(urls.workflowNew())}
                    data-attr="first-run-blank"
                />
            </div>
        </div>
    )
}

function StartsOnLine({ startsOn }: { startsOn: StartsOn }): JSX.Element {
    const { kind, event, detail } = startsOn
    return (
        <span className="flex items-center flex-wrap gap-1 text-xs text-accent">
            {kind === 'event' ? <IconBolt className="shrink-0" /> : <IconClock className="shrink-0" />}
            {kind === 'no-event' && 'No'}
            {event && <EventChip event={event} />}
            {detail}
        </span>
    )
}

function EventChip({ event }: { event: string }): JSX.Element {
    return (
        <span className="inline-flex items-center px-1 rounded bg-fill-primary text-primary font-medium">
            <PropertyKeyInfo value={event} type={TaxonomicFilterGroupType.Events} disablePopover />
        </span>
    )
}

function TemplateTile({ fit, recommendedBecause }: { fit: TemplateFit; recommendedBecause?: string }): JSX.Element {
    const { selectTemplate } = useActions(firstRunPrototypeLogic)
    const { template } = fit

    const card = (
        <WorkflowTemplateCard
            name={template.name || 'Unnamed template'}
            description={template.description}
            badge={
                recommendedBecause ? (
                    <LemonTag type="warning" icon={<IconStarFilled />} className="shrink-0">
                        Recommended starter
                    </LemonTag>
                ) : null
            }
            preview={
                <div className="flex flex-col gap-3 w-full">
                    {template.image_url && (
                        <img src={template.image_url} alt="" className="w-full aspect-[16/9] object-cover rounded" />
                    )}
                    <WorkflowTemplateSteps actions={template.actions} edges={template.edges} />
                </div>
            }
            footer={
                <div className="flex flex-col gap-1">
                    <StartsOnLine startsOn={fit.startsOn} />
                    {!fit.ready && (
                        <span className="flex items-center gap-1 text-xs text-warning">
                            <IconWarning />
                            {fit.reason}
                        </span>
                    )}
                </div>
            }
            onClick={() => selectTemplate(template.id)}
            data-attr={recommendedBecause ? 'first-run-recommended' : 'first-run-template'}
        />
    )

    if (!recommendedBecause) {
        return card
    }
    return (
        <div className="flex flex-col rounded ring-2 ring-accent bg-accent-highlight-secondary">
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium">
                <IconStarFilled className="text-warning shrink-0" />
                {recommendedBecause}
            </span>
            <div className="grow [&>div]:h-full">{card}</div>
        </div>
    )
}
