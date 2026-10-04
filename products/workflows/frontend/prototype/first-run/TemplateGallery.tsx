// PROTOTYPE ONLY (silthus/posthog#212). The first screen: the real template library, filtered to what the
// project's data can drive, in the same cards as the library, spread across the full width.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconCheckCircle, IconWarning } from '@posthog/icons'
import { LemonSegmentedButton, Link } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { WorkflowTemplateCard } from '../../Workflows/templates/WorkflowTemplateCard'
import { WorkflowTemplateMeta } from '../../Workflows/templates/WorkflowTemplateMeta'
import { WorkflowTemplateSteps } from '../../Workflows/templates/WorkflowTemplateSteps'
import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { TemplateFit } from './realTemplates'
import { BrandSummary } from './shared/BrandSummary'
import { EmailWorkspace } from './shared/EmailWorkspace'
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
            <BrandSummary />
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
            </div>
            <EmailWorkspace />
        </div>
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
                    <WorkflowTemplateMeta template={template} />
                    <span className="flex items-center gap-1 text-xs">
                        {fit.ready ? (
                            <IconCheckCircle className="text-success" />
                        ) : (
                            <IconWarning className="text-warning" />
                        )}
                        {fit.reason}
                    </span>
                </div>
            }
            onClick={() => selectTemplate(template.id)}
            data-attr="first-run-template"
        />
    )
}
