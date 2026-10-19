import type { DefaultEmailSender } from '../Channels/defaultEmailSender'
import type { HogFlowAction } from '../Workflows/hogflows/types'

export function needsFirstRunSender(
    action: HogFlowAction
): action is Extract<HogFlowAction, { type: 'function_email' | 'function' }> {
    if (
        action.type !== 'function_email' &&
        !(action.type === 'function' && action.config.template_id === 'template-email')
    ) {
        return false
    }
    const from = action.config.inputs?.email?.value?.from
    return !from?.integrationId && !from?.email && !from?.name
}

export function acceptsSandboxSender(action: HogFlowAction): boolean {
    return (
        action.type === 'function_email' && needsFirstRunSender(action) && !action.config.inputs?.email?.value?.replyTo
    )
}

export function withFirstRunSender(actions: HogFlowAction[], sender: DefaultEmailSender): HogFlowAction[] {
    return actions.map((action) => {
        if (!needsFirstRunSender(action)) {
            return action
        }
        if (sender.reason === 'sandbox_sender' && !acceptsSandboxSender(action)) {
            return action
        }
        const inputs = {
            ...action.config.inputs,
            email: {
                ...action.config.inputs?.email,
                value: {
                    ...action.config.inputs?.email?.value,
                    from: { ...action.config.inputs?.email?.value?.from, integrationId: sender.integrationId },
                },
            },
        }
        const updated: typeof action = { ...action }
        updated.config = { ...action.config, inputs }
        return updated
    })
}
