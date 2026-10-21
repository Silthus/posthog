Send route: run the send checks before the 202
Slice: 07
Strand: send-api
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), section "Send API (ours)"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921), "Errors"
Architecture: #526, seam `check(send, 'admission')`, PR "8 Checks before queueing, pinned content"
Repository: PostHog/posthog
Base: slice 04's branch

## What to build

A `202` never hides a skip:

- cdp-api runs `EmailSendPolicy.check(send, 'admission')` before it queues. A failed check answers `400` with its code (`invalid_recipient`, `sender_not_verified`, `sender_not_allowed`, `sending_suspended`, `template_paused`, `recipient_suppressed`), `why` and `fix`.
- Delivery records `skipped` only for what changed after the `202`.
- `429` carries `throttled` or `quota_limited`, so the SDKs retry only the first.
- A template send pins the template's published version at acceptance, so an edit after the `202` does not change a queued email.

## Test seams

- cdp-api's send route with the queue faked: one case per policy code, and the two `429` codes.
- The pinned version: edit the template after the `202`, and the queued job still holds the version it had.

## Proof

- Live on a local stack: a suppressed recipient gets `400 recipient_suppressed` with why and fix, and nothing is queued.

## Acceptance criteria

- [ ] Every policy code has why and fix, and a docs anchor on slice 13's page.

## Blocked by

- Native: slices 02 and 04.
