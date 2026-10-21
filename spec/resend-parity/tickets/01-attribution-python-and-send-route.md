Send attribution: count posthog-python as an SDK, and attribute the contract's send route
Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, sections "Send attribution", Open decision 4
Follows: [Send attribution](https://github.com/Silthus/posthog/issues/530), draft PostHog/posthog#120628 at `ed6b4b59bdf`
Cast: Opus 5.5, high
Repository: PostHog/posthog
Base: `feat/email-send-attribution` (PostHog/posthog#120628), as new commits on that draft

## What to build

- **posthog-python.** A User-Agent that starts with the token `posthog-python/<version>` records `source: sdk` and `sdk_version: <version>`, like `posthog-node/` and `posthog-edge/` today (#120921, "User-Agent").
- **The contract's send route** (only if Michael picks the recommended answer of Open decision 4). Restack #120628 onto `spec/code-managed-templates` (PostHog/posthog#118924) and record the send source on `POST /api/projects/@current/messaging/send/email/` too, through the same `SendSource` and `mark_organization_migrated`. Without that answer, this ticket is the posthog-python line only, on `master`.

Unknown or missing headers still never fail a send.

## Test seams

- Extend `test_reports_where_each_send_came_from` with a `posthog-python/<version>` case and a lookalike.
- If the route half is in: the same parameterized cases against `messaging/send/email/`, and the set-once organization mark across both routes.

## Proof

- Red then green on the extended cases.
- Live, as #120628 did: sends with a posthog-python User-Agent, and (route half) a send by key with `X-PostHog-Migrated-From: resend`, captured at a local analytics sink.

## Acceptance criteria

- [ ] `posthog-python/` counts as `sdk`; anything else stays `api`.
- [ ] The organization is marked once, whichever route the first migrated send used.

## Blocked by

- Native: none.
- Named: PostHog/posthog#118924, for the route half.

## How to build (map #461)

- Run the `impact` check, then build test-first with `/tdd` at the seams named above. Mock only what the seam section allows.
- Repo skills apply where the diff touches their area.
- Read the contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) first. Where the code must differ from it, stop and raise the difference with Michael.
- Public repo: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or the PR. Fixture addresses use `example.com`.
- Shipped means a reviewed draft PR: the design pass, the owed proofs, the description with `pr-description`, and one cross-family review recorded with `fleet proof`. Never mark ready, enqueue or merge.
