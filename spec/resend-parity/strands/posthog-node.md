Build strand: posthog-node (Resend parity)

Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [Spec: Resend parity](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/SPEC.md), section "Slicing: builders per strand"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921)
Repository: PostHog/posthog-js
Lane: one build lane, Opus 5.5 `high`, its own worktree, wall-time cap 6 h (waiting on other strands excluded). Prompt: [lanes/posthog-node.md](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/lanes/posthog-node.md)
Blocked by (strands): send-api (slice 10 needs 04; slice 11 needs 08). Slice 09 starts at once.
Waits on (Harley): none

## Slices, in order

- [ ] Slice 09: [posthog-node: emails.send with the template form and the shared client behavior](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/09-posthog-node-template-form.md). PR: new commits on PostHog/posthog-js#5312, or a draft PR stacked on it.
- [ ] Slice 10: [posthog-node: the code form, with rendered content and local templates](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/10-posthog-node-code-form.md). PR: a draft PR stacked on 09.
- [ ] Slice 11: [posthog-node: read an email's status with emails.get](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/11-posthog-node-emails-get.md). PR: a draft PR stacked on 10.

## Done when

- [ ] Every slice has its draft PR with its red/green test and owed proofs.
- [ ] One GPT-6.1 Sol `high` review of the strand's whole diff, findings fixed or rejected with a reason.
- [ ] The lane's handoff, with its measurements, reached the map conductor.
