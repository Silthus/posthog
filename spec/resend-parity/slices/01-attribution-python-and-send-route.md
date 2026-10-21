Send attribution: count posthog-python as an SDK, and attribute the contract's send route
Slice: 01
Strand: send-api
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), section "Send attribution"
Follows: [Send attribution](https://github.com/Silthus/posthog/issues/530), draft PostHog/posthog#120628 at `ed6b4b59bdf`
Repository: PostHog/posthog
Base: `spec/code-managed-templates` (PostHog/posthog#118924). Restack #120628 onto it and add these commits there.

## What to build

- **Restack** #120628 from `master` onto `spec/code-managed-templates`, so it sees the contract's send route.
- **posthog-python.** A User-Agent that starts with `posthog-python/<version>` records `source: sdk` and `sdk_version: <version>`, like `posthog-node/` and `posthog-edge/` (#120921, "User-Agent").
- **The contract's send route.** `POST /api/projects/@current/messaging/send/email/` records the send source too, through the same `SendSource` and `mark_organization_migrated`, for both the template form and the code form.

Unknown or missing headers still never fail a send.

## Test seams

- Extend `test_reports_where_each_send_came_from` with a `posthog-python/<version>` case and a lookalike.
- The same parameterized cases against `messaging/send/email/`, and the set-once organization mark across both routes.

## Proof

- Red then green on the extended cases.
- Live, as #120628 did: a send with a posthog-python User-Agent, and a send on `messaging/send/email/` with `X-PostHog-Migrated-From: resend`, captured at a local analytics sink.

## Acceptance criteria

- [ ] `posthog-python/` counts as `sdk`; anything else stays `api`.
- [ ] The organization is marked once, whichever route the first migrated send used.

## Blocked by

- Native: none. It is a follow-up of #530 on the same draft PR.
- Named: PostHog/posthog#118924, the base.
