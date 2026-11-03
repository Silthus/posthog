// Node seams for scheduled transactional email sends (rung 4).
// Names marked "added" are new. Everything else exists on master or in the cdp-api PR this map builds on,
// PostHog/posthog#127122 (head 474a7662c30).

// --- cdp-api routes ----------------------------------------------------------------------------------------
// POST /api/projects/:team_id/hog_flows/:id/transactional_email        (template_id form)   JWT team + workflow
// POST /api/projects/:team_id/hog_flows/:id/transactional_email/send   (template_key form)  JWT team + workflow
//   Both schemas gain  scheduled_at?: string  (ISO 8601 with offset). Both call TransactionalSends.accept.
//   202 { status: 'queued' | 'scheduled', invocation_id, replayed, scheduled_at? }
//   400 { error: 'invalid_scheduled_at', reason: 'too_far' }
// GET  /api/projects/:team_id/transactional_emails/scheduled?cursor=&limit=          JWT team only (added)
//   200 { results: [{ invocation_id, to, scheduled_at, created_at }], next_cursor }
// POST /api/projects/:team_id/transactional_emails/:id/cancel                          JWT team only (added)
//   200 { status: 'canceled' } | 404 { error: 'not_found' } | 409 { error: 'already_sending' }
// POST /api/projects/:team_id/transactional_emails/:id/reschedule  { scheduled_at }    JWT team only (added)
//   200 { status: 'scheduled', scheduled_at } | 400 | 404 | 409 { error: 'already_sending' | 'canceled' }

// --- Transactional sends (added module) --------------------------------------------------------------------
export const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000

export type AcceptInput = {
    team: Team
    hogFlow: HogFlow
    request: TransactionalEmailRequest // gains scheduledAt?: Date
    idempotencyKey?: string
}
export type AcceptRefusal =
    | { code: 'not_sendable'; httpStatus: 400 }
    | { code: 'recipient_unreachable' | 'recipient_suppressed'; httpStatus: 422 }
    | { code: 'sending_suspended' | 'sending_paused'; httpStatus: 422 }
    | { code: 'quota_limited'; httpStatus: 429 }
    | { code: 'idempotency_key_in_flight'; httpStatus: 409 }
    | { code: 'idempotency_key_reused'; httpStatus: 422 }
    | { code: 'idempotency_unavailable' | 'not_configured'; httpStatus: 503 }
export type AcceptResult =
    | { outcome: 'queued'; messageId: string; replayed: boolean }
    | { outcome: 'scheduled'; messageId: string; replayed: boolean; scheduledAt: Date }
    | { outcome: 'invalid_scheduled_at'; reason: 'too_far' }
    | ({ outcome: 'refused' } & AcceptRefusal)
// cdp-api answers invalid_request (400) and a missing workflow (404) before it calls accept.

export type CancelResult =
    | { outcome: 'canceled' } // first cancel, or a repeat while the row still exists
    | { outcome: 'already_sending' }
    | { outcome: 'not_found' }
export type RescheduleResult =
    | { outcome: 'scheduled'; scheduledAt: Date }
    | { outcome: 'invalid_scheduled_at'; reason: 'too_far' }
    | { outcome: 'already_sending' | 'canceled' | 'not_found' }
export type ScheduledPage = {
    results: { messageId: string; to: string; scheduledAt: Date; createdAt: Date }[]
    nextCursor: string | null
}

export interface TransactionalSends {
    accept(input: AcceptInput): Promise<AcceptResult>
    cancel(teamId: number, messageId: string): Promise<CancelResult>
    reschedule(teamId: number, messageId: string, scheduledAt: Date): Promise<RescheduleResult>
    list(teamId: number, cursor: string | null, limit: number): Promise<ScheduledPage>
}
// Invariants
// - accept: reserve key -> time rules -> refusal checks -> run row -> insert -> markQueued -> status row.
// - The stored idempotency key gains scheduledAt: the accepted time as a UTC ISO 8601 string, or null for a
//   send now. A replay answers from the stored key, never from the clock at replay time. It writes the
//   'scheduled' row again only when scheduledAt is set (round 3 Q1). A key stored before this change has no
//   scheduledAt and replays as a send now.
// - The fingerprint stays exactly as it is when scheduled_at is absent, so keys stored before the deploy still
//   match. When it is present, the fingerprint appends a 'scheduled_at' marker and the UTC ISO 8601 string,
//   never a Date: the fingerprint helper walks enumerable properties, and a Date has none.
// - Time rules (Q6), checked in this order:
//   scheduledAt <= now: accept treats it as a send now ('queued'). reschedule sets the send time to now and
//     answers 'scheduled', because the status stays 'scheduled' until the outcome (round 3 Q2).
//   scheduledAt > createdAt(messageId) + MAX_SCHEDULE_AHEAD_MS: invalid_scheduled_at 'too_far'.
//   createdAt comes from the message id (UUIDT), so a reschedule cannot extend the bound. A time at or before
//   now is never too far, so a waiting send can always be moved to now, even after the cap.
// - cancel 'canceled' writes the run row (hogFlow: { id: functionId }) and the status row, flushes both, and
//   counts the canceled and pending triggered metrics. A repeat ('already_canceled' below) skips the metrics.
// - Every manager call passes teamId; a row of another team answers not_found.
// Errors: Postgres or Valkey unavailable -> refused 503 (accept) or a thrown error that cdp-api maps to 503.

// --- CyclotronV2Manager (added operations) ------------------------------------------------------------------
export type UnclaimedRow = { id: string; functionId: string; scheduled: Date; created: Date; state: Buffer | null }

export interface CyclotronV2ManagerAdditions {
    cancelUnclaimed(
        teamId: number,
        id: string
    ): Promise<{ outcome: 'canceled' | 'already_canceled'; row: UnclaimedRow } | { outcome: 'claimed' | 'not_found' }>
    //   UPDATE cyclotron_jobs SET status = 'canceled', last_transition = NOW()
    //   WHERE id = $2 AND team_id = $1 AND queue_name = 'email' AND status = 'available' AND transition_count = 0
    //   RETURNING id, function_id, scheduled, created, state
    //   No match: one SELECT by (id, team_id). canceled with transition_count 0 -> already_canceled;
    //   no row -> not_found; anything else -> claimed.

    rescheduleUnclaimed(
        teamId: number,
        id: string,
        at: Date
    ): Promise<{ outcome: 'rescheduled'; row: UnclaimedRow } | { outcome: 'claimed' | 'canceled' | 'not_found' }>
    //   Same guard plus cancel_requested_at IS NULL; SET scheduled = $3. dequeue_seq keeps its accept-time value.
    //   No match: one SELECT. canceled, or cancel_requested_at set -> canceled; no row -> not_found; else claimed.

    listUnclaimed(teamId: number, after: { scheduled: Date; id: string } | null, limit: number): Promise<UnclaimedRow[]>
    //   WHERE team_id = $1 AND queue_name = 'email' AND status = 'available' AND transition_count = 0
    //     AND scheduled > NOW()
    //     AND (scheduled, id) > ($2, $3)        -- only when after is set; the first page leaves it out
    //   ORDER BY scheduled, id LIMIT $4         -- limit 1..100
    //   Served by a cyclotron migration (rust/cyclotron-node-migrations, -- no-transaction):
    //   CREATE INDEX CONCURRENTLY idx_cyclotron_jobs_email_unclaimed ON cyclotron_jobs (team_id, scheduled, id)
    //   WHERE queue_name = 'email' AND status = 'available' AND transition_count = 0
    //   Send-now emails enter this index too, until a worker claims them: one more index entry per send.
}

// Existing upserts, changed (Q7): createJob and bulkCreateJobs with overwriteExisting skip a job canceled before
// any claim. Only cancelUnclaimed writes 'canceled' with transition_count 0; the worker's cancel runs after a
// claim has counted a transition. The guard holds only while the row exists: after the janitor deletes it, a
// rerun that read its page before the cancel inserts the job as a new row.
//   ... WHERE cyclotron_jobs.status IN ('completed', 'failed', 'canceled')
//         AND NOT (cyclotron_jobs.status = 'canceled' AND cyclotron_jobs.transition_count = 0)

// Performance and locking: cancel and reschedule are a primary-key update plus, on a miss, one primary-key read.
// An update that meets a locked row waits for that transaction, then checks its guard again; no lock timeout is
// added. The list is one index range scan of at most limit rows, on a snapshot, and never waits for a row lock.
// Each waiting scheduled send also sits in the email claim index (Q5).

// --- Job codec (added module) -------------------------------------------------------------------------------
export type SerializedJobState = /* moved from job-queue-postgres-v2.ts */ unknown
export type LookupColumnSource = /* moved */ unknown
export function serializeState(invocation: CyclotronJobInvocation): Buffer // moved, unchanged
export function encodeJob(invocation: CyclotronJobInvocation): CyclotronV2JobInit // pure; no metrics
export function v2JobToInvocation(job: CyclotronV2DequeuedJob): CyclotronJobInvocation // moved, unchanged
export function decodeJobState(row: UnclaimedRow & { teamId: number; queueName: string }): CyclotronJobInvocation // added
// extract* helpers move with them. The codec imports cyclotron types with `import type` only.
// The adapter keeps invocationToV2JobInit = encodeJob + the cdpJobSizeKb / cdpJobSizeCompressedKb metrics.

// --- EmailStatusService ------------------------------------------------------------------------------------
export type EmailStatus =
    | 'scheduled'
    | 'queued'
    | 'canceled'
    | 'failed'
    | 'sent'
    | 'delivered'
    | 'bounced'
    | 'complained'
export const STATUS_RANK = {
    scheduled: 0n,
    queued: 0n,
    canceled: 1n,
    failed: 2n,
    sent: 3n,
    delivered: 5n,
    bounced: 6n,
    complained: 7n,
} // Q4
// RUN_FAILED_RANK stays 1n and PROVIDER_REJECTED_RANK stays 4n. Ranks already written never change.
