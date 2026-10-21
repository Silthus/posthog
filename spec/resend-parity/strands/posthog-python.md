Build strand: posthog-python code form (Resend parity)

Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [Spec: Resend parity](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/SPEC.md), section "Slicing: builders per strand"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921)
Repository: PostHog/posthog-python
Lane: one build lane, Opus 5.5 `high`, its own worktree, wall-time cap 3 h (waiting on other strands excluded). Prompt: [lanes/posthog-python.md](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/lanes/posthog-python.md)
Blocked by (strands): send-api (slice 04), posthog-node (slice 10)
Waits on (Harley): his posthog-python template-send PR merged (not open yet)

## Slices, in order

- [ ] Slice 12: [posthog-python: the code form, with rendered content and local templates](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/12-posthog-python-code-form.md). PR: one draft PR on the default branch.

## Done when

- [ ] Every slice has its draft PR with its red/green test and owed proofs.
- [ ] One GPT-6.1 Sol `high` review of the strand's whole diff, findings fixed or rejected with a reason.
- [ ] The lane's handoff, with its measurements, reached the map conductor.
