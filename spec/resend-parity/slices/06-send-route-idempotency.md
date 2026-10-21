Send route: idempotency for both forms
Slice: 06
Strand: send-api
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), section "Send API (ours)"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921), "Idempotency" and "Errors"
Architecture: #526, seam `idempotentEnqueue` fingerprint, PR "4 Idempotency wiring"
Repository: PostHog/posthog
Base: slice 05's branch

## What to build

`messaging/send/email/` queues each send once per `Idempotency-Key`:

- Scope `transactional-email`, shared by both forms and both routes.
- The fingerprint covers `template_id` or `template_key`, `to`, the distinct ID, `message_data` and the code content.
- A replay returns the stored `202` with the same `message_id` before any check runs.
- Another fingerprint on the same key, or the other route: `422 invalid_idempotent_request`.
- The key still in flight: `409` with its own code. The store down: `503`, nothing queued.

## Test seams

- The send route at the HTTP boundary with the store real and the queue faked: each row of the contract's table above.

## Proof

- Live on a local stack: the same key sent twice gives one email in the dev mail catcher and the same `message_id`.

## Acceptance criteria

- [ ] A retry with the same key queues no second send. The store's own limit stays: a crash between the reservation and the queue write, or a failed completion write followed by a retry after the 60 s pending window, can queue a second send (`idempotency-keys.ts`, `PENDING_TTL_SECONDS` and `markQueued`). The docs say so (slice 13).
- [ ] The `409` codes for in flight and for a key edited in PostHog differ.

## Blocked by

- Native: slices 04 and 05.
