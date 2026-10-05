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

export interface StartsOn {
    kind: 'event' | 'no-event' | 'schedule'
    event?: string
    detail?: string
}

interface EmailTemplateEntry {
    template: HogFlowTemplate
    needs: Needs
    sends: string
    startsOn: StartsOn
}

const ENTRIES: EmailTemplateEntry[] = [
    {
        template: welcome as unknown as HogFlowTemplate,
        needs: 'signups',
        sends: 'Emails people when they sign up, then checks in a day later',
        startsOn: { kind: 'event', event: 'signed_up' },
    },
    {
        template: onboardingStarted as unknown as HogFlowTemplate,
        needs: 'visits',
        sends: "Emails people who start onboarding but don't finish, and nudges once more if they still haven't",
        startsOn: { kind: 'event', event: '$pageview', detail: 'on /onboarding' },
    },
    {
        template: featureAdoption as unknown as HogFlowTemplate,
        needs: 'visits',
        sends: 'Emails a tip two days after someone first opens a feature, up to three tips until it clicks',
        startsOn: { kind: 'event', event: '$pageview', detail: 'first time on a feature' },
    },
    {
        template: reEngagement as unknown as HogFlowTemplate,
        needs: 'visits',
        sends: "Emails people who haven't been back for 14 days",
        startsOn: { kind: 'no-event', event: '$pageview', detail: 'for 14 days' },
    },
    {
        template: unlockingFeatures as unknown as HogFlowTemplate,
        needs: 'visits',
        sends: 'Emails people the moment they qualify for advanced features',
        startsOn: { kind: 'event', event: '$pageview', detail: 'after a key action' },
    },
    {
        template: unusedFeatures as unknown as HogFlowTemplate,
        needs: 'visits',
        sends: "Checks every 10 days and emails people who haven't tried a key feature yet",
        startsOn: { kind: 'schedule', detail: 'Every 10 days' },
    },
    {
        template: heavyUsage as unknown as HogFlowTemplate,
        needs: 'milestone_reached',
        sends: 'Emails people close to their usage limit, and again a month later if they still are',
        startsOn: { kind: 'event', event: 'usage_limit_near' },
    },
    {
        template: trialEnding as unknown as HogFlowTemplate,
        needs: 'trial_started',
        sends: 'Emails trial users before their trial runs out',
        startsOn: { kind: 'event', event: 'trial_started', detail: 'ends in 3 days' },
    },
    {
        template: trialStarted as unknown as HogFlowTemplate,
        needs: 'trial_started',
        sends: 'Emails trial users who show buying intent, up to three times until they upgrade',
        startsOn: { kind: 'event', event: 'trial_started' },
    },
    {
        template: celebrateMilestone as unknown as HogFlowTemplate,
        needs: 'milestone_reached',
        sends: 'Emails congratulations when someone reaches a milestone',
        startsOn: { kind: 'event', event: 'milestone_reached' },
    },
    {
        template: announce as unknown as HogFlowTemplate,
        needs: '$feature_view',
        sends: "Emails people when a new feature unlocks for them, and follows up if they don't try it",
        startsOn: { kind: 'event', event: '$feature_view' },
    },
]

for (const entry of ENTRIES) {
    entry.template = { ...entry.template, tags: entry.template.tags ?? [] }
}

export const EMAIL_TEMPLATES: HogFlowTemplate[] = ENTRIES.map((entry) => entry.template)

export interface TemplateFit {
    template: HogFlowTemplate
    startsOn: StartsOn
    ready: boolean
    reason: string
}

function fitFor(entry: EmailTemplateEntry, facts: ProjectFacts): TemplateFit {
    const { template, needs } = entry
    const startsOn =
        needs === 'signups' && facts.signupEvent ? { ...entry.startsOn, event: facts.signupEvent } : entry.startsOn
    if (needs === 'signups') {
        return {
            template,
            startsOn,
            ready: Boolean(facts.signupEvent),
            reason: 'Your app does not send a signed_up event yet',
        }
    }
    if (needs === 'visits') {
        return { template, startsOn, ready: facts.people > 0, reason: 'Your app does not send pageviews yet' }
    }
    return { template, startsOn, ready: false, reason: `Your app does not send a ${startsOn.event} event yet` }
}

export function templateFits(facts: ProjectFacts): TemplateFit[] {
    return ENTRIES.map((entry) => fitFor(entry, facts))
}

export interface Recommendation {
    templateId: string
    reason: string
}

// A fixed rule for the prototype. In the product a Jev decision (silthus/posthog#240) could weigh the
// project's events, people and past sends to pick the starter.
export function recommendStarter(fits: TemplateFit[], facts: ProjectFacts): Recommendation | null {
    const welcomeFit = fits.find((fit) => fit.template.id === welcome.id)
    if (welcomeFit?.ready) {
        return {
            templateId: welcomeFit.template.id,
            reason: `The quickest win: you already track ${facts.signupEvent}, and every new signup gets it`,
        }
    }
    const firstReady = fits.find((fit) => fit.ready)
    return firstReady
        ? { templateId: firstReady.template.id, reason: 'Your events can drive it today, with no setup' }
        : null
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
