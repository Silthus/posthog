Spec: Resend parity
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Answers: [Spec Resend parity and slice it into PRs](https://github.com/Silthus/posthog/issues/531)
Built on: the product decisions of [Grill Resend parity](https://github.com/Silthus/posthog/issues/525), the structure of [Shape the architecture of Resend parity](https://github.com/Silthus/posthog/issues/526) ([architecture doc](https://github.com/Silthus/posthog/blob/0f0bc0f5f32d7835f434dba7c1d6e43cb182f3ec/docs/architecture/resend-parity.md), five ADRs), and the shared SDK contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921).
Folds in: research #522, #523, #524, #527, #529, #532, #533, #534, and [Send attribution](https://github.com/Silthus/posthog/issues/530) (draft PostHog/posthog#120628).

Status: approved by Michael (2026-10-21). Revision 4: the flat send shape of #120921, Michael's answers to the open decisions (2026-10-21), and the builders-per-strand method, and the r3 spec pass.

## Problem Statement

A team that sends transactional email through Resend wants to move that mail to PostHog, and its coding agent should do the move.

Today that does not work:

- PostHog sends only a stored template, by its id. A Resend call site sends rendered `html`, a React Email component, or a hosted template, so every such site needs a hand conversion first.
- posthog-node's draft `emails.send` (PostHog/posthog-js#5312) has no `from`, `subject`, inline content, `replyTo` or idempotency key. Its errors drop `why` and `fix`, and its error names do not match Resend's, so migrated `if (error.name === ...)` branches break.
- A send answer does not say what it promises. A retry after a timeout can send a second email. A send that the worker later skips (suppressed recipient, paused template) still answered OK.
- After a send, the app cannot read the email's status back.
- No skill or Wizard run moves a codebase off Resend, and PostHog cannot count the organizations that send from code or that switched.

## Solution

One contract, [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921), with two owners:

- **Harley** builds template sends in posthog-python now, on the existing `/messaging_templates/{id}/send/` route.
- **This map** builds the send API for code content in PostHog/posthog, posthog-node, the posthog-python code form after Harley's PR lands, the context-mill migration skill, the Wizard `migrate resend` run, the docs, and send attribution.

`send` takes flat fields in one of two forms:

```ts
const posthog = new PostHog('phc_...', {
  secretKey: process.env.POSTHOG_PROJECT_SECRET_API_KEY,
  migratedFrom: 'resend',
})

// A template made in PostHog, by its id
await posthog.emails.send({ to: 'jane@example.com', distinctId: user.id, templateId: '<uuid>', templateData: { firstName: 'Jane' } })

// Code form, rendered content: React rendered to html in the app
const { data, error } = await posthog.emails.send({
  to: 'jane@example.com',
  distinctId: user.id,
  templateKey: 'password-reset',
  subject: 'Reset your password',
  html: await render(<PasswordReset url={url} />),
  from: 'Acme <security@acme.com>',
})

// Code form, local template: the code is the source of truth, PostHog fills in the variables
await posthog.emails.send({ to, distinctId, templateKey: 'welcome', subject: 'Welcome, {{ variables.name }}', html: welcomeHtml, templateData: { name: 'Jane' } })
// data: { id, warnings } once PostHog queued the send; error: { name, code, message, why, fix, statusCode, docsUrl, field }
```

- `202` means PostHog stored the send in its queue for delivery, not that the provider accepted it or that it was delivered.
- A check that would skip the send later runs before the `202`, and a failed check returns an error with `why` and `fix`.
- Every send carries an idempotency key. The SDK makes one when the caller gives none and retries with the same key.
- A local template uploads itself on its first send and whenever its content changes. Nobody calls an upload.
- Engagement capture is on by default for code sends. The events count as analytics events, and the docs and the SDK say so.
- The skill leaves each call site it cannot move on Resend and lists it in its report, so the person cuts over in parallel.

## User Stories

Migration

1. As an engineer on Resend, I want one Wizard command, `npx @posthog/wizard migrate resend`, so that my transactional mail moves to PostHog in one run.
2. As an engineer, I want to run the same migration from my own coding agent without the Wizard, so that I use the tool I already have.
3. As an engineer, I want the run to stop before any edit when my app has no Resend, so that a wrong run costs nothing.
4. As an engineer, I want the run to list every Resend call site with its file, line and fields, so that I see the whole job first.
5. As an engineer, I want each site classified as moved or left on Resend with a reason, so that I know what is still mine to do.
6. As an engineer, I want a site that uses a field PostHog does not have to stay on Resend unchanged, so that no field is dropped silently and no email goes to the wrong people.
7. As an engineer, I want my hosted Resend templates to become templates in my code, so that the code stays the source of truth and the agent creates nothing in PostHog by hand.
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

Sending

18. As an engineer, I want `posthog.emails.send` on the PostHog client I already use, in Node and in Python, so that I add no new client.
19. As an engineer, I want to send a template made in PostHog by its id with `templateData`, so that templates edited in PostHog stay sendable.
20. As an engineer, I want to send HTML or text I rendered myself, named by a `templateKey`, so that a Resend `html:` or React site is a small change.
21. As an engineer, I want to keep a template with variables in my code and have the SDK upload it when it changes, so that my code is the source of truth and I never call an upload.
22. As an engineer, I want an HTML send without `text` to get a plain-text part, so that every email has a text fallback.
23. As an engineer, I want each `templateKey` to group its logs, metrics and status, so that each kind of email has its own place in PostHog.
24. As an engineer, I want the type system to refuse a send that mixes the two forms, so that a wrong combination does not compile.
25. As an engineer, I want `from` and `replyTo` on code sends, so that a per-call sender from Resend keeps working.
26. As an engineer, I want a clear error when `from` is not a verified sender, so that I fix the sender, not the call.
27. As an engineer, I want docs and examples that always pass `distinctId`, so that engagement events land on my app's user.
28. As an engineer, I want a send never to take the recipient from my request context, so that an invite sent by an admin never lands on the admin's timeline.
29. As an engineer on Node, I want `{ data, error }` and never an exception; as an engineer on Python, I want typed exceptions; both with the same fields.
30. As an engineer, I want `error.name` to use Resend's names, so that my existing `rate_limit_exceeded` branch keeps working.
31. As an engineer, I want every error to say what happened, why, and how to fix it, with a docs link, so that I or my agent repair the call without a search.
32. As an engineer, I want an idempotency key on every call, made for me when I give none, and retries with the same key, so that a retry never sends twice.
33. As an engineer whose job runner already retries, I want `maxRetries: 0` and a key derived from the email's purpose, so that a job retry never sends twice.
34. As an engineer, I want a monthly quota error not to be retried, so that my send fails fast.
35. As an engineer behind a reverse proxy, I want the secret key never sent to my proxy host, and a clear `missing_app_host` error instead, so that the key stays safe.
36. As an engineer, I want engagement capture on by default for code sends, with `captureEngagement: false` per send, and the docs to say the events count as analytics events.
37. As an engineer, I want a send that would be skipped later to fail before the `202`, so that a `202` never hides a skip.
38. As an engineer, I want to read an email's status by its id, so that my app can show "sent" or "bounced".

Docs and measurement

39. As an engineer, I want one docs page that covers both forms, errors, idempotency and what `202` means, so that every `docsUrl` opens the fix.
40. As an engineer, I want a "Migrate from Resend" page with a prompt I can copy into my agent, so that I can start the move from the docs.
41. As PostHog, I want every send to record whether it came from the API or an SDK, the SDK version, and the migration marker, so that we count Code-sending orgs and Switched orgs.
42. As PostHog, I want the Wizard to capture a migration summary (sites found, rewritten and left, DNS ready), so that we see where migrations stall.
43. As PostHog, I want workflows created by code sends to stay out of the workflow list and not fire `hog_flow_created`, so that Started orgs keep their meaning.

## Implementation Decisions

Marks: 👤 Michael decided, 👍 Michael accepted the recommendation, 🤖 settled by the code or the contract, 📌 pinned by this spec (open to Michael's redirect).

### Ownership and contract

- 👤 **Split (2026-10-21)** Harley builds posthog-python template sends on `/messaging_templates/{id}/send/`. They move to `/messaging/send/email/` inside the SDK once PostHog/posthog#118924 lands. Michael builds the code-content send API, posthog-node, and the posthog-python code form on top of Harley's PR once it merges, so both SDKs match.
- 👤 **Contract** #120921 is the source of truth for the HTTP surface and the client interface. This spec pins what its Open section proposes, and nothing here differs from it.
- 👤 **Superseded** #526's "Library key" decision, ADR 0004, and the 2026-10-21 "key on every send" shape. Templates made in PostHog have no key and are sent by id; the code form names the email with `template_key`.
- 👤 **`distinct_id`** Optional. Docs and examples always pass it. Resolving it on the server is a later decision.

### Contract pins

- 📌 **Status read path** `GET /api/projects/@current/messaging/emails/{message_id}/`. It needs `hog_flow:read` and shares the send's throttles (#526).
- 🤖 **Text** When only `html` is present, the server derives `text`, for every caller.

### Code form

- 👤 **Two cases, told apart by `template_data`** (#120921 Open, Michael 2026-10-21):
  - **Rendered content** (no `template_data`): already rendered for one recipient. It travels in the queued job's state (`AcceptedSend`) and is never stored as a template version. Storing it as a message asset follows PostHog/posthog#120520.
  - **Local template** (with `template_data`): the code is the source of truth. The SDK hashes the content (#118924's `content_hash` v1) and sends `template: { key, hash }` with `message_data`. On `409 template_outdated` it uploads by key and sends again with the same idempotency key. Users never call an upload, and the upload carries no link to the code.
- 📌 **Workflow per key** A `template_key` that names a template uses that template's transactional workflow. Any other key gets one workflow on its first send, made under a lock. Metrics, logs and status group by the key.
- 🤖 **Edited in PostHog** A local-template upload to a key whose content was edited in PostHog answers `409` with why and fix, and nothing is sent (#525 key ownership).
- 👤 **React** is not an SDK helper. The app renders it to `html` and sends rendered content.

### Send API (ours, PostHog/posthog)

Built in #526's order: the refactors first as mechanical PRs, the features stacked on them.

- **R1** `EmailSendPolicy.check(send, phase)` (slice 02). **R2** `EmailSendCommand` and the typed CDP outcome (slice 03). **R3** `idempotentEnqueue` over Harley's store (slice 05).
- The code form on `messaging/send/email/`, `AcceptedSend` and the fixed slot, tracking header v3 (slice 04).
- Idempotency for both forms (slice 06): scope `transactional-email`, the fingerprint of #120921, replay before checks, `422`, in-flight `409`, `503`.
- 🤖 Harley's store accepts one known duplicate: a crash between the reservation and the queue write, or a failed completion write followed by a retry after the 60 s pending window, can queue a second send. The send API inherits that limit and the docs say so. 👤 Michael accepted it for now (2026-10-21); a side fix tries to close it in the store, reviewed by its owner.
- 🤖 Local templates on #118924's routes: a key PostHog does not know answers `409 template_outdated`, not `404`, so the first send uploads it. The SDK's upload carries `if_code_managed`, and under the row lock it refuses a template edited in PostHog with `409` instead of adopting it (slice 04).
- Checks before the `202`, the two `429` codes, and pinned content for template sends (slice 07).
- The status record and the read (slice 08).
- 🤖 `AcceptedSend` is part of the queued job format: the worker deploys first, and slice 04 owes a cross-version proof (ADR 0002).
- 🤖 `hog_flow_created` fires only from the workflow viewset's create, so workflows made by the send service stay out of it (checked on #118924).

### posthog-node (ours)

Builds on PostHog/posthog-js#5312, an unreleased draft, so its public `template` field, `templateFile()` and `uploadTemplate()` go away; its hashing and upload code stays internal for local templates.

- 🤖 Client options `secretKey`, `appHost`, `maxRetries`, `migratedFrom`, the flat forms, `{ data, error }`, the error table and SDK codes, retries without `quota_limited`, warnings logged once, no client events, never `withContext` (#120921).
- Slice 09 ships the template form and the shared behavior against today's route, matching Harley's Python. Slice 10 adds the code form and moves the template form to `messaging/send/email/`. Slice 11 adds `emails.get`.

### posthog-python (ours after Harley)

- 👤 Slice 12 adds the code form on top of Harley's template-send PR once it merges, with his `TypedDict`/`Unpack` and typed-exception patterns, and a parity table against slice 10.

### Migration skill (ours, context-mill)

- 👍 **Home** A new skill group `migrate-email` with a `resend` variant, beside `migrate`. It reuses `send-transactional-email`'s guidance (PostHog/context-mill#433) through `shared_docs` and `{{> partial}}` includes, so the bundle stands alone.
- 👍 **Steps** #522's eight steps. Unsupported call sites stay on Resend and appear in the report.
- 👍 **One text for every host** Wizard-only conventions sit in one optional section (#529).
- 👤 **v0 rewrites no call site** It detects, inventories, sets up the sender and DNS, hands over the key, checks the tier, and reports. The agent never creates a template.
- 👤 **v1 is the one cutover** Hosted templates become local templates in the app's code; `html:`, `text:` and React sites send rendered content; the skill proves send, engagement and product event on one person (#532).
- 🤖 **Hosted-template subset** Variable names stay as they are, and a Resend fallback becomes Liquid's `default`. PostHog's Liquid escapes HTML in output, so an HTML-valued variable, or any syntax beyond variables and fallbacks, keeps the site on Resend with a report row (slice 15).
- 🤖 **The send skill first** #433's `send-transactional-email` still teaches #5312's `templateFile()` and "sends are not idempotent". It moves to the flat contract (slice 20) before the migration skill reuses it, and merges after the posthog-node release.
- 👍 **Machine-readable summary** The report `posthog-migrate-email-resend-report.md` ends with `from`, `sites_found`, `sites_rewritten`, `sites_left`, `dns_ready`. The Wizard reads it.

### Wizard (ours, PostHog/wizard)

- 👤 **Command** `npx @posthog/wizard migrate resend`. `wizard migrate` becomes a family; Statsig moves to `migrate statsig`; the release note says bare `wizard migrate` now needs a subcommand (#529).
- 👍 **Skill-driven run** The family runs the generic agent-skill program with the skill id.
- 👍 **Scopes** `integration:read` and `integration:write` for the `migrate` family. The skill uploads nothing, so no template scope. The OAuth app's scope ceiling needs them in both regions (slice 17, an ops task).
- 👍 **Summary and offer** `wizard: migration summary` with the skill's summary fields; an install run that finds `resend` in `package.json` offers the run.

### Docs (ours, posthog.com)

- 👍 The API page (PostHog/posthog.com#21306) covers both forms, client setup, errors, idempotency and `202` (slice 13). A "Migrate from Resend" page follows skill v1 and the Wizard family (slice 19).

### Send attribution (ours)

- 👤 #120628 restacks onto `spec/code-managed-templates` and records the source on both routes, and counts `posthog-python/` as an SDK (slice 01).

## Testing Decisions

A good test drives the public surface a user touches and asserts what they observe: the HTTP answer of a route, the request an SDK sends and the result it returns, the files a skill run leaves in a repository, the command a Wizard run resolves. It never asserts internals.

- **Send API:** routes at the HTTP boundary with cdp-api or the queue faked at their interfaces; the idempotency store real in its test setup; the status read against the test ClickHouse. Each slice names its seams.
- **SDKs:** the `emails` namespace on a real client with the HTTP boundary mocked, as #5312's tests do. A shared hash fixture keeps both SDKs and the server on one `content_hash`. Each SDK PR carries a parity table against the contract.
- **Skill:** context-mill's bundle build test, the `SkillCatalog` ranking, and agent runs on fixture apps judged by the diff and the report (#529): a happy app (PostHog/wizard-workbench#2221), a hard app (Silthus/next-session: REST, idempotency key, `.ics` attachment), a REST-only app, and a negative app with React Email but no Resend. Model runs vary, so each fixture runs a few times.
- **Wizard:** the family resolution test with a fake `skill-menu.json`, and the summary event at the analytics boundary.
- **Docs:** every `docs_url` the server and the SDKs emit resolves to an anchor.
- Proofs owed and recorded as gaps until they can run: real SES delivery and DNS publish; production-shape proofs (status read latency) until production read access exists; sender verification through the MCP until PostHog/posthog#116863 to #116865 land.

## Out of Scope

- posthog-python template sends: Harley's.
- Attachments, restricted keys limited to senders, the email lookup by address (#534), and more than one recipient: outside #120921, each its own PR later.
- A React helper or any content helper in the SDKs; deploy-time template uploads and links from a template to its code.
- Translating Resend `last_event` checks: `status` is not `last_event` (ADR 0005), so such a site stays on Resend with a report row.
- `cc`, `bcc`, `tags`, `headers`, `scheduledAt`, `topicId`, `batch.send`, outbound delivery webhooks, scheduled sends (#525).
- Liquid or Hog in rendered content, and person properties in API sends.
- Resolving `distinct_id` on the server.
- A send-only key minted by the Wizard over OAuth, and the trial sender before DNS (#525).
- The durable "sending" mark, linking a click to a new browser, attribution on Node delivery events, the queue codec cycle: #526 follow-ups.
- A reputation-isolation ticket, pricing or tier code, other email vendors, a generated MCP tool for the status read.
- The 24-hour idempotency window question stays with #523.

## Further Notes

- **Complexity** (parts kept against the simplest option):
  - Error names follow Resend's vocabulary in the SDKs only, so migrated `error.name` branches keep working while the server keeps one `code` (#525, #120921).
  - The Wizard family breaks bare `wizard migrate` for scripts; Michael chose the family over `wizard skill` only (#525).
  - The two refactors and `idempotentEnqueue` land before the features, because #526 put every feature on those seams.
  - The Wizard's install offer and summary event (slice 18) stay: #525 decided them, and the summary event is how story 42 sees where migrations stall. It is the Wizard strand's last slice, so nothing waits on it.
- **Measurement.** After #530 merges, the Code-sending orgs and Switched orgs insight goes on its own dashboard, never on a shared team dashboard. It is not a PR.
- **Merge order.** posthog.com#21306 publishes before slice 13. #433 (with slice 20) and skill v1 merge after posthog-node's code form releases; skill v1 also after slice 13 publishes. Merge #118924 before the send-API stack grows deep.
- **Public repo.** No usage numbers, customer data or internal metrics in any issue, branch or PR.

## Slicing: builders per strand

👤 Michael chose builders per strand for this map, as a trial (2026-10-21). It changes how the slices become work, not the PRs.

- **A strand** is the slices that edit the same files, built in order by one worker. Slices stay as listed in [`slices/`](slices/); each is one PR, or new commits on the draft PR it names.
- **Issues:** on approval, one issue per strand, a sub-issue of #461, with native blocking between strands. The body lists the strand's slices in order as a checklist linking [`slices/`](slices/) and this spec, and names the lane, its wall-time cap, and Harley's PRs it waits on. Drafts: [`strands/`](strands/). Slice 17 stays its own HITL task issue.
- **Lanes:** one build lane per strand, Opus 5.5 `high`, its own worktree, a wall-time cap. Lane prompts: [`lanes/`](lanes/). The builder picks its own staging and subagents, and hands heavy exploration to a subagent rather than compacting.
- **Per slice:** a red/green test, its commits, and the PR shape the repo's reviewers need.
- **Per strand:** one GPT-6.1 Sol `high` review of the strand's whole diff, fixes in the same lane, then reviewed draft PRs, nothing marked ready.
- **Measure:** each lane reports to the conductor, not on a public issue: wall time, active time, slices, PRs and lines, merge conflicts, review rounds and findings (cross-slice or other), compactions, and anything redone or left unfinished.

| Strand         | Slices, in order               | Repo                      | Blocked by (strand)                                                    | Waits on (Harley)                     | Cap (📌) |
| -------------- | ------------------------------ | ------------------------- | ---------------------------------------------------------------------- | ------------------------------------- | -------- |
| send-api       | 01, 02, 03, 04, 07, 05, 06, 08 | PostHog/posthog           | —                                                                      | #120446, #120392, #120510 (before 05) | 12 h     |
| posthog-node   | 09, 10, 11                     | PostHog/posthog-js        | send-api (10 needs 04, 11 needs 08; 09 starts at once)                 | —                                     | 6 h      |
| posthog-python | 12                             | PostHog/posthog-python    | send-api, posthog-node                                                 | his template-send PR merged           | 3 h      |
| docs-api       | 13                             | PostHog/posthog.com       | send-api, posthog-node                                                 | —                                     | 3 h      |
| skill          | 20, 14, 15                     | PostHog/context-mill      | send-api, posthog-node, docs-api (all for 15; 20 and 14 start at once) | —                                     | 7 h      |
| wizard         | 16, 18                         | PostHog/wizard            | skill (needs 14)                                                       | —                                     | 4 h      |
| docs-migrate   | 19                             | PostHog/posthog.com       | skill, wizard                                                          | —                                     | 2 h      |
| task           | 17                             | none (Django admin, HITL) | —                                                                      | —                                     | —        |

- A strand's native blocker is the strand that must finish first. A lane may start its first slices earlier once the slice it needs has merged; the table names those slices. Waiting time does not count toward the cap.
- Attribution (01) sits in send-api because it edits the same send route as slice 04.
- The docs are two strands, because slice 13 must come before skill v1 and slice 19 after it.
- Slice 17 gates the live proofs of 16 and 18, not their code.
- The Wizard's context-mill entries (`parentCommand: migrate`) sit in slice 14, so only the skill lane edits context-mill.
- Release gates: posthog-node's template form waits for #120392 deployed, its code form for slice 06 deployed; slice 09's replay proof is a gap until then.

## Decisions recorded (2026-10-21)

1. **React** (was Open decision 1): no `react()` and no preview upload. The app renders to `html`. 👤
2. **Attachments** (was Open decision 2): out of scope; not in #120921. 👤
3. **#5312's file helpers** (was Open decision 3): no user-facing upload. Local templates upload inside `send` by hash; `templateFile()` and `uploadTemplate()` go away. 👤
4. **Attribution route** (was Open decision 4): restack #120628 and attribute both routes (slice 01). 👍
5. **Skill v0** (was Open decision 5): no call-site rewrite; v1 is the one cutover. 👤
6. **Duplicate limit** (spec pass r3): accept the store's documented duplicate limit for now; a side fix PR tries to close it. 👤
