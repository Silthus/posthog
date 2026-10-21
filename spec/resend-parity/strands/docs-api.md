Build strand: the transactional email API page (Resend parity)

Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [Spec: Resend parity](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/SPEC.md), section "Slicing: builders per strand"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921)
Repository: PostHog/posthog.com
Lane: one build lane, Opus 5.5 `high`, its own worktree, wall-time cap 3 h (waiting on other strands excluded). Prompt: [lanes/docs-api.md](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/lanes/docs-api.md)
Blocked by (strands): send-api (slice 07), posthog-node (slices 09 and 10)
Waits on (Harley): none

## Slices, in order

- [ ] Slice 13: [Docs: both send forms, errors and idempotency on the transactional email API page](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/13-docs-api-page.md). PR: new commits on PostHog/posthog.com#21306, or a draft PR stacked on it.

## Done when

- [ ] Every slice has its draft PR with its red/green test and owed proofs.
- [ ] One GPT-6.1 Sol `high` review of the strand's whole diff, findings fixed or rejected with a reason.
- [ ] The lane's handoff, with its measurements, reached the map conductor.
