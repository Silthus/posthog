import { v5 as uuid } from 'uuid'

import type { AnyPropertyFilter } from '~/types'

export interface BroadcastReleaseSeed {
    projectUuid: string
    experimentId: number
    experimentName: string
    flagId: number
    flagKey: string
    variantKey: string
    releaseToEveryone: boolean
}

export interface BroadcastReleaseSession {
    contextKey: string
    seed: BroadcastReleaseSeed
    audienceChosen: boolean
    audienceKey?: string
    savedAt: number
}

const pending = new Map<string, BroadcastReleaseSession>()
const SESSION_KEY = 'broadcast-release-editing'
const MAX_AGE = 14 * 24 * 60 * 60 * 1000

export function isValidBroadcastReleaseSeed(seed: BroadcastReleaseSeed): boolean {
    return (
        Number.isSafeInteger(seed.experimentId) &&
        seed.experimentId > 0 &&
        Number.isSafeInteger(seed.flagId) &&
        seed.flagId > 0 &&
        [seed.projectUuid, seed.experimentName, seed.flagKey, seed.variantKey].every(
            (value) => typeof value === 'string' && value.length > 0 && value.length <= 200
        ) &&
        typeof seed.releaseToEveryone === 'boolean'
    )
}

export function stageBroadcastRelease(contextKey: string, seed: BroadcastReleaseSeed): void {
    pending.clear()
    pending.set(contextKey, { contextKey, seed, audienceChosen: false, savedAt: Date.now() })
}

export function takeBroadcastRelease(contextKey: string, projectUuid: string): BroadcastReleaseSession | null {
    const session = pending.get(contextKey)
    pending.delete(contextKey)
    return session && session.seed.projectUuid === projectUuid && session.savedAt > Date.now() - MAX_AGE
        ? session
        : null
}

export function loadBroadcastReleaseSession(id: string, projectUuid: string): BroadcastReleaseSession | null {
    try {
        const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}')[id] as
            | BroadcastReleaseSession
            | undefined
        return session &&
            isValidBroadcastReleaseSeed(session.seed) &&
            session.seed.projectUuid === projectUuid &&
            session.savedAt > Date.now() - MAX_AGE
            ? session
            : null
    } catch {
        return null
    }
}

export function broadcastReleaseAudienceKey(properties: AnyPropertyFilter[]): string {
    return uuid(JSON.stringify(properties), uuid.URL)
}

export function saveBroadcastReleaseSession(
    id: string,
    session: BroadcastReleaseSession,
    properties: AnyPropertyFilter[]
): void {
    try {
        const sessions: Record<string, BroadcastReleaseSession> = JSON.parse(
            sessionStorage.getItem(SESSION_KEY) ?? '{}'
        )
        sessionStorage.setItem(
            SESSION_KEY,
            JSON.stringify(
                Object.fromEntries(
                    [
                        ...Object.entries(sessions).filter(([key]) => key !== id),
                        [id, { ...session, audienceKey: broadcastReleaseAudienceKey(properties) }],
                    ]
                        .filter(([, value]) => (value as BroadcastReleaseSession).savedAt > Date.now() - MAX_AGE)
                        .slice(-100)
                )
            )
        )
    } catch {
        return
    }
}
