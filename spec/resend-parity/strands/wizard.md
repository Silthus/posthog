Build strand: the Wizard migrate family (Resend parity)

Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [Spec: Resend parity](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/SPEC.md), section "Slicing: builders per strand"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921)
Repository: PostHog/wizard (+ one PostHog/context-mill entry)
Lane: one build lane, Opus 5.5 `high`, its own worktree, wall-time cap 4 h (waiting on other strands excluded). Prompt: [lanes/wizard.md](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/lanes/wizard.md)
Blocked by (strands): skill (slice 14)
Waits on (Harley): none

## Slices, in order

- [ ] Slice 16: [Wizard: turn migrate into a family with migrate statsig and migrate resend](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/16-wizard-migrate-family.md). PR: a draft PR on PostHog/wizard `main`, plus a companion draft PR in PostHog/context-mill.
- [ ] Slice 18: [Wizard: capture the migration summary and offer the Resend run on install](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/18-wizard-summary-and-offer.md). PR: a draft PR stacked on 16.

## Done when

- [ ] Every slice has its draft PR with its red/green test and owed proofs.
- [ ] One GPT-6.1 Sol `high` review of the strand's whole diff, findings fixed or rejected with a reason.
- [ ] The lane's handoff, with its measurements, reached the map conductor.
