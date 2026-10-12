import { IntegrationType } from '~/types'

import { selectedSenderIds } from './selectSenders'
import { EmailTemplateFrom } from './types'

export function getUnverifiedEmailSenders(
    from: EmailTemplateFrom | undefined,
    integrations: IntegrationType[] | null
): IntegrationType[] {
    const sendingIds = new Set(selectedSenderIds(from))
    return (integrations ?? []).filter(
        (integration) =>
            integration.kind === 'email' && sendingIds.has(integration.id) && integration.config?.verified !== true
    )
}

export function getEmailSenderAddress(integration: IntegrationType): string {
    return integration.config?.email ?? integration.display_name
}
