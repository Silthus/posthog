posthog-node: emails.send with the template form and the shared client behavior
Slice: 09
Strand: posthog-node
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), section "posthog-node"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921), "Client setup", "Client interface", "Errors"
Repository: PostHog/posthog-js
Base: `feat/node-emails-send` (PostHog/posthog-js#5312), as new commits on #5312 or a PR stacked on it

## What to build

posthog-node matches what Harley builds in posthog-python for template sends, on the route that exists today:

```ts
const { data, error } = await posthog.emails.send({
  to: 'jane@example.com',
  templateId: '<uuid>',
  templateData: { firstName: 'Jane' },
  distinctId: user.id,
  idempotencyKey: `welcome:${user.id}`,
})
```

- **Client options:** `secretKey`, `appHost` (derived for PostHog Cloud hosts; any other `host` without `appHost` fails with `missing_app_host`, and the secret key is never sent there), `maxRetries` (default 2, `0` turns retries off, a send can override it), `migratedFrom` (sent as `X-PostHog-Migrated-From`).
- **Template form:** `templateId` with optional `templateData`, posted to `/messaging_templates/{id}/send/` with `message_data`.
- **Shared behavior:** `{ data: { id, warnings }, error: null }` or `{ data: null, error }` with the contract's fields and one error-name table; the SDK codes `missing_secret_key`, `missing_app_host`, `client_disabled`, `network_error`, `api_error`, `unexpected_error`; an `Idempotency-Key` on every call, a UUID v4 when none is given; retries on network errors, the in-flight `409`, `429 throttled` and `503` with the same key (1 s, then 2 s with jitter, or a longer `Retry-After`, capped at 30 s), never on `429 quota_limited`; warnings logged once; User-Agent `posthog-node/<version>`; no client events; never `withContext`.
- **Removed from #5312**, which is unreleased: the public `template` field, `templateFile()` and `uploadTemplate()`. #5312's hashing and upload code stays internal for slice 10.
- **JSDoc and examples** always pass `distinctId`, and say the events of a send count as analytics events.

## Test seams

The `emails` namespace on a real client, `fetch` mocked at the HTTP boundary, as #5312's tests do:

- one parameterized case per mapping row and per error-table row, plus each SDK code;
- retries with fake timers: the same key on every attempt, `Retry-After` honored and capped, `maxRetries: 0`, no retry on `quota_limited`;
- `appHost`: derived for Cloud, `missing_app_host` for a proxy `host`, the secret key never sent to it.

## Proof

- Live on a local stack: a template send lands in the dev mail catcher; a replayed key returns the same `id`.
- A table of each contract row against the Node behavior, so posthog-python's reviewer can check parity.

## Acceptance criteria

- [ ] Every request matches #120921; any difference is raised with Michael, not shipped.
- [ ] The secret key never goes to a host that is not the app host.

## Blocked by

- Native: none. The route exists on `master`.
