Build strand: the Resend migration skill (Resend parity)

Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [Spec: Resend parity](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/SPEC.md), section "Slicing: builders per strand"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921)
Repository: PostHog/context-mill
Lane: one build lane, Opus 5.5 `high`, its own worktree, wall-time cap 6 h (waiting on other strands excluded). Prompt: [lanes/skill.md](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/lanes/skill.md)
Blocked by (strands): send-api (slices 01, 06, 07), posthog-node (slice 10), docs-api (slice 13); all for slice 15. Slice 14 starts at once.
Waits on (Harley): none

## Slices, in order

- [ ] Slice 14: [Resend migration skill v0: find every Resend send, set up the sender, and report](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/14-skill-v0.md). PR: a draft PR stacked on PostHog/context-mill#433.
- [ ] Slice 15: [Resend migration skill v1: move every supported site to posthog.emails.send](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/15-skill-v1.md). PR: a draft PR stacked on 14.

## Done when

- [ ] Every slice has its draft PR with its red/green test and owed proofs.
- [ ] One GPT-6.1 Sol `high` review of the strand's whole diff, findings fixed or rejected with a reason.
- [ ] The lane's handoff, with its measurements, reached the map conductor.
