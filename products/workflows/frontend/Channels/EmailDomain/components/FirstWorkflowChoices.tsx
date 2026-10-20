import { useValues } from 'kea'
import { ReactNode } from 'react'

import { WorkflowDataSuggestions } from '../../../setupGuide/suggestions/WorkflowDataSuggestions'
import { workflowDataSuggestionsLogic } from '../../../setupGuide/suggestions/workflowDataSuggestionsLogic'
import { WorkflowTemplateBlankCard } from '../../../Workflows/templates/WorkflowTemplateBlankCard'
import { emailDomainLogic } from '../emailDomainLogic'
import { CreateWelcomeWorkflowAction } from './CreateWelcomeWorkflowAction'

/** Where the choices show: the last step, or the wait for DNS. Each reports its own data-attrs. */
export type FirstWorkflowChoicesPlacement = 'ready' | 'verifying'

// pinned: data-attr prefixes, autocapture dashboards read them
const DATA_ATTR_PREFIX: Record<FirstWorkflowChoicesPlacement, string> = {
    ready: 'email-domain',
    verifying: 'email-domain-verifying',
}

/** The ways to start a first workflow from the domain wizard: suggestions once loaded, else the welcome template, and always a blank workflow. */
export function FirstWorkflowChoices({
    placement = 'ready',
}: {
    placement?: FirstWorkflowChoicesPlacement
}): JSX.Element {
    const { offersDataSuggestions } = useValues(emailDomainLogic)
    const prefix = DATA_ATTR_PREFIX[placement]

    // The suggestions logic loads on mount, so it only mounts behind the flag.
    return offersDataSuggestions ? (
        <ChoicesWithSuggestions prefix={prefix} />
    ) : (
        <Choices prefix={prefix} suggestionsShown={false} />
    )
}

function ChoicesWithSuggestions({ prefix }: { prefix: string }): JSX.Element {
    const { cards } = useValues(workflowDataSuggestionsLogic({ surface: 'email_domain_wizard' }))

    // Loaded suggestions replace the welcome template. Until then the template stays the first choice.
    return (
        <Choices prefix={prefix} suggestionsShown={cards.length > 0}>
            <WorkflowDataSuggestions surface="email_domain_wizard" />
        </Choices>
    )
}

function Choices({
    prefix,
    suggestionsShown,
    children,
}: {
    prefix: string
    suggestionsShown: boolean
    children?: ReactNode
}): JSX.Element {
    return (
        <div className="flex flex-col gap-5" data-attr={`${prefix}-workflow-choices`}>
            {!suggestionsShown && <CreateWelcomeWorkflowAction data-attr={`${prefix}-create-welcome-workflow`} />}
            <WorkflowTemplateBlankCard data-attr={`${prefix}-create-blank-workflow`} />
            {children}
        </div>
    )
}
