posthog-node: read an email's status with emails.get
Slice: 11
Strand: posthog-node
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), sections "Contract pins", "posthog-node"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921), "Read (later PR)"
Repository: PostHog/posthog-js
Base: slice 10's branch (the strand's stack is linear)

## What to build

`posthog.emails.get(id)`:

- `GET /api/projects/@current/messaging/emails/{message_id}/` on the app host with the secret key.
- `{ data: { id, status, createdAt, statusAt, reason? }, error: null }` or `{ data: null, error }`, with the contract's error names.
- `404 not_found` for an unknown id and for the first seconds after a send. `get` never retries.
- `status` is not Resend's `last_event`; the JSDoc says so, and that a new email can take a few seconds to show up.

## Test seams

- The `emails` namespace with `fetch` mocked: path, auth, mapping, `404` without a retry.

## Proof

- Live on a local stack: send, then `get` until `sent`, verbatim in the PR.

## Acceptance criteria

- [ ] `get` never retries.
- [ ] The field names match posthog-python's per #120921.

## Blocked by

- Native: slices 09 and 08.
