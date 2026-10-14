import { DateTime } from 'luxon'
import { z } from 'zod'

import { HogFlow } from '~/cdp/schema/hogflow'
import { CyclotronJobInvocationHogFlow, HogFunctionInvocationGlobals } from '~/cdp/types'
import { convertToHogFunctionFilterGlobal } from '~/cdp/utils/hog-function-filtering'
import { UUID, UUIDT } from '~/common/utils/utils'

import { createHogFlowInvocation } from './hogflow-executor.service'

export const API_SENDS_ORIGIN_PRODUCT = 'api_sends'

export const ApiSendInvocationSchema = z.object({
    // Django mints UUIDTs, whose version and variant nibbles carry a series counter.
    invocation_id: z.string().refine((id) => UUID.validateString(id, false), 'invocation_id must be a UUID'),
    distinct_id: z.string().min(1).nullable(),
    email: z.object({
        to: z.string(),
        integration_id: z.number().int(),
        from_email: z.string(),
        from_name: z.string(),
        reply_to: z.string(),
        cc: z.string(),
        bcc: z.string(),
        subject: z.string(),
        text: z.string(),
        html: z.string(),
    }),
})

export type ApiSendInvocation = z.infer<typeof ApiSendInvocationSchema>

export function createApiSendInvocation(
    send: ApiSendInvocation,
    hogFlow: HogFlow,
    project: HogFunctionInvocationGlobals['project']
): CyclotronJobInvocationHogFlow {
    const event: HogFunctionInvocationGlobals['event'] = {
        uuid: new UUIDT().toString(),
        event: '$workflows_api_send',
        // Without a caller distinct id the delivery events land on a throwaway id, not a person.
        distinct_id: send.distinct_id ?? `api-send-${send.invocation_id}`,
        timestamp: DateTime.now().toISO(),
        url: '',
        properties: {},
        elements_chain: '',
    }
    const variables = { email: send.email }
    const filterGlobals = convertToHogFunctionFilterGlobal({ event, person: undefined, groups: {}, variables })

    return { ...createHogFlowInvocation({ event, project, variables }, hogFlow, filterGlobals), id: send.invocation_id }
}

// The invocation id is the job's primary key, so a replayed send fails the insert instead of
// queueing a second job.
export function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}
