Email status record and GET emails/{message_id}
Slice: 08
Strand: send-api
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), sections "Contract pins", "Send API (ours)"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921), "Read (later PR)"
Architecture: #526, seams `EmailStatusWriter` and `get_email_status`, PR "10 Status record", ADR 0005
Repository: PostHog/posthog
Base: `master`, once slice 04 merges

## What to build

- A narrow ClickHouse table on the AUX cluster: `ReplicatedReplacingMergeTree(version)`, `ORDER BY (team_id, message_id)`, 30-day TTL, fed from Kafka. `version` is the status rank times 2^48 plus the time in ms, so a status only moves forward.
- `EmailStatusWriter` in cdp-api, the worker, tracking and the janitor: `queued` without waiting; every later status waits for Kafka. The janitor writes `unknown`, and `failed` with `gave_up`.
- `GET /api/projects/@current/messaging/emails/{message_id}/` (spec pin): `{ id, status, created_at, status_at, reason? }`, `hog_flow:read`, the send's throttles, `404 not_found` for an unknown id or another team's.

## Test seams

- The read route at the HTTP boundary against the test ClickHouse: latest status wins, another team's id is `404`.
- `EmailStatusWriter` at the Kafka boundary: one row per status, the rank order.

## Proof

- Live on a local stack: send, then read until `sent`, verbatim in the PR.
- Gap until production read access: point-read latency on the AUX cluster.

## Acceptance criteria

- [ ] A late `sent` never replaces `delivered`.
- [ ] A lost status write never causes a second send.

## Blocked by

- Native: slice 04.
