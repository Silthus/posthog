posthog-node: implement the shared email client interface for emails.send
Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, sections "Contract pins", "posthog-node", "Testing Decisions"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921), section "Client interface (both SDKs)"
Cast: Opus 5.5, high
Repository: PostHog/posthog-js
Base: `feat/node-emails-send` (PostHog/posthog-js#5312), as new commits on #5312 or a PR stacked on it

## What to build

posthog-node implements `emails.send` and the content helpers exactly as #120921's client interface says, so it behaves like posthog-python:

```ts
await posthog.emails.send({
  key: 'password-reset',
  to,
  from,
  replyTo,
  distinctId,
  content: html('Reset your password', markup),
})
await posthog.emails.send({ to, content: libraryTemplate('welcome', { firstName: 'Jane' }) })
```

- **Client options.** `secretKey` (exists) and a new `migratedFrom`, sent as `X-PostHog-Migrated-From` on every `emails` request. No `secretKey`: `missing_secret_key`, nothing sent.
- **Helpers.** `html(subject, html, text?)`, `text(subject, text)`, `libraryTemplate(key, data?)`. A send takes exactly one; a code send carries `key`, a library send none. Wrong combinations do not compile. #5312's `template` field goes away, because #5312 is unreleased.
- **No text derivation in the SDK.** `html()` without `text` sends no `text`, and the server derives it (spec pin). No `html-to-text` dependency.
- **Option-to-body mapping** per the contract's table: `identifiers.distinct_id` left out when absent, `reply_to` always a list, `capture_engagement` left out when absent, `Idempotency-Key` header from `idempotencyKey` or a UUID v4.
- **`to`** one address, typed `string`.
- **No request context.** A send never reads `withContext`.
- **Results.** `{ data: { id, warnings }, error: null }` or `{ data: null, error }`. `EmailWarning` is `{ code, message, fix }`; each warning is logged once through the client's logger. `EmailError` is `{ name, code, message, why?, fix?, statusCode?, docsUrl?, field? }`.
- **No exceptions** for API or network errors; only for wrong argument types.
- **SDK error codes** when PostHog answered with none: `missing_secret_key`, `client_disabled`, `network_error`, `api_error`, `unexpected_error`. A disabled client sends nothing.
- **Error names** from the contract's one table, including `invalid_permission`, `monthly_quota_exceeded` and `service_unavailable`.
- **Retries** on network errors, the in-flight `409`, `429` and `503`, with the same key: at most 3 attempts, 1 s then 2 s with jitter, or a longer `Retry-After`, capped at 30 s (proposed in the contract; the PR follows the contract's final numbers).
- **User-Agent** `posthog-node/<version>`. **No client events** for a send.
- **Host.** `us.i.posthog.com` and `eu.i.posthog.com` map to `us.posthog.com` and `eu.posthog.com`; a self-hosted host stays.
- **JSDoc** on `captureEngagement`: on by default for code sends, and the events count as analytics events.
- **Language extras** stay outside this PR's parity surface: `templateFile()` and `uploadTemplate()` follow the spec's Open decision 3, and `react()` is ticket 05.

## Test seams

The `emails` namespace on a real client, `fetch` mocked at the HTTP boundary, as #5312's tests do:

- each helper and option produces the contract's body and headers (one parameterized case per mapping row);
- the error-name table, one case per row, plus each SDK error code;
- retries with fake timers: the same key on every attempt, `Retry-After` honored and capped, the bound reached, no retry on `template_outdated` or `422`;
- warnings returned and logged once; host mapping; disabled client; `withContext` ignored for a send to someone else.

## Proof

- Red then green at the seams above.
- Live, once Harley's code-content route (spec S4) runs on a local stack: one `html()` send without `text` (the email has a text part), one `libraryTemplate()` send, one replayed key returning the same `id`. Emails in the dev mail catcher, verbatim responses in the PR. Until the route exists, a recorded gap.
- A side-by-side table of each contract row and the Node behavior, so posthog-python's reviewer can check parity.

## Acceptance criteria

- [ ] Every request matches #120921; any difference is raised with Michael, not shipped.
- [ ] A retry never changes the idempotency key.
- [ ] A send never reads the request context and captures no client event.
- [ ] Every error's `docsUrl` resolves on the page of ticket 04.

## Blocked by

- Native: none. The code builds against the contract now.
- Named, for the live proof and merge: Harley's code-content route (S4) and idempotency wiring (S5) in PostHog/posthog, on his stack PostHog/posthog#120446, #120510, #120392.

## How to build (map #461)

- Run the `impact` check, then build test-first with `/tdd` at the seams named above. Mock only what the seam section allows.
- Repo skills apply where the diff touches their area.
- Read the contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) first. Where the code must differ from it, stop and raise the difference with Michael.
- Public repo: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or the PR. Fixture addresses use `example.com`.
- Shipped means a reviewed draft PR: the design pass, the owed proofs, the description with `pr-description`, and one cross-family review recorded with `fleet proof`. Never mark ready, enqueue or merge.
