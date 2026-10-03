// PROTOTYPE ONLY (silthus/posthog#212). The welcome workflow a team turns on from its first example email.
import type { HogFlow, HogFlowAction } from '../../Workflows/hogflows/types'
import { TEAM_BRAND, WELCOME_EMAIL_NODE_ID, WELCOME_WORKFLOW_ID } from './firstRunScenario'

export const WELCOME_SUBJECT = `Welcome to ${TEAM_BRAND.name}`
const TIPS_SUBJECT = `Three things to try in ${TEAM_BRAND.name}`

export function welcomeEmailHtml({ branded, recipientName }: { branded: boolean; recipientName: string }): string {
    const accent = branded ? TEAM_BRAND.color : '#1d1f27'
    const logo = branded ? `&#9650; ${TEAM_BRAND.name}` : TEAM_BRAND.name
    return `<html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,sans-serif;color:#18181b">
<div style="max-width:520px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7">
<div style="background:${accent};color:#fff;padding:18px 24px;font-weight:700;font-size:18px">${logo}</div>
<div style="padding:24px">
<h1 style="margin:0 0 12px;font-size:22px">Welcome to ${TEAM_BRAND.name}</h1>
<p style="margin:0 0 12px;line-height:1.5">Hi ${recipientName}, thanks for signing up. We built ${TEAM_BRAND.name} to save you time, and the fastest way to see it is to create your first project.</p>
<p style="margin:0 0 20px;line-height:1.5">If anything gets in the way, just reply to this email. A real person reads every reply.</p>
<a href="#" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Create your first project</a>
<p style="margin:24px 0 0;color:#71717a;font-size:13px">Ada and the ${TEAM_BRAND.name} team</p>
</div></div></body></html>`
}

function emailStep(id: string, name: string, subject: string, html: string, integrationId: number): HogFlowAction {
    return {
        id,
        type: 'function_email',
        name,
        description: '',
        config: {
            template_id: 'template-email',
            inputs: {
                email: {
                    order: 0,
                    templating: 'liquid',
                    value: {
                        to: { name: '{{ person.properties.name }}', email: '{{ person.properties.email }}' },
                        from: { integrationId },
                        subject,
                        preheader: '',
                        html,
                        text: '',
                    },
                },
            },
        },
    } as HogFlowAction
}

export function welcomeWorkflow({
    status,
    senderIntegrationId,
    signupEvent,
}: {
    status: HogFlow['status']
    senderIntegrationId: number
    signupEvent: string
}): HogFlow {
    const trigger: HogFlow['trigger'] = {
        type: 'event',
        filters: { events: [{ id: signupEvent, name: signupEvent, type: 'events' }], properties: [], actions: [] },
    }
    const html = welcomeEmailHtml({ branded: true, recipientName: '{{ person.properties.name }}' })
    const actions: HogFlowAction[] = [
        {
            id: 'trigger_node',
            type: 'trigger',
            name: 'Someone signs up',
            description: `Starts when your app captures ${signupEvent}.`,
            config: trigger,
        } as HogFlowAction,
        emailStep(WELCOME_EMAIL_NODE_ID, 'Welcome email', WELCOME_SUBJECT, html, senderIntegrationId),
        {
            id: 'wait-two-days',
            type: 'delay',
            name: 'Wait 2 days',
            description: '',
            config: { delay_duration: '2d' },
        } as HogFlowAction,
        emailStep('tips-email', 'Tips email', TIPS_SUBJECT, html, senderIntegrationId),
        {
            id: 'exit_node',
            type: 'exit',
            name: 'Exit',
            description: '',
            config: { reason: 'Completed' },
        } as HogFlowAction,
    ]
    const order = actions.map((action) => action.id)
    return {
        id: WELCOME_WORKFLOW_ID,
        team_id: 1,
        version: 1,
        name: 'Welcome new signups',
        description: 'Greets every new signup, then follows up with tips two days later.',
        status,
        trigger,
        conversion: { window: '7d', filters: [] },
        exit_condition: 'exit_only_at_end',
        variables: [],
        actions,
        edges: order.slice(1).map((to, index) => ({ from: order[index], to, type: 'continue' as const })),
        created_at: '2026-10-03T09:00:00.000Z',
        updated_at: '2026-10-03T09:00:00.000Z',
    } as HogFlow
}
