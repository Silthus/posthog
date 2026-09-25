// PROTOTYPE (throwaway): the email lens. Answers "which workflow sends this email, from which address" and, from a
// workflow row, "what does this workflow send". `?emails_view=workflows` switches to the workflow-first table.
import { useActions, useValues } from 'kea'
import { router } from 'kea-router'

import { LemonBanner, LemonButton, LemonSegmentedButton, LemonSwitch } from '@posthog/lemon-ui'

import { humanFriendlyNumber } from 'lib/utils/numbers'
import { pluralize } from 'lib/utils/strings'

import { registerWorkflowFacet } from '../shared/workflowFacets'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { WorkflowsSearchBar } from '../shared/WorkflowsSearchBar'
import { EmailLens } from './EmailLens'
import { emailLensLogic } from './emailLensLogic'
import { itemCategoryTypes } from './emailLensModel'
import { EmailPreviewModal } from './EmailPreviewModal'
import { WorkflowEmailsTable } from './WorkflowEmailsTable'

registerWorkflowFacet({
    key: 'category',
    label: 'Message category',
    description: 'Marketing or transactional',
    getValues: itemCategoryTypes,
    formatValue: (value) => (value === 'marketing' ? 'Marketing' : value === 'transactional' ? 'Transactional' : value),
    order: 57,
})

type EmailsView = 'emails' | 'workflows'

function Summary(): JSX.Element {
    const { hasLoaded, hasActiveQuery } = useValues(workflowsPrototypeLogic)
    const { clearAll } = useActions(workflowsPrototypeLogic)
    const { totals, workflowsWithoutEmail, volumes } = useValues(emailLensLogic)

    if (!hasLoaded) {
        return <span className="text-secondary">Loading workflows…</span>
    }
    const linkedShare = totals.steps ? Math.round((totals.linkedSteps / totals.steps) * 100) : 0
    return (
        <>
            <span className="text-secondary" translate="no">
                {pluralize(totals.senders, 'sender')} · {pluralize(totals.emails, 'email')} ·{' '}
                {pluralize(totals.steps, 'email step')} in {pluralize(totals.workflows, 'workflow')} · {linkedShare}%
                linked to the Library
                {volumes !== null ? ` · ${humanFriendlyNumber(totals.sent7d)} sent in 7 days` : ''}
                {workflowsWithoutEmail ? ` · ${pluralize(workflowsWithoutEmail, 'workflow')} without email hidden` : ''}
            </span>
            {hasActiveQuery && (
                <LemonButton size="xsmall" type="tertiary" onClick={clearAll} data-attr="workflows-prototype-clear-all">
                    Clear all
                </LemonButton>
            )}
        </>
    )
}

export function EmailsVariant(): JSX.Element {
    const { searchParams, location } = useValues(router)
    const { hasLoaded, sourcesLoading, hasActiveQuery } = useValues(workflowsPrototypeLogic)
    const { clearAll } = useActions(workflowsPrototypeLogic)
    const { senderGroups, matchUnlinkedBySubject } = useValues(emailLensLogic)
    const { setMatchUnlinkedBySubject } = useActions(emailLensLogic)
    const view: EmailsView = searchParams.emails_view === 'workflows' ? 'workflows' : 'emails'

    const setView = (next: EmailsView): void => {
        router.actions.replace(location.pathname, {
            ...searchParams,
            emails_view: next === 'emails' ? undefined : next,
        })
    }

    return (
        <div data-attr="workflows-prototype-emails-variant" className="flex flex-col gap-2">
            <WorkflowsSearchBar />
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <LemonSegmentedButton
                    size="small"
                    value={view}
                    onChange={setView}
                    options={[
                        {
                            value: 'emails',
                            label: 'By sender and email',
                            'data-attr': 'workflows-prototype-emails-view',
                        },
                        { value: 'workflows', label: 'By workflow', 'data-attr': 'workflows-prototype-emails-view' },
                    ]}
                />
                <LemonSwitch
                    size="small"
                    bordered
                    checked={matchUnlinkedBySubject}
                    onChange={setMatchUnlinkedBySubject}
                    label="Match unlinked emails to the Library by subject"
                    data-attr="workflows-prototype-emails-match-subject"
                />
            </div>
            <div className="flex flex-wrap items-center gap-2 min-h-7 text-sm">
                <Summary />
            </div>
            {!hasLoaded || sourcesLoading ? (
                <div className="text-secondary py-8 text-center">Loading emails…</div>
            ) : senderGroups.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 border rounded">
                    <span>{hasActiveQuery ? 'No emails match these filters.' : 'No workflow sends email yet.'}</span>
                    {hasActiveQuery && (
                        <LemonButton size="small" type="secondary" onClick={clearAll}>
                            Clear all filters
                        </LemonButton>
                    )}
                </div>
            ) : view === 'emails' ? (
                <EmailLens />
            ) : (
                <WorkflowEmailsTable />
            )}
            {hasLoaded && (
                <LemonBanner type="info" className="mt-2">
                    Email steps without a Library link are grouped by subject. The editor copies a Library template's
                    content into the step and doesn't keep a link to it. A real build needs the editor to keep{' '}
                    <code>template_uuid</code> when it inserts a Library template, and a backfill that matches existing
                    steps by subject.
                </LemonBanner>
            )}
            <EmailPreviewModal />
        </div>
    )
}
