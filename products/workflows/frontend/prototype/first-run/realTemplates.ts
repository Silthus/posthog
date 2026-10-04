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
    sends: string
}

const ENTRIES: EmailTemplateEntry[] = [
    {
        template: welcome as unknown as HogFlowTemplate,
        needs: 'signups',
        sends: 'Emails people when they sign up, then checks in a day later',
    },
    {
        template: onboardingStarted as unknown as HogFlowTemplate,
        needs: 'visits',
        sends: "Emails people who start onboarding but don't finish, and nudges once more if they still haven't",
    },
    {
        template: featureAdoption as unknown as HogFlowTemplate,
        needs: 'visits',
        sends: 'Emails a tip two days after someone first opens a feature, up to three tips until it clicks',
    },
    {
        template: reEngagement as unknown as HogFlowTemplate,
        needs: 'visits',
        sends: "Emails people who haven't been back for 14 days",
    },
    {
        template: unlockingFeatures as unknown as HogFlowTemplate,
        needs: 'visits',
        sends: 'Emails people the moment they qualify for advanced features',
    },
    {
        template: unusedFeatures as unknown as HogFlowTemplate,
        needs: 'visits',
        sends: "Checks every 10 days and emails people who haven't tried a key feature yet",
    },
    {
        template: heavyUsage as unknown as HogFlowTemplate,
        needs: 'milestone_reached',
        sends: 'Emails people close to their usage limit, and again a month later if they still are',
    },
    {
        template: trialEnding as unknown as HogFlowTemplate,
        needs: 'trial_started',
        sends: 'Emails trial users before their trial runs out',
    },
    {
        template: trialStarted as unknown as HogFlowTemplate,
        needs: 'trial_started',
        sends: 'Emails trial users who show buying intent, up to three times until they upgrade',
    },
    {
        template: celebrateMilestone as unknown as HogFlowTemplate,
        needs: 'milestone_reached',
        sends: 'Emails congratulations when someone reaches a milestone',
    },
    {
        template: announce as unknown as HogFlowTemplate,
        needs: '$feature_view',
        sends: "Emails people when a new feature unlocks for them, and follows up if they don't try it",
    },
]

for (const entry of ENTRIES) {
    entry.template = { ...entry.template, tags: entry.template.tags ?? [] }
}

export const EMAIL_TEMPLATES: HogFlowTemplate[] = ENTRIES.map((entry) => entry.template)

export interface TemplateFit {
    template: HogFlowTemplate
    sends: string
    ready: boolean
    reason: string
}

function fitFor(entry: EmailTemplateEntry, facts: ProjectFacts): TemplateFit {
    const { template, needs, sends } = entry
    if (needs === 'signups') {
        return {
            template,
            sends,
            ready: Boolean(facts.signupEvent),
            reason: 'Your app does not send a signed_up event yet',
        }
    }
    if (needs === 'visits') {
        return { template, sends, ready: facts.people > 0, reason: 'Your app does not send pageviews yet' }
    }
    return { template, sends, ready: false, reason: `Your app does not send a ${needs} event yet` }
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

export function sendsFor(template: HogFlowTemplate): string {
    return ENTRIES.find((entry) => entry.template.id === template.id)?.sends ?? 'Emails people when the trigger fires'
}
