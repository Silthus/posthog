// Secrets are named in the source and resolved from the deployer's environment at push.
// The emitted definition carries the name, never the value, so `check` can print and a
// reviewer can read a definition holding secrets without any credential in scope.

import { WorkflowError } from './errors'
import type { SecretRef } from './types'

/** Names an environment variable the push resolves. Never holds a value. */
export function secret(name: string): SecretRef {
    return { __posthog_secret: name }
}

export function isSecretRef(value: unknown): value is SecretRef {
    return typeof value === 'object' && value !== null && typeof (value as SecretRef).__posthog_secret === 'string'
}

export interface SecretSlot {
    readonly actionId: string
    readonly inputKey: string
    readonly variable: string
}

/** Every secret the definition names, in `actionId.inputKey` order. */
export function findSecrets(actions: readonly { id: string; config: unknown }[]): SecretSlot[] {
    const slots: SecretSlot[] = []
    for (const action of actions) {
        const inputs = (action.config as { inputs?: Record<string, { value?: unknown }> }).inputs
        if (!inputs) {
            continue
        }
        for (const [inputKey, wrapper] of Object.entries(inputs)) {
            if (isSecretRef(wrapper?.value)) {
                slots.push({ actionId: action.id, inputKey, variable: wrapper.value.__posthog_secret })
            }
        }
    }
    return slots
}

/**
 * Replaces every marker with the value from the environment. An undefined variable is a
 * hard failure naming it, because the alternative is a push that silently leaves whatever
 * PostHog already stored in place and reports success.
 */
export function resolveSecrets<T>(definition: T, env: Record<string, string | undefined>): T {
    return JSON.parse(
        JSON.stringify(definition, (_key, value) => {
            if (!isSecretRef(value)) {
                return value
            }
            const resolved = env[value.__posthog_secret]
            if (resolved === undefined || resolved === '') {
                throw new WorkflowError({
                    status: 'missing_secret',
                    message: `${value.__posthog_secret} is not set.`,
                    why: `The workflow names it with secret('${value.__posthog_secret}'), and push always sends the resolved value rather than relying on what PostHog already stores.`,
                    fix: `Set ${value.__posthog_secret} in the environment that runs push. In GitHub Actions add it under env: from a repository secret.`,
                })
            }
            return resolved
        })
    ) as T
}
