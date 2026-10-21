Build strand: the code-content send API (Resend parity)

Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [Spec: Resend parity](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/SPEC.md), section "Slicing: builders per strand"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921)
Repository: PostHog/posthog
Lane: one build lane, Opus 5.5 `high`, its own worktree, wall-time cap 12 h (waiting on other strands excluded). Prompt: [lanes/send-api.md](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/lanes/send-api.md)
Blocked by (strands): none
Waits on (Harley): PostHog/posthog#120446, #120392 and #120510 merged, before slice 05

## Slices, in order

- [ ] Slice 01: [Send attribution: count posthog-python as an SDK, and attribute the contract's send route](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/01-attribution-python-and-send-route.md). PR: new commits on the restacked draft PostHog/posthog#120628.
- [ ] Slice 02: [Email send policy: one check for admission and delivery (R1)](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/02-email-send-policy.md). PR: a draft PR stacked on #118924 with `gh stack`.
- [ ] Slice 03: [EmailSendCommand and the typed CDP outcome (R2)](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/03-email-send-command.md). PR: a draft PR stacked on 02.
- [ ] Slice 04: [Send route: the code form, rendered content and local templates](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/04-send-route-code-form.md). PR: a draft PR stacked on 03.
- [ ] Slice 07: [Send route: run the send checks before the 202](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/07-send-route-admission-checks.md). PR: a draft PR stacked on 04.
- [ ] Slice 05: [idempotentEnqueue over the idempotency store (R3)](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/05-idempotent-enqueue.md). PR: a draft PR stacked on 07, built once Harley's store lands.
- [ ] Slice 06: [Send route: idempotency for both forms](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/06-send-route-idempotency.md). PR: a draft PR stacked on 05.
- [ ] Slice 08: [Email status record and GET emails/{message_id}](https://github.com/Silthus/posthog/blob/spec/resend-parity/spec/resend-parity/slices/08-email-status-record.md). PR: its own draft PR on `master` once slice 04 merges, so the stack stays shallow.

## Done when

- [ ] Every slice has its draft PR with its red/green test and owed proofs.
- [ ] One GPT-6.1 Sol `high` review of the strand's whole diff, findings fixed or rejected with a reason.
- [ ] The lane's handoff, with its measurements, reached the map conductor.
