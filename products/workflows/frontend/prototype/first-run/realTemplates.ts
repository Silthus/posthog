// PROTOTYPE ONLY (silthus/posthog#212). The real global templates, straight from the backend's template files,
// with a rule per template for whether the project's data can drive it.
import announce from '../../../backend/templates/announce_a_new_feature_template.json'
import celebrateMilestone from '../../../backend/templates/celebrate-milestone.json'
import featureAdoption from '../../../backend/templates/feature-adoption-tips.json'
import heavyUsage from '../../../backend/templates/heavy-usage-detected.json'
import onboardingStarted from '../../../backend/templates/onboarding_started_but_not_completed_template.json'
import reEngagement from '../../../backend/templates/re-engagement-workflow.json'
import trialEnding from '../../../backend/templates/trial-ending-reminder.json'
import trialStarted from '../../../backend/templates/trial_started_upgrade_nudge_template.json'
import unlockingFeatures from '../../../backend/templates/unlocking_advanced_features.json'
import unusedFeatures from '../../../backend/templates/unused-features-education.json'
import welcome from '../../../backend/templates/welcome_email_sequence_template.json'
import type { HogFlowAction, HogFlowTemplate } from '../../Workflows/hogflows/types'
import { ProjectFacts } from './firstRunScenario'

type Needs = 'signups' | 'visits' | 'trial_started' | 'milestone_reached' | '$feature_view'

interface EmailTemplateEntry {
    template: HogFlowTemplate
    needs: Needs
}

const ENTRIES: EmailTemplateEntry[] = [
    { template: welcome as unknown as HogFlowTemplate, needs: 'signups' },
    { template: onboardingStarted as unknown as HogFlowTemplate, needs: 'visits' },
    { template: featureAdoption as unknown as HogFlowTemplate, needs: 'visits' },
    { template: reEngagement as unknown as HogFlowTemplate, needs: 'visits' },
    { template: unlockingFeatures as unknown as HogFlowTemplate, needs: 'visits' },
    { template: unusedFeatures as unknown as HogFlowTemplate, needs: 'visits' },
    { template: heavyUsage as unknown as HogFlowTemplate, needs: 'milestone_reached' },
    { template: trialEnding as unknown as HogFlowTemplate, needs: 'trial_started' },
    { template: trialStarted as unknown as HogFlowTemplate, needs: 'trial_started' },
    { template: celebrateMilestone as unknown as HogFlowTemplate, needs: 'milestone_reached' },
    { template: announce as unknown as HogFlowTemplate, needs: '$feature_view' },
]

for (const entry of ENTRIES) {
    entry.template = { ...entry.template, tags: entry.template.tags ?? [] }
}

export const EMAIL_TEMPLATES: HogFlowTemplate[] = ENTRIES.map((entry) => entry.template)

export interface TemplateFit {
    template: HogFlowTemplate
    ready: boolean
    reason: string
}

function fitFor(entry: EmailTemplateEntry, facts: ProjectFacts): TemplateFit {
    const { template, needs } = entry
    if (needs === 'signups') {
        return facts.signupEvent
            ? { template, ready: true, reason: `${facts.signupsThisMonth.toLocaleString()} signups this month` }
            : { template, ready: false, reason: 'Needs a signed_up event' }
    }
    if (needs === 'visits') {
        return facts.people
            ? { template, ready: true, reason: `${facts.people.toLocaleString()} people use your app` }
            : { template, ready: false, reason: 'Needs pageviews from your app' }
    }
    return { template, ready: false, reason: `Needs a ${needs} event` }
}

export function templateFits(facts: ProjectFacts): TemplateFit[] {
    return ENTRIES.map((entry) => fitFor(entry, facts))
}

export function templateById(id: string): HogFlowTemplate {
    return EMAIL_TEMPLATES.find((template) => template.id === id) ?? EMAIL_TEMPLATES[0]
}

export type EmailAction = Extract<HogFlowAction, { type: 'function_email' }>

export function emailActions(template: HogFlowTemplate): EmailAction[] {
    return template.actions.filter((action): action is EmailAction => action.type === 'function_email')
}

export function firstEmailValue(template: HogFlowTemplate): Record<string, any> {
    return (emailActions(template)[0].config.inputs as Record<string, any>).email.value
}
