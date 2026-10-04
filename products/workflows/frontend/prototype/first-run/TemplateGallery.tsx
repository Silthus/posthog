// PROTOTYPE ONLY (silthus/posthog#212). The first screen: the real template library, filtered to what the
// project's data can drive, in the library's own cards, spread across the full width, with a blank one last.
import { useActions, useValues } from 'kea'
import { router } from 'kea-router'
import { useState } from 'react'

import { IconBolt, IconWarning } from '@posthog/icons'
import { LemonSegmentedButton, Link } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { WorkflowTemplateBlankPreview } from '../../Workflows/templates/WorkflowTemplateBlankPreview'
import { WorkflowTemplateCard } from '../../Workflows/templates/WorkflowTemplateCard'
import { WorkflowTemplateSteps } from '../../Workflows/templates/WorkflowTemplateSteps'
import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { TemplateFit } from './realTemplates'
import { SignupsLine } from './shared/SignupsLine'

export function TemplateGallery(): JSX.Element {
    const { fits } = useValues(firstRunPrototypeLogic)
    const [filter, setFilter] = useState<'picked' | 'all'>('picked')
    const ready = fits.filter((fit) => fit.ready)
    const shown = filter === 'picked' && ready.length ? ready : fits

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
                    <TemplateTile key={fit.template.id} fit={fit} />
                ))}
                <WorkflowTemplateCard
                    name="Start playing"
                    description="A blank workflow. Pick any trigger and add your own steps on the canvas."
                    preview={<WorkflowTemplateBlankPreview />}
                    footer={<Trigger text="You decide when it starts and who it reaches" />}
                    onClick={() => router.actions.push(urls.workflowNew())}
                    data-attr="first-run-blank"
                />
            </div>
        </div>
    )
}

function Trigger({ text }: { text: string }): JSX.Element {
    return (
        <span className="flex items-start gap-1 text-xs text-accent">
            <IconBolt className="shrink-0 mt-0.5" />
            {text}
        </span>
    )
}

function TemplateTile({ fit }: { fit: TemplateFit }): JSX.Element {
    const { selectTemplate } = useActions(firstRunPrototypeLogic)
    const { template } = fit

    return (
        <WorkflowTemplateCard
            name={template.name || 'Unnamed template'}
            description={template.description}
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
                    <Trigger text={fit.sends} />
                    {!fit.ready && (
                        <span className="flex items-center gap-1 text-xs text-warning">
                            <IconWarning />
                            {fit.reason}
                        </span>
                    )}
                </div>
            }
            onClick={() => selectTemplate(template.id)}
            data-attr="first-run-template"
        />
    )
}
