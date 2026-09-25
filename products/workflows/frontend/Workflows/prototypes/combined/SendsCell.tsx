// PROTOTYPE (throwaway): what a row sends. A workflow shows its channels, and its emails' From address and subject
// on hover (the From address also shows in comfortable rows). An email template shows how many workflows use it,
// and clicking that lists them, wherever they are filed.
import { useActions, useValues } from 'kea'

import { Link, Tooltip } from '@posthog/lemon-ui'

import { FolderRow } from '../folders/foldersVariantLogic'
import { WorkflowDispatchSummary } from '../shared/WorkflowDispatchSummary'
import { combinedVariantLogic } from './combinedVariantLogic'

export function SendsCell({ row }: { row: FolderRow }): JSX.Element | null {
    const { usedByCounts, compact } = useValues(combinedVariantLogic)
    const { showWorkflowsUsingTemplate } = useActions(combinedVariantLogic)
    const { item } = row

    if (row.kind === 'email_template') {
        const count = usedByCounts[row.id] ?? 0
        if (!count) {
            return <span className="text-xs text-secondary whitespace-nowrap">Not used yet</span>
        }
        return (
            <Link
                className="text-xs whitespace-nowrap"
                onClick={() => showWorkflowsUsingTemplate(item.name)}
                title={`Show the workflows that send ${item.name}`}
                data-attr="workflows-combined-used-by"
            >
                Used by {count === 1 ? '1 workflow' : `${count} workflows`}
            </Link>
        )
    }

    if (!item.channels.length) {
        return null
    }
    const senders = Array.from(new Set(item.emailSteps.map((step) => step.fromAddress).filter(Boolean)))
    const summary = <WorkflowDispatchSummary item={item} />
    if (!item.emailSteps.length) {
        return summary
    }
    return (
        <Tooltip
            title={
                <div className="flex flex-col gap-1.5 max-w-80">
                    {item.emailSteps.map((step) => (
                        <div key={step.actionId} className="flex flex-col">
                            <span className="font-semibold">{step.subject || 'No subject yet'}</span>
                            <span className="opacity-80">
                                From{' '}
                                {step.fromName
                                    ? `${step.fromName} <${step.fromAddress ?? '…'}>`
                                    : (step.fromAddress ?? 'no sender set')}
                                {step.libraryTemplateName ? ` · ${step.libraryTemplateName}` : ''}
                            </span>
                        </div>
                    ))}
                </div>
            }
        >
            <div className="flex items-center gap-2 min-w-0" data-attr="workflows-combined-sends">
                {summary}
                {!compact && senders.length > 0 && (
                    <span className="text-xs text-secondary truncate max-w-48">
                        {senders[0]}
                        {senders.length > 1 ? ` +${senders.length - 1}` : ''}
                    </span>
                )}
            </div>
        </Tooltip>
    )
}
