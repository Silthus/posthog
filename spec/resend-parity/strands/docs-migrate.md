Build strand: the Migrate from Resend page (Resend parity)

Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [Spec: Resend parity](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/SPEC.md), section "Slicing: builders per strand"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921)
Repository: PostHog/posthog.com
Lane: one build lane, Opus 5.5 `high`, its own worktree, wall-time cap 2 h (waiting on other strands excluded). Prompt: [lanes/docs-migrate.md](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/lanes/docs-migrate.md)
Blocked by (strands): skill (slice 15), wizard (slice 16)
Waits on (Harley): none

## Slices, in order

- [ ] Slice 19: [Docs: Migrate from Resend, with a prompt to copy into your agent](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/19-docs-migrate-from-resend.md). PR: one draft PR on `master`.

## Done when

- [ ] Every slice has its draft PR with its red/green test and owed proofs.
- [ ] One GPT-6.1 Sol `high` review of the strand's whole diff, findings fixed or rejected with a reason.
- [ ] The lane's handoff, with its measurements, reached the map conductor.
