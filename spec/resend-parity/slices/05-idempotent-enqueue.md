idempotentEnqueue over the idempotency store (R3)
Slice: 05
Strand: send-api
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), section "Send API (ours)"
Architecture: #526, seam `idempotentEnqueue`, PR "R3 idempotentEnqueue"
Repository: PostHog/posthog
Base: slice 07's branch (the strand's stack is linear), after Harley's store lands on `master`

## What to build

A thin wrapper in cdp-api over Harley's idempotency store (PostHog/posthog#120446, used by #120392 and #120510): reserve the key with a fingerprint, replay a stored answer, release on rejection, mark queued with the message id. No second store. Nothing calls it for email yet; slice 06 wires it in.

## Test seams

- `idempotentEnqueue` against the real store in its test setup: new key, replay, other fingerprint, in flight, store down.

## Proof

- Red then green at the seam.

## Acceptance criteria

- [ ] It uses the store's own API, with no copy of its logic.

## Blocked by

- Native: slice 03.
- Named: Harley's store stack PostHog/posthog#120446, #120392 and #120510 merged.
