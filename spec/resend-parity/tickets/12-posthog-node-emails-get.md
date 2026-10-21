posthog-node: read an email's status with emails.get
Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, sections "Contract pins", "posthog-node"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921), "Read" and "Client interface"
Cast: Opus 5.5, high
Repository: PostHog/posthog-js
Base: ticket 03's branch

## What to build

`posthog.emails.get(id)` returns the status of an email the app sent:

- `GET /api/projects/@current/messaging/emails/{message_id}/` (spec pin) with the secret key; needs `hog_flow:read`.
- `{ data: { id, status, createdAt, statusAt, reason? }, error: null }` or `{ data: null, error }`, with the contract's error names.
- `status` is one of `queued`, `waiting`, `unknown`, `skipped`, `failed`, `sent`, `delivered`, `bounced`, `complained`; it is not Resend's `last_event` (ADR 0005).
- `404 not_found` for an unknown id and for the first seconds after a send. `get` never retries.
- The JSDoc says a new email can take a few seconds to show up.

## Test seams

- The `emails` namespace with `fetch` mocked: path, auth, the result mapping, `404` without a retry, the error names.

## Proof

- Live, once Harley's status record (spec S9) runs on a local stack: send, then `get` until the status reaches `sent`, verbatim in the PR. Until then, a recorded gap.

## Acceptance criteria

- [ ] `get` never retries.
- [ ] The result field names match posthog-python's per #120921.

## Blocked by

- Native: ticket 03.
- Named: Harley's status record and read route (S9).

## How to build (map #461)

- Run the `impact` check, then build test-first with `/tdd` at the seams named above. Mock only what the seam section allows.
- Repo skills apply where the diff touches their area.
- Read the contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) first. Where the code must differ from it, stop and raise the difference with Michael.
- Public repo: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or the PR. Fixture addresses use `example.com`.
- Shipped means a reviewed draft PR: the design pass, the owed proofs, the description with `pr-description`, and one cross-family review recorded with `fleet proof`. Never mark ready, enqueue or merge.
