Email send policy: one check for admission and delivery (R1)
Slice: 02
Strand: send-api
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), section "Send API (ours)"
Architecture: #526, seam `EmailSendPolicy`, PR "R1 Email send policy"
Repository: PostHog/posthog
Base: `spec/code-managed-templates` (PostHog/posthog#118924), or `master` once it merges

## What to build

A mechanical refactor with no behavior change. The send checks exist twice today. Move both copies into one `EmailSendPolicy.check(send, phase)` with `phase` either `'admission'` or `'delivery'`, returning a pass or a `PolicyCode` with why and fix.

- Delivery keeps calling the checks it runs today, now through `check(send, 'delivery')`.
- Nothing calls `'admission'` yet. Slice 07 wires it into cdp-api.

## Test seams

- The policy's public `check` with one case per existing check and phase, moved from the current tests. No new behavior, so no new assertions beyond the moved ones.

## Proof

- The moved tests pass before and after; the delivery path's existing tests stay green unchanged.

## Acceptance criteria

- [ ] One implementation of each check.
- [ ] No user-visible change.

## Blocked by

- Native: none.
- Named: PostHog/posthog#118924, the base.
