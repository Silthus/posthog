// Step values. A step is a plain frozen value with no position and no id, so the
// same value can sit at two places in one graph. Every authoring shape in
// sdk/shapes.ts produces these values and nothing else.

import type { Duration, EmailMessage, PropertyCondition, PropertyOperator, PropertyType } from './types'

/**
 * A named environment variable, resolved at push from the deployer's environment
 * and always sent (decision 15 on issue #69). The name travels in the source, the
 * value never does.
 */
export interface SecretRef {
    readonly __secret: string
}

export function secret(envName: string): SecretRef {
    return Object.freeze({ __secret: envName })
}

export function isSecretRef(value: unknown): value is SecretRef {
    return typeof value === 'object' && value !== null && typeof (value as SecretRef).__secret === 'string'
}

/** At least one condition. An empty `when` is a compile error, not a runtime one. */
export type Conditions = readonly [PropertyCondition, ...PropertyCondition[]]

/**
 * A sub-path is a non-empty tuple of step values. `readonly Step[]` would accept
 * `[]`, and an empty branch path emits a branch edge aimed at the no-match target,
 * so the tuple is what keeps that a compile error under reuse.
 */
export type Path = readonly [Step, ...Step[]]

export interface BranchSpec {
    readonly name: string
    readonly when: Conditions
    readonly then: Path
}

export type Step =
    | Readonly<{ kind: 'delay'; name: string; duration: Duration }>
    | Readonly<{
          kind: 'function'
          name: string
          templateId: string
          inputs: Readonly<Record<string, unknown>>
      }>
    | Readonly<{ kind: 'email'; name: string; email: EmailMessage }>
    | Readonly<{ kind: 'branch'; name: string; branches: readonly [BranchSpec, ...BranchSpec[]] }>

export function delay(duration: Duration, options?: { name?: string }): Step {
    return Object.freeze({ kind: 'delay' as const, name: options?.name ?? `Wait ${duration}`, duration })
}

/** The loose escape hatch. Inputs are validated at push, not by the compiler. */
export function fn(options: { name: string; templateId: string; inputs: Readonly<Record<string, unknown>> }): Step {
    return Object.freeze({
        kind: 'function' as const,
        name: options.name,
        templateId: options.templateId,
        inputs: options.inputs,
    })
}

/** Sugar over `fn` for `template-webhook`. `signingSecret` is the one secret in the v1 surface. */
export function webhook(options: {
    name: string
    url: string
    method?: 'POST' | 'PUT' | 'PATCH' | 'GET' | 'DELETE'
    body?: Record<string, unknown>
    headers?: Record<string, string>
    signingSecret?: SecretRef
}): Step {
    const inputs: Record<string, unknown> = {
        url: options.url,
        method: options.method ?? 'POST',
        body: options.body ?? {},
    }
    if (options.headers) {
        inputs.headers = options.headers
    }
    if (options.signingSecret) {
        inputs.signing_secret = options.signingSecret
    }
    return fn({ name: options.name, templateId: 'template-webhook', inputs })
}

/**
 * A typed email step. Content is inline: the SDK has no `template_uuid`, because
 * the server materializes a referenced library template on write and the stored
 * definition would then never match what we sent.
 */
export function email(options: {
    name: string
    to: string
    subject: string
    text: string
    html: string
    preheader?: string
    fromIntegrationId?: number
}): Step {
    const message: EmailMessage = {
        from: options.fromIntegrationId === undefined ? {} : { integrationId: options.fromIntegrationId },
        to: { email: options.to },
        subject: options.subject,
        text: options.text,
        html: options.html,
        ...(options.preheader === undefined ? {} : { preheader: options.preheader }),
    }
    return Object.freeze({ kind: 'email' as const, name: options.name, email: message })
}

export function branch(options: { name: string; branches: readonly [BranchSpec, ...BranchSpec[]] }): Step {
    return Object.freeze({ kind: 'branch' as const, name: options.name, branches: options.branches })
}

/** Names a reusable sub-path. Identity is the tuple, so a path is a value like a step. */
export function path(...steps: Path): Path {
    return steps
}

function condition(type: PropertyType) {
    return (
        key: string,
        operator: PropertyOperator,
        value?: readonly (string | number | boolean)[]
    ): PropertyCondition => ({ key, operator, value, type })
}

export const person = condition('person')
export const eventProperty = condition('event')
