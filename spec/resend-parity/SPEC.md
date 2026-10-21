Spec: Resend parity
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Answers: [Spec Resend parity and slice it into PRs](https://github.com/Silthus/posthog/issues/531)
Built on: the product decisions of [Grill Resend parity](https://github.com/Silthus/posthog/issues/525), the structure of [Shape the architecture of Resend parity](https://github.com/Silthus/posthog/issues/526) ([architecture doc](https://github.com/Silthus/posthog/blob/0f0bc0f5f32d7835f434dba7c1d6e43cb182f3ec/docs/architecture/resend-parity.md), five ADRs), and the shared SDK contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921).
Folds in: research #522, #523, #524, #527, #529, #532, #533, #534, and [Send attribution](https://github.com/Silthus/posthog/issues/530) (draft PostHog/posthog#120628).

Status: draft on branch `spec/resend-parity`, before Michael's approval. Revision 3: posthog-node follows the "Client interface (both SDKs)" section of #120921, with a `key` on every send (Michael and Harley, 2026-10-21; supersedes ADR 0004).

## Problem Statement

A team that sends transactional email through Resend wants to move that mail to PostHog, and its coding agent should do the move.

Today that does not work:

- PostHog sends only a stored template. A Resend call site sends inline `html` or a React Email component, so every such site needs a hand conversion first.
- posthog-node's draft `emails.send` (PostHog/posthog-js#5312) has no `from`, `subject`, inline content, `replyTo` or idempotency key. Its errors drop `why` and `fix`, and its error names do not match Resend's, so migrated `if (error.name === ...)` branches break.
- A send answer does not say what it promises. A retry after a timeout can send a second email. A send that the worker later skips (suppressed recipient, paused template) still answered OK.
- A key cannot be limited to senders, so a staging app can send from the production domain.
- After a send, the app cannot read the email's status back.
- No skill or Wizard run moves a codebase off Resend, and PostHog cannot count the organizations that send from code or that switched.

## Solution

The work splits between two owners on one contract, [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921):

- **Harley** builds the send API in PostHog/posthog: code content on the send route, idempotency on his store, the checks before queueing, attachments, restricted keys and the status record. He also builds posthog-python. Those slices are listed below so the seams stay visible. They are not tickets of this map.
- **Michael's lane** (this map) builds posthog-node against the contract, the context-mill migration skill, the Wizard `migrate resend` run, the docs, and send attribution.

When both lanes land, a team runs `npx @posthog/wizard migrate resend`, or asks its coding agent to migrate from Resend. The skill moves each supported call site to one call:

```ts
const posthog = new PostHog('phc_...', {
  secretKey: process.env.POSTHOG_PROJECT_SECRET_API_KEY,
  migratedFrom: 'resend',
})

const { data, error } = await posthog.emails.send({
  key: 'password-reset',
  to: 'jane@example.com',
  distinctId: user.id, // optional; the address is the fallback
  from: 'Acme <security@acme.com>',
  content: html('Reset your password', resetMarkup),
})
// data: { id, warnings } once PostHog stored the send in its queue; error: { name, code, message, why, fix, statusCode, docsUrl, field }
```

A library template keeps working. The send still names the email with its own `key`; the helper names the template by its key or id:

```ts
await posthog.emails.send({
  key: 'welcome',
  to: 'jane@example.com',
  content: libraryTemplate('welcome', { firstName: 'Jane' }),
})
```

- `202` means PostHog stored the send in its queue for delivery, not that the provider accepted it or that it was delivered.
- A check that would skip the send later runs before the `202`, and a failed check returns an error with `why` and `fix`.
- Every send carries an idempotency key. posthog-node makes one when the caller gives none and retries with the same key.
- Engagement capture is on by default for new sends from code. The events count as analytics events, and the docs and the SDK say so.
- The skill leaves each call site it cannot move on Resend and lists it in its report, so the person cuts over in parallel.

## User Stories

Migration

1. As an engineer on Resend, I want one Wizard command, `npx @posthog/wizard migrate resend`, so that my transactional mail moves to PostHog in one run.
2. As an engineer, I want to run the same migration from my own coding agent without the Wizard, so that I use the tool I already have.
3. As an engineer, I want the run to stop before any edit when my app has no Resend, so that a wrong run costs nothing.
4. As an engineer, I want the run to list every Resend call site with its file, line and fields, so that I see the whole job first.
5. As an engineer, I want each site classified as moved or left on Resend with a reason, so that I know what is still mine to do.
6. As an engineer, I want a site that uses a field PostHog does not have to stay on Resend unchanged, so that no field is dropped silently and no email goes to the wrong people.
7. As an engineer, I want hosted Resend templates and HTML sends to become PostHog templates, so that they move without a hand conversion.
8. As an engineer, I want my React Email components to keep working unchanged, so that I do not rewrite my email design.
9. As an engineer, I want the run to set up my sending domain next to Resend's records, so that both providers send while I cut over.
10. As an engineer, I want the run to hand me the DNS records or a Domain Connect link, because PostHog never writes my DNS.
11. As an engineer, I want the run to ask me for the project secret key and write it to my env file, so that the key never shows in a transcript.
12. As an engineer, I want the report to list every other place `RESEND_API_KEY` appears, so that I add the PostHog key to CI and hosting too.
13. As an engineer, I want the run to check my project's sending tier before cutover, so that a volume limit does not surprise me in production.
14. As an engineer, I want the run never to remove `resend` while a site still uses it, and never to touch DNS or my Resend account, so that nothing breaks behind my back.
15. As an engineer, I want the run to leave a local diff and never commit, so that I review it first.
16. As an engineer, I want the moved sites to reuse the user ID my app already passes to PostHog, so that email events land next to that user's product events.
17. As an engineer, I want an install run of the Wizard to offer the migration when it finds `resend` in my `package.json`, so that I learn the option exists.

Sending from Node

18. As an engineer, I want `posthog.emails.send` on the PostHog client I already use, so that I add no new client.
19. As an engineer, I want to send content written in my code with `html()` or `text()`, so that a Resend `html:` site is a one-line change.
20. As an engineer, I want an `html()` send without `text` to get a plain-text part, so that every email has a text fallback without extra work.
21. As an engineer, I want to name each kind of email with a `key` on every send, library sends included, so that each one gets its own logs, metrics and timeline in PostHog.
22. As an engineer, I want to send a library template with `libraryTemplate(template, data)`, by its key or id, so that templates edited in PostHog stay sendable.
23. As an engineer, I want the type system to refuse a send without a `key` or without exactly one helper's `content`, so that a wrong combination does not compile.
24. As an engineer, I want `from` and `replyTo` on every send, so that a per-call sender from Resend keeps working.
25. As an engineer, I want a clear error when `from` is not a verified sender, so that I fix the sender, not the call.
26. As an engineer, I want `distinctId` optional and the address used when it is missing, so that a send needs only an address.
27. As an engineer, I want a send never to take the recipient from my request context, so that an invite sent by an admin never lands on the admin's timeline.
28. As an engineer, I want `{ data, error }` and never an exception, so that a failed email does not crash my handler.
29. As an engineer, I want `error.name` to use Resend's names, so that my existing `rate_limit_exceeded` branch keeps working.
30. As an engineer, I want every error to say what happened, why, and how to fix it, with a docs link, so that I or my agent repair the call without a search.
31. As an engineer, I want a send to carry an idempotency key on every call, made for me when I give none, so that a retry never sends twice.
32. As an engineer, I want the SDK to retry network errors, a send still in flight, `429` and `503` with the same key, honoring `Retry-After`, so that a brief outage does not drop an email.
33. As an engineer, I want my Resend `idempotencyKey` to keep its meaning, so that my retry logic still holds.
34. As an engineer, I want the SDK to use the app host even when my client points at the ingestion host, so that I do not configure two hosts.
35. As an engineer, I want a clear `missing_secret_key` error when the client has no secret key, so that I know what to add.
36. As an engineer, I want engagement capture on by default for my sends, with `captureEngagement: false` to turn it off for one send, so that tracking works out of the box and I stay in control.
37. As an engineer, I want the SDK docs to say that engagement events count as analytics events, so that my bill does not surprise me.
38. As an engineer, I want Resend-only fields (`cc`, `bcc`, `tags`, `headers`, `scheduledAt`, `topicId`) refused by the type, so that the skill reports them instead of dropping them.
39. As an engineer, I want `posthog.emails.get(id)` to return the email's status, so that my app reads it with the client it already uses.

Docs and measurement

40. As an engineer, I want one docs page that covers code content, errors, idempotency and what `202` means, so that every `docsUrl` opens the fix.
41. As an engineer, I want a "Migrate from Resend" page with a prompt I can copy into my agent, so that I can start the move from the docs.
42. As PostHog, I want every send to record whether it came from the API or the SDK, the SDK version, and the migration marker, so that we count Code-sending orgs and Switched orgs.
43. As PostHog, I want the Wizard to capture a migration summary (sites found, rewritten and left, templates uploaded, DNS ready), so that we see where migrations stall.
44. As PostHog, I want templates and workflows created by code sends to stay out of the workflow list and not fire `hog_flow_created`, so that Started orgs keep their meaning.

Owned by Harley, listed for the seams (PostHog/posthog)

45. As an engineer, I want the send route to accept code content (`key` plus `content`) next to a stored template, so that one route serves both.
46. As an engineer, I want a send that would be skipped later to fail before the `202`, so that a `202` never hides a skip.
47. As an engineer, I want a replayed idempotency key to return the first `202` with the same message id, so that retries are safe.
48. As a project admin, I want to restrict a key to listed domains or sender addresses, so that staging never sends from the production domain.
49. As an engineer, I want to read an email's status by its message id, so that my app can show "sent" or "bounced".
50. As an engineer, I want to attach a small file such as an `.ics` invite, so that calendar invites move from Resend too.
51. As an engineer on Python, I want the same contract in posthog-python, so that both SDKs behave the same.

## Implementation Decisions

Marks: 👤 Michael decided, 👍 Michael accepted the recommendation, 🤖 settled by the code or the contract, 📌 pinned by this spec (open to Michael's redirect).

### Ownership

- 👤 **Split (2026-10-21)** Harley owns the send API in PostHog/posthog, built directly there on his idempotency stack (PostHog/posthog#120446, #120392, #120510) and the send route of PostHog/posthog#118924. He also owns posthog-python. This map owns posthog-node on PostHog/posthog-js#5312, the context-mill skill, the Wizard run, the docs, and send attribution.
- 👤 **Contract** [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) is the source of truth for the HTTP surface: host, path, auth, request fields, `202`, errors, idempotency, retries and the status read. This spec pins the three points it leaves open (below: the read path, text derivation, and which workflow a library send runs on) and lists every difference from #525 and #526 for Michael.
- 🤖 **Our tickets wait on Harley's PRs** as named dependencies, because they are pull requests in PostHog/posthog, not issues on this tracker. Native blocking covers only the tickets of this map and #530.

### Contract pins (left open by #120921)

- 📌 **Status read path** `GET /api/projects/@current/messaging/emails/{message_id}/`, on the same `messaging` prefix as the send. It needs `hog_flow:read` and shares the send's throttles (#526). `message_id` is the id from the send's `202`.
- 🤖 **`key` on every send** A top-level `key` names the email on every request, library sends included, and the body carries exactly one of `template` and `content` (#120921, revised 2026-10-21). A library send is `template: { key } | { id }` plus `message_data`; a code send is `content: { subject, html?, text? }`. The idempotency fingerprint covers the `key` and the library template.
  - 📌 `key` follows the template key rule of PostHog/posthog#118924: `^[a-zA-Z0-9_-]+$`, at most 400 characters.
  - `subject` is required. At least one of `html` and `text` is required.
  - 📌 **Text derivation on the server.** When only `html` is present, the server derives `text`, for every caller: both SDKs, REST and the skill's `fetch` calls. No SDK derives it, so posthog-node and posthog-python cannot drift (#120921 recommends the server). This reverses #525's "Text fallback" line, which had posthog-node derive it with `html-to-text`. It also makes `text` optional on the wire, where #120921's send table still writes it as required; its mapping table already writes `text?`.
- 📌 **The email `key` picks the workflow, the template only feeds the content.** Sends stay on one transactional workflow per email (#526). A library send whose `key` differs from its template's key works like this:
  - The server finds the workflow by `key`. A `key` that names a template uses that template's transactional workflow, as #118924 does today. A `key` with no template of its own gets one workflow, made on its first send under the same lock as a code send's.
  - The workflow holds no copy of the content. cdp-api stamps the content source on `state.send` (`AcceptedSend`): the library template's id and its pinned published version, or the code content. The worker renders from `state.send` through the fixed slot (#526). So one workflow carries sends of any template under its key, and its logs and metrics group by the email.
  - A library send never writes a template. Only a code send writes the "Managed by code" template under its `key`.
  - Changing the template under a `key` is allowed and keeps the key's history in one place. A replay of the same idempotency key with another template answers `422` (the fingerprint covers it).
  - Where a `key` without a template stores its workflow link (a key field on the workflow, or a key row beside the templates) is Harley's storage call. The behavior above is the pin.
- 🤖 **`reply_to` on the wire** Always a list. The SDK turns a string into a one-item list (#120921).
- 🤖 **Snake case on the wire, camel case in Node** `from`, `reply_to`, `capture_engagement`, `identifiers.distinct_id` on the wire; `from`, `replyTo`, `captureEngagement`, `distinctId` in posthog-node.

### Differences from #525 and #526 that the contract settles

- 🤖 **Check failures answer `400`** with the policy code (`sender_not_verified`, `sender_not_allowed`, `sending_suspended`, `template_paused`, `recipient_suppressed`), `why` and `fix`. #526's round 3 drafted `422` and `403`. The contract wins.
- 🤖 **The server sends no `name`.** The error body is `{ type, code, detail, attr, why, fix, docs_url }`. posthog-node maps `code` to Resend's `name`.
- 🤖 **Two `409`s** differ by `code`: `template_outdated` is not retried, the in-flight one is.
- 🤖 **`to` is one address**, typed `string`. #525 had typed it `string | string[]` with a runtime refusal; the contract and #526 both take one.
- 🤖 **The client captures no event** for a send. The send and its engagement events come from the server only.

### Differences the contract does not cover (raised, not decided here)

- **A code send to a key edited in PostHog.** #525 locked "a body send to a key edited in PostHog returns 409 with why and fix" (Key ownership). #120921 lists no such `409`. The spec keeps #525's rule and asks Harley to add the row to the contract. posthog-node does not retry it.
- **A code send to a key uploaded from an HTML file.** The decisions do not say. 📌 The spec treats it like a key edited in PostHog: a code send writes the "Managed by code" template under its `key`, and it must not overwrite a template whose content lives elsewhere, so it answers the same `409`. Harley's call to confirm. A library send under that `key` is fine, because it writes no template.
- **Restricted-key error name.** #525 named a send refused by a key limit `restricted_api_key`, Resend's name. #120921 leaves restricted keys out of the contract, and its table would map that `400` to `validation_error`. The spec asks Harley to give the key-limit codes their own row when restricted keys join the contract.

### posthog-node (ours)

Builds on PostHog/posthog-js#5312, an unreleased draft, so its `template` field is replaced, not deprecated.

🤖 posthog-node implements the "Client interface (both SDKs)" section of #120921 and nothing different: client options, `emails.send`, `emails.get`, the three helpers, the option-to-body mapping, the result shapes, the shared behavior and the one error-name table. The tickets name that section as their spec; this one only adds what it leaves to Node. The TypeScript shape, from #526's prototype aligned to the contract:

```ts
export type CodeContent = Readonly<{ kind: 'code'; subject: string; html?: string; text?: string }>
export type LibraryTemplate = Readonly<{
  kind: 'library'
  template: { key: string } | { id: string }
  data: Record<string, unknown>
}>

export type SendEmailOptions = {
  to: string
  distinctId?: string
  from?: string
  replyTo?: string | string[]
  idempotencyKey?: string
  captureEngagement?: boolean
  key: string
  content: CodeContent | LibraryTemplate
}
```

- 🤖 **Content** One `content` field from exactly one pure helper: `html(subject, html, text?)`, `text(subject, text)` and `libraryTemplate(template, data?)` (#120921). `libraryTemplate()` sends `{ id }` when its argument is a UUID and `{ key }` otherwise. This is Michael's one-field decision on #526 with the contract's positional arguments.
- 👤 **`key` on every send** (Michael and Harley, 2026-10-21) `key` is required on every send and names the email; the library template is named inside `libraryTemplate()`. This replaces #526's "Library key" decision and supersedes ADR 0004 ("there is no second key").
- 📌 **Text fallback** `html()` without `text` sends no `text`; the server derives it (Contract pins). No `html-to-text` dependency.
- 👍 **`distinctId`** Optional. A send without it uses the address. The SDK never reads `withContext` for a send (ADR 0003). The email lookup by address is a follow-up after the production proofs (#534).
- 👤 **Capture default** `captureEngagement` is on unless the caller sets it to `false`. The JSDoc and docs say the events count as analytics events (#533).
- 🤖 **Errors** `{ name, code, message, why?, fix?, statusCode?, docsUrl?, field? }` with #120921's one error-name table, and the SDK codes `missing_secret_key`, `client_disabled`, `network_error`, `api_error`, `unexpected_error`. Warnings `{ code, message, fix }` are returned and logged once.
- 🤖 **Idempotency and retries** An `Idempotency-Key` on every call, a UUID v4 when the caller gives none. Retries network errors, the in-flight `409`, `429` and `503` with the same key, honoring `Retry-After`. The bound (3 attempts, 1 s then 2 s with jitter, capped at 30 s) is proposed in #120921; ticket 03 follows its final numbers. `get` never retries.
- 🤖 **Status read** `emails.get(id)` on the pinned path, ticket 12. It waits on Harley's S9 for its live proof only.
- 🤖 **Host** A client set to `us.i.posthog.com` or `eu.i.posthog.com` sends email to `us.posthog.com` or `eu.posthog.com`. A self-hosted host is used as it is. (#120921 marks this proposed.)
- 👤 **Attribution** A `migratedFrom: 'resend'` client option sends `X-PostHog-Migrated-From: resend` (#530). The User-Agent already marks the SDK.
- 👍 **Resend-only fields** `cc`, `bcc`, `tags`, `headers`, `scheduledAt`, `topicId` and `batch.send` do not exist on the type, so the skill reports them. `attachments` is outside #120921 and waits for Harley's attachment slice and a contract row; no ticket yet.
- 🤖 **Language extras, outside parity** `react(subject, element)` (ticket 05, Open decision 1), posthog-node PR 2 (ticket 11, needs `react()`), and #5312's `templateFile()` and `uploadTemplate()` (Open decision 3). posthog-python gets no counterpart, and none of them changes the wire.

### Migration skill (ours, context-mill)

- 👍 **Home** A new skill group `migrate-email` with a `resend` variant, beside `migrate`. It reuses `send-transactional-email`'s guidance (PostHog/context-mill#433) through context-mill's `shared_docs` and `{{> partial}}` includes, so there is one authored source and the bundle stands alone (#525, #529; spec pass).
- 👍 **Steps** #522's eight steps. Unsupported call sites stay on Resend and appear in the report.
- 👍 **One text for every host** The procedure lives in plain reference files. Wizard-only conventions (`wizard_ask`, `[STATUS]`, `[ABORT]`, `set_env_values`) sit in one optional section (#529).
- 👍 **v0, before the SDK** Detects, lists, classifies and reports. Sets up the sender and DNS, and hands over the key. Converts hosted-template and simple HTML sends to stored templates, uploaded by key, and sent with `fetch` to the send route with a top-level `key` equal to the uploaded template's key and `template: { key }`, carrying `X-PostHog-Migrated-From: resend` and the app's user ID. React, attachment and idempotency-key sites stay on Resend until the SDK and Harley's idempotency land.
- 👍 **v1** Moves everything, v0's own `fetch` calls included, to `posthog.emails.send` with `content`. Proves send, engagement and product event on one person (#532). React sites move only if `react()` is charted; otherwise they stay on Resend in the report.
- 👍 **Machine-readable summary** The report ends with a summary block: `from`, `sites_found`, `sites_rewritten`, `sites_left`, `templates_uploaded`, `dns_ready`. The Wizard reads it.
- 👍 **Tier check** The skill checks the project's sending tier before cutover. No pricing or tier code in this map.

### Wizard (ours, PostHog/wizard)

- 👤 **Command** `npx @posthog/wizard migrate resend`. `wizard migrate` becomes a family, and Statsig moves to `migrate statsig`. A script that runs bare `wizard migrate` breaks, so the release note says so (#529).
- 👍 **Skill-driven run** The family runs the generic agent-skill program with the skill id. No new native program in the first version.
- 👍 **Scopes** The `migrate` family adds the scopes the Resend skill needs (`integration:read`, `integration:write`, and the upload tool's scope), per family, not for every skill run. The Wizard OAuth app's server-side scope ceiling must include them in both regions. That is an ops step, not a code PR.
- 👍 **Summary and offer** The Wizard captures `wizard: migration summary` with the skill's summary fields. An install run that finds `resend` in `package.json` offers the migrate run, so the detector ships with it.

### Docs (ours, posthog.com)

- 👍 The transactional email API page (PostHog/posthog.com#21306) gains code content, `from`, `reply_to`, the error shape with `name`, idempotency and retries, what `202` means, and the engagement billing line.
- 👍 A "Migrate from Resend" page with a copyable agent prompt, after skill v1 and the Wizard family.

### Send attribution (ours, existing)

- [Send attribution](https://github.com/Silthus/posthog/issues/530), draft PostHog/posthog#120628 at `ed6b4b59bdf`. `source`, `sdk_version`, `migrated_from` on the `transactional email api send` event, the `X-PostHog-Migrated-From` header, and `email_migrated_from` on the organization once.
- It covers `messaging_templates/{id}/send/` on `master`. The send route of the contract, `messaging/send/email/`, lives on PostHog/posthog#118924 and records no source yet. Who adds it there is Open decision 4.
- It knows `posthog-node/` and `posthog-edge/` User-Agents. #120921 sends `posthog-python/<version>`, which must count as `source: sdk` too. Ticket 01 adds it on #120628's branch, with the route half of Open decision 4.

### Server slices (Harley, PostHog/posthog, against #120921)

These are the slices #526 agreed, in its order. Harley plans and builds them; this map charts no ticket for them. Each line names the seam and the tickets of ours that wait on it.

| #   | Slice                                                                                                                                                                                                                                                                                                 | Seam (#526)                                             | Our tickets that wait on it                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| S1  | Send policy refactor (R1): one `EmailSendPolicy.check(send, phase)`, no behavior change                                                                                                                                                                                                               | `EmailSendPolicy`                                       | none directly                                           |
| S2  | `EmailSendCommand` and the typed CDP outcome (R2)                                                                                                                                                                                                                                                     | `EmailSendCommand`, `Queued \| Rejected \| Unavailable` | none directly                                           |
| S3  | `idempotentEnqueue` over the store (R3), after his stack lands                                                                                                                                                                                                                                        | `idempotentEnqueue`                                     | 03 (live proof of retries)                              |
| S4  | The body route: `key` on every send, code `content`, the key-picks-workflow mapping (Contract pins), server-side text derivation, `from`, `reply_to`, `capture_engagement`, the address fallback, `AcceptedSend` on the run state, the fixed slot, tracking header v3, UTMs on for new code templates | `AcceptedSend`, the fixed slot                          | 02, 03, 04, 05, 06                                      |
| S5  | Idempotency wiring: the shared `transactional-email` scope and the fingerprint with the email `key`, the library template, identity and content; `rate_limit_exceeded` with `Retry-After`                                                                                                             | `idempotentEnqueue` fingerprint                         | 03, 06                                                  |
| S6  | Checks before queueing (every policy code is a `400` with why and fix), and pinned content for library sends                                                                                                                                                                                          | `check(send, 'admission')`                              | 04, 06 (a refused send never gets a `202`)              |
| S7  | Attachments: worker raw MIME, cdp-api caps with bytes kept out of run records, Django validation; 512KB per email                                                                                                                                                                                     | `AcceptedSend.attachments`                              | posthog-node attachments, not charted (Open decision 2) |
| S8  | Restricted keys: storage, the check before queueing and at delivery, the key modal                                                                                                                                                                                                                    | `key_limits`, `AcceptedSend.keyLimits`                  | 06 (staging key step), 10                               |
| S9  | Status record: ClickHouse table, status writers, `GET /api/projects/@current/messaging/emails/{message_id}/`                                                                                                                                                                                          | `EmailStatusWriter`, `get_email_status`                 | 12                                                      |
| S10 | posthog-python on the same contract, User-Agent `posthog-python/<version>`                                                                                                                                                                                                                            | #120921                                                 | 01 counts its User-Agent                                |

Notes from #526 and its research for these slices, offered to Harley, not decided for him:

- `AcceptedSend` is part of the queued job format: the worker deploys before cdp-api stamps it, and a mixed-version rollout owes a cross-version proof (ADR 0002). The same holds for attachments and key limits.
- **Attachment bytes.** #526's contract says "bytes never in the run state" (`StoredAttachmentRef`). The attachment spike's 512KB slice keeps bytes inline in the queued run and strips them from run records, because object storage needs a bucket and IAM outside this repo. The two disagree; Harley decides.
- **Contract rows to add.** The `409` for a code send to a key edited in PostHog (or uploaded from a file), `text` optional on the send table, the key-limit error codes, and attachments once S7 has a shape.
- **Durable receipt.** #525 owes Harley one question: does the idempotency Valkey run `noeviction` with persistence, and what is its availability target? A Postgres receipt next to the queue insert is his follow-up only if that cannot be promised.
- `hog_flow_created` fires only from the workflow viewset's create, so workflows made by the send service already stay out of that event (🤖, checked on PostHog/posthog#118924).

## Testing Decisions

A good test drives the public surface a user touches and asserts what they observe: the HTTP request posthog-node sends and the `{ data, error }` it returns, the files a skill run leaves in a repository, the command a Wizard run resolves. It never asserts internals.

- **posthog-node:** the `emails` namespace on a real client, with `fetch` mocked at the HTTP boundary, as PostHog/posthog-js#5312's tests do. Seams: request body and headers per mapping row of #120921, the error-name table and SDK codes, retries and `Retry-After` with fake timers, the idempotency key reuse across retries, warnings logged once, the host mapping, `withContext` ignored, `get` without retries. A parity table of each contract row against the Node behavior goes in the PR, for posthog-python's reviewer. One live run against Harley's route on a local stack, with the email in the dev mail catcher, once his slice exists; until then the live proof is a recorded gap.
- **Skill:** context-mill's bundle build test (as #433 added), the MCP `SkillCatalog` ranking for "migrate from Resend", "replace resend with posthog" and "switch email provider", and agent runs on fixture apps judged by the diff, not the transcript (#529): a happy app (PostHog/wizard-workbench#2221), a hard app (Silthus/next-session: REST, idempotency key, `.ics` attachment), and a negative app with no Resend. Model runs vary, so each fixture runs a few times.
- **Wizard:** the family resolution test with a fake `skill-menu.json` holding a Statsig and a Resend entry, and the summary event's properties at the analytics boundary.
- **Docs:** every `docs_url` the server and the SDK emit resolves to an anchor on the page.
- **Attribution:** the existing parameterized test of #120628, extended with `posthog-python/` and, with Open decision 4, the contract's route.
- Prior art: #5312's `emails` tests, #433's bundle and ranking proof, the Wizard's audit family tests.
- Proofs owed and recorded as gaps until they can run: real SES delivery and DNS publish from a deployed project; production-shape proofs (status read latency) until production read access exists; sender verification through the MCP until PostHog/posthog#116863 to #116865 land.

## Out of Scope

- Translating Resend `last_event` checks. `status` is not `last_event` (ADR 0005), so a site that branches on it stays on Resend with a report row.

- Every server-side change of the send API: Harley's slices S1 to S9, and posthog-python (S10).
- `cc`, `bcc`, `tags`, `headers`, `scheduledAt`, `topicId`, `batch.send`, more than one `to`, outbound delivery webhooks, scheduled sends (#525, map Out of scope).
- Liquid or Hog in code content, and person properties in API sends (a follow-up for keys with `person:read`).
- Attachments over 512KB and attachments by URL or local path.
- A send-only key minted by the Wizard over OAuth, and the trial sender before DNS: after the first release (#525).
- The email lookup by address (#534), the durable "sending" mark, linking a click to a new browser, attribution on Node delivery events, the queue codec cycle: #526 follow-ups.
- A reputation-isolation ticket (#525), pricing or tier code, other email vendors.
- A generated MCP tool for the status read.

## Further Notes

- **Complexity** (parts kept against the simplest option):
  - Error names follow Resend's vocabulary in the SDK only, so migrated `error.name` branches keep working while the server keeps one `code` (#525, #120921).
  - The Wizard family breaks bare `wizard migrate` for scripts; Michael chose the family over `wizard skill` only (#525).
- **Measurement.** After #530 merges, the Code-sending orgs and Switched orgs insight goes on its own dashboard, never on a shared team dashboard (conductor note on #530). It is not a PR.
- **Merge order.** Skill v0 merges once posthog.com#21306 publishes and Harley's body route (S4) is live; it needs no SDK release. Skill v1 merges after posthog-js#5312 plus posthog-node PR 1 release and the API docs ticket publishes (as for #433).
- **posthog-python** is Harley's (S10). This map charts no ticket for it; ticket 01 only counts its User-Agent.
- **Public repo.** No usage numbers, customer data or internal metrics in any ticket, branch or PR. The private research note the map points at stays background.

## Tickets (this map)

| #   | Ticket                                                                                                     | Repo                                  | Base                                         | Blocked by (native)                 | Waits on (named)                                      |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| —   | [Send attribution](https://github.com/Silthus/posthog/issues/530) (existing, draft PostHog/posthog#120628) | PostHog/posthog                       | `master`                                     | —                                   | —                                                     |
| 01  | Attribution: `posthog-python/` as an SDK, and the contract's send route (Open decision 4)                  | PostHog/posthog                       | `feat/email-send-attribution` (#120628)      | —                                   | PostHog/posthog#118924 (route half)                   |
| 02  | Skill v0: `migrate-email` / `resend`                                                                       | PostHog/context-mill                  | `feat/send-transactional-email-skill` (#433) | #530, 01 (if Open decision 4 holds) | PostHog/posthog#118924, Harley S4 (`key`)             |
| 03  | posthog-node PR 1: `emails.send` per #120921's client interface                                            | PostHog/posthog-js                    | `feat/node-emails-send` (#5312)              | —                                   | Harley S4, S5                                         |
| 04  | Docs: code content, errors, idempotency on the API page                                                    | PostHog/posthog.com                   | `docs/transactional-email-api` (#21306)      | 03                                  | Harley S4, S6                                         |
| 05  | posthog-node: `react()` language extra (Open decision 1)                                                   | PostHog/posthog-js                    | ticket 03's branch                           | 03                                  | Harley S4 (live proof)                                |
| 06  | Skill v1: every site on `posthog.emails.send`                                                              | PostHog/context-mill                  | ticket 02's branch                           | 02, 03, 04, 05 (if charted)         | Harley S4, S5, S6                                     |
| 07  | Wizard: the `migrate` family                                                                               | PostHog/wizard (+ context-mill entry) | `main`                                       | 02                                  | —                                                     |
| 08  | Wizard OAuth app scope ceiling (ops task)                                                                  | none (Django admin, both regions)     | —                                            | —                                   | —                                                     |
| 09  | Wizard: migration summary event and the Resend offer                                                       | PostHog/wizard                        | ticket 07's branch                           | 02, 07                              | —                                                     |
| 10  | Docs: "Migrate from Resend" page                                                                           | PostHog/posthog.com                   | `master`                                     | 06, 07                              | —                                                     |
| 11  | posthog-node PR 2: upload the React preview render (Open decision 1)                                       | PostHog/posthog-js                    | ticket 05's branch                           | 05                                  | Harley: refusal of a library send of a preview render |
| 12  | posthog-node: `emails.get`                                                                                 | PostHog/posthog-js                    | ticket 03's branch                           | 03                                  | Harley S9 (live proof)                                |

Ticket 08 gates the live proof of 07 and 09, not their code. Tickets 05 and 11 exist only if Open decision 1 holds.

## Open decisions

1. **`react()` and posthog-node PR 2 (tickets 05 and 11).** #526 and #120921 make `react()` a Node language extra and a follow-up. #525's destination ("React Email components unchanged") seemed to need it. The spec pass showed it does not: a React Email app already has `render()` from `@react-email/render` (or `@react-email/components`), so skill v1 rewrites `react: <Welcome />` to `content: html(subject, await render(<Welcome />))` and the component stays unchanged. Recommended: chart neither ticket 05 nor ticket 11. Skill v1 moves React sites with `render()`, and a real send already writes the "Managed by code" template under its `key`. Deploy-time preview uploads become a follow-up. This reverses revision 1's recommendation. The alternative is to chart both as drafted.
2. **posthog-node `attachments`.** Ours, but outside #120921 and waiting on Harley's S7, whose byte storage is still open. Recommended: no ticket until S7 and its contract row exist, then one ticket.
3. **#5312's file helpers.** On #5312, a template file is sent through the `template` field, and the send uploads the file when PostHog lacks its hash (`packages/node/src/emails.ts`, `sendTemplate` / `sendFile`). Ticket 03 removes that field, so "keep them as they are" is not possible. Recommended: keep `uploadTemplate()` as an explicit Node extra (deploy step, CI or the agent), drop the file-send auto-sync, and send an uploaded file with `libraryTemplate(key)`. The alternative is a fourth helper or content kind for files, which adds a send path posthog-python lacks.
4. **Attribution on the contract's send route.** #120628 attributes only `messaging_templates/{id}/send/` on `master`; the skill and both SDKs send to `messaging/send/email/` on #118924. Recommended: restack #120628 onto `spec/code-managed-templates` and attribute both routes there, ours, in ticket 01, before the first skill that sends merges. The alternative is to ask Harley to call `SendSource` from his route, and ticket 01 shrinks to the posthog-python line.
5. **Skill v0's `fetch` rewrite.** #525 accepted a v0 that moves hosted-template and HTML sites to raw `fetch` calls before the SDK, which v1 then rewrites again. With a `key` on every send, v0's sends wait on Harley's S4, as posthog-node PR 1 does, so v0's head start is only the SDK release. Recommended: v0 keeps detection, inventory, sender and DNS setup, the key hand-over, template upload and the report, and rewrites no call site; v1 does the one cutover to `posthog.emails.send`. This drops v0's dependence on S4 and on ticket 01, and gives one send representation in migrated apps. The alternative is v0 as drafted.
