# What would an engineer-first transactional send API need?

Research for [#216](https://github.com/Silthus/posthog/issues/216), part of the Workflows growth map [#210](https://github.com/Silthus/posthog/issues/210).

Evidence: the code on `master` at the time of writing (paths below are repo-relative) and the public Resend and Postmark docs (linked in [Sources](#sources)).
Anything not read in code or docs is marked **guess**.

## Short answer

Today an engineer who wants to send "your password reset link" from their backend has to build a workflow with a webhook trigger and an email step, then `POST` to `/public/webhooks/<workflow_id>`.
That works, but it is a workflow trigger, not a send API.
It answers `201 {"status": "queued"}` with no message id, has no idempotency, no status lookup by id, no template-by-reference, no attachments, one recipient, inconsistent error bodies, and auth is a per-workflow shared header instead of a project key.

Most of the hard parts already exist and sit behind one choke point, `EmailService.executeSendEmail`: verified senders, suppression, transactional vs marketing categories, per-team and per-workflow pacing, SES tenant attribution, open/click/bounce tracking, sent-email assets.
Project secret API keys (PSAKs) already give a project-scoped, user-less credential with write scopes.
The gap is a thin, synchronous-feeling front door plus a message record.

**Smallest version worth a map:** `POST /api/environments/:id/messaging/emails` behind a PSAK `messaging:write` scope, taking `to`, `template` (id + variables) or raw `subject`/`html`/`text`, `from` sender, `category`, and an `Idempotency-Key` header; it returns a message id; `GET .../messaging/emails/:id` returns status from the events the pipeline already emits.
Thin wrappers in posthog-node and posthog-python (`posthog.messaging.send(...)`) come in the same map.
Attachments, batch, scheduling and SMTP are later maps.

## How the webhook trigger works today

| Step          | What the code does                                                                                                                                           | Where                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Route         | `POST` and `GET /public/webhooks/:webhook_id`, unauthenticated at the router; body capped at 512,000 bytes (413 above)                                       | `nodejs/src/cdp/cdp-api.ts` (public routes block)                                                                |
| Lookup        | The id is a workflow (HogFlow) id. The flow must be `active` with a `webhook`, `manual` or `tracking_pixel` trigger, else 404 `{"error":"Not found"}`        | `CdpSourceWebhooksConsumer.getWebhook` in `nodejs/src/cdp/consumers/cdp-source-webhooks.consumer.ts`             |
| Auth          | Optional `auth_header` input on the trigger. When set, the `Authorization` header must equal it exactly, else 401 with a plain-text `Unauthorized` body      | `nodejs/src/cdp/templates/_sources/webhook/incoming_webhook.template.ts`                                         |
| Mapping       | Trigger inputs map the request to an event name, a `distinct_id` (required, 400 if empty) and properties. The event is trigger data only, it is not captured | same template; `executeHogFlow` in the consumer                                                                  |
| Enqueue       | A HogFlow invocation is queued on cyclotron; the response is `201 {"status":"queued"}`. The invocation id is generated server side and not returned          | `executeHogFlow`; `handleWebhook` in `cdp-api.ts`                                                                |
| Disabled flow | 429 `{"error":"Disabled"}` when the hog watcher disabled the flow                                                                                            | `processWebhook`                                                                                                 |
| Send          | The email step is the `template-email` hog function calling `sendEmail(inputs.email)`, Liquid templating on the inputs                                       | `nodejs/src/cdp/templates/_destinations/email/email.template.ts`, `nodejs/src/cdp/async-functions/send-email.ts` |
| Payload       | `to` is one `{email, name}`; `cc`/`bcc`/`replyTo` are strings; `subject`, `preheader`, `text`, `html`. No attachments, no custom headers, no tags            | `CyclotronInvocationQueueParametersEmailSchema` in `nodejs/src/cdp/schema/cyclotron.ts`                          |
| Delivery      | SES `SendEmail`; the SES `MessageId` is checked for presence and then dropped                                                                                | `sendEmailWithSES` in `nodejs/src/cdp/services/messaging/email.service.ts`                                       |

Things the send path already does well, all at the `executeSendEmail` choke point:

- Team suspension and per-workflow pause gates, with clear log lines.
- Sender must be a verified email integration of the same team; a templated `from` override must stay on the verified domain.
- Suppression across `to`/`cc`/`bcc` (bounces and complaints), applied even to transactional mail.
- `message_category_type === 'transactional'` skips opt-out checks (`recipient-preferences.service.ts`), drops `List-Unsubscribe` headers, and routes to the fast priority lane (`email-priority.ts`).
- Per-workflow and per-team pacing that delays, never drops; SES throttles reschedule instead of failing.
- SES tenant per team (`team-<id>`), so reputation is tracked per project.
- Tracking: signed tracking header, SES webhook at `/public/m/ses_webhook` turns delivery, open, click and bounce into app metrics and `$workflows_email_*` events (`email-tracking.service.ts`).
- Sent-email assets (rendered body) captured to ClickHouse (`message-assets.service.ts`).
- A per-invocation result endpoint already exists for the UI: `GET /api/projects/:id/hog_flows/:id/invocation_results/:invocation_id` (`products/workflows/backend/presentation/views/hog_flow.py`).

Templates: `MessageTemplate` (`products/messaging/backend/models/message_template.py`) stores `content` with Liquid or Hog templating.
The email editor **copies** a template's content into the step when you apply it (`applyTemplate` in `frontend/src/scenes/hog-functions/email-templater/emailTemplaterLogic.tsx`).
Nothing resolves a template by id at send time.

Categories: `MessageCategory` has a `key` unique per team and a `category_type` of `marketing` or `transactional` (`products/messaging/backend/models/message_category.py`).
Its viewset is `scope_object = "INTERNAL"` (`products/messaging/backend/api/message_categories.py`), so it is not reachable with API keys today.

Dedup: workflows have `trigger_masking` (fire once per hash per TTL), but the masker runs in the event invocation pipeline (`hog-function-invocation-pipeline.service.ts`).
As read, the webhook consumer queues straight to cyclotron and does not apply it.

## Comparison

| Dimension                  | PostHog webhook trigger today                                                                                  | Resend `POST /emails`                                                                                                                                                                                                   | Postmark `POST /email`                                                                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                       | Per-workflow optional shared `Authorization` value; URL is the workflow id                                     | `Authorization: Bearer re_...`; keys are `full_access` or `sending_access`, a sending key can be pinned to one domain                                                                                                   | `X-Postmark-Server-Token` (server-level token)                                                                                                                                                                             |
| Endpoint unit              | One URL per workflow                                                                                           | One endpoint per account                                                                                                                                                                                                | One endpoint per server; `MessageStream` separates transactional and broadcast                                                                                                                                             |
| Idempotency                | None                                                                                                           | `Idempotency-Key` header, 1 to 256 chars, 24 h; same payload returns the original id, different payload is 409 `invalid_idempotent_request`, in-flight duplicate is 409 `concurrent_idempotent_requests`; also on batch | None documented                                                                                                                                                                                                            |
| Response                   | `201 {"status":"queued"}`                                                                                      | `{"id": "<uuid>"}`                                                                                                                                                                                                      | `{To, SubmittedAt, MessageID, ErrorCode, Message}`                                                                                                                                                                         |
| Status lookup              | Only by workflow + invocation id in the UI API; the caller never learns the id                                 | `GET /emails/:id` with `last_event` (`queued`, `scheduled`, `sent`, `delivered`, `delivery_delayed`, `bounced`, `complained`, `opened`, `clicked`, `failed`, `suppressed`, `canceled`)                                  | `GET /messages/outbound/:id/details` with `Status` and `MessageEvents` (`Delivered`, `Transient`, `Bounced`, `Opened`, `LinkClicked`, `SubscriptionChanged`); search by recipient, tag, metadata; 45-day default retention |
| Templates                  | Content copied into the workflow step; Liquid variables from the trigger event                                 | `template: {id, variables}` on send; missing variable is a validation error; cannot mix with `html`/`text`                                                                                                              | `POST /email/withTemplate` with `TemplateId` or `TemplateAlias` and `TemplateModel`; layouts; `/templates/validate`                                                                                                        |
| Recipients                 | One `to`, `cc`/`bcc` strings                                                                                   | `to` up to 50                                                                                                                                                                                                           | 50 across To/Cc/Bcc                                                                                                                                                                                                        |
| Attachments                | None                                                                                                           | `attachments[]` with `content` or `path`, `filename`, `content_type`, `content_id` (inline); 40 MB per email after Base64                                                                                               | `Attachments[]` with `Name`, `Content`, `ContentType`, `ContentID`; 10 MB per message                                                                                                                                      |
| Metadata                   | Trigger properties                                                                                             | `tags[]` name/value, custom `headers`                                                                                                                                                                                   | `Tag`, `Metadata`, `Headers`                                                                                                                                                                                               |
| Scheduling                 | Via workflow delay steps                                                                                       | `scheduled_at`                                                                                                                                                                                                          | None on send                                                                                                                                                                                                               |
| Batch                      | Workflow batch triggers (UI)                                                                                   | `POST /emails/batch`                                                                                                                                                                                                    | `POST /email/batch` up to 500, per-message `ErrorCode`                                                                                                                                                                     |
| Error shape                | Mixed: `{"error": ...}`, `{"status": ...}`, plain text, template-defined bodies                                | Typed errors (`validation_error`, `missing_api_key`, `rate_limit_exceeded`, `daily_quota_exceeded`, `invalid_idempotency_key`, ...) with status and message                                                             | `{ErrorCode, Message}` plus `X-PM-ApiErrorCode` header; 401/422/429/500/503                                                                                                                                                |
| Rate limits                | Pacing happens after enqueue (send is delayed, caller is never told); no caller-facing limit read in this path | 10 requests/s per team by default, 429 `rate_limit_exceeded`; daily and monthly quota errors                                                                                                                            | 429 on excessive use, no numbers published on the overview                                                                                                                                                                 |
| Before domain verification | No email leaves before DNS is verified (finding of [#211](https://github.com/Silthus/posthog/issues/211))      | Without a domain you can send only to your own address, from the shared `resend.dev` test domain                                                                                                                        | Account pending approval: recipients must share the From domain (error 412)                                                                                                                                                |
| Test recipients            | Editor "Run test" path (`isTest`)                                                                              | `delivered@`, `bounced@`, `complained@`, `suppressed@resend.dev` simulate outcomes                                                                                                                                      | Sandbox servers (not read in depth)                                                                                                                                                                                        |

## Gap list

Ordered by how much an engineer feels it on the first integration (best guess, no usage data yet).

1. **No project-level send endpoint.** Every message type needs its own workflow and URL. Engineers expect one endpoint and a key.
2. **No project API key auth.** The trigger uses a per-workflow shared header. PSAKs fit exactly: project scoped, user-less, `Bearer phs_...`, default-deny `psak_allowed_actions`, PSAK-aware per-key and per-team throttles (`.agents/skills/adding-project-secret-api-key-auth/SKILL.md`). `PROJECT_SECRET_API_KEY_ALLOWED_API_SCOPE_ACTION` in `posthog/scopes.py` already has write precedents (`loop:write`, `account:write`, `offline_evaluation_ingestion:write`). A send scope needs a new entry, mirrored in `frontend/src/lib/scopes.tsx`.
3. **No message id in the response.** The invocation id exists but is not returned, and the SES `MessageId` is dropped.
4. **No status lookup by message id.** The data exists (app metrics, `$workflows_email_*` events, invocation results, assets) but is keyed for the workflow UI, not for a caller.
5. **No idempotency.** A retried `POST` sends twice. Password reset and receipts are exactly the retry-heavy calls.
6. **No template by reference.** `MessageTemplate` exists, but send time never resolves it, and there is no stable key or alias (templates have `name`, not a unique key). Missing variables are not validated before send.
7. **Inconsistent, partly unhelpful errors.** Most send-time failures (unverified sender, suppressed, paused, quota) happen after the `201`, so the caller only sees them in workflow logs.
8. **No attachments.** Invoices and receipts need them. SES `Simple` content in the current call has no attachment support; it needs SES v2 `Raw` or `Simple.Attachments` (not checked which the pinned SDK supports; **guess** that this is a contained change in `sendEmailWithSES`).
9. **One `to` recipient, no tags/metadata/custom headers** on the send.
10. **No server SDK surface.** posthog-node and posthog-python have no messaging namespace (the SDK repos are outside this repo; **guess** from the absence of any client in this repo).
11. **Categories are internal-only by API.** A caller cannot pass `category: "password-reset"` and have the right transactional rules apply without a workflow step carrying `message_category_id`.
12. **No sandbox sends before DNS** (owned by [#211](https://github.com/Silthus/posthog/issues/211) findings and the email domain wizard, out of scope here, but it decides whether a send API activates anyone in the first hour).

Security note, ask Michael: the auth and rate limiting of the public webhook route deserve a private look before a send API copies its shape.

## What `posthog.messaging.send(...)` could look like

**Guess**, a proposal shape only.

```ts
// posthog-node
const { id } = await posthog.messaging.send(
  {
    to: { email: 'ada@example.com', name: 'Ada' },
    template: { key: 'password-reset', variables: { reset_url: url } },
    category: 'account-security', // a transactional MessageCategory key
    distinctId: user.id, // optional, links engagement events to the person
  },
  { idempotencyKey: `reset/${token.id}` }
)
const message = await posthog.messaging.get(id) // { id, status, events: [...] }
```

```python
# posthog-python
message = posthog.messaging.send(
    to={"email": "ada@example.com"},
    template={"key": "password-reset", "variables": {"reset_url": url}},
    category="account-security",
    idempotency_key=f"reset/{token.id}",
)
```

Over HTTP: `POST /api/environments/:id/messaging/emails`, `Authorization: Bearer phs_...`, `Idempotency-Key: ...`, answering `202 {"id": "...", "status": "queued"}`.
Validation errors that can be known up front answer 4xx synchronously: unknown template or category, missing template variable, unverified or foreign sender, suppressed recipient, team suspended.

What it reuses:

| Need             | Reuse                                                                                                                                                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth, throttling | PSAK auth, `PersonalOrProjectSecretApiKeyRateThrottle` + `ProjectSecretApiKeyTeamRateThrottle`                                                                                                                                                                                                     |
| Sender           | Existing email integrations; `resolveFromSender` domain check                                                                                                                                                                                                                                      |
| Templates        | `MessageTemplate.content` with Liquid; needs a stable `key` and send-time resolution                                                                                                                                                                                                               |
| Rules            | `MessageCategory` (`transactional` skips opt-outs and unsubscribe headers), suppression, preferences                                                                                                                                                                                               |
| Delivery         | Queue a synthetic email invocation into the same cyclotron email queue, so `executeSendEmail` stays the single choke point (**guess** at the cleanest seam: Django handles auth and validation, then calls a CDP API route, the same way `generate_preferences_token` is served from `cdp-api.ts`) |
| Status           | Invocation results + SES tracking metrics + `$workflows_email_*` events, keyed by the returned id                                                                                                                                                                                                  |
| Content view     | Message assets                                                                                                                                                                                                                                                                                     |

The send needs a home for metrics and logs that today hang off a workflow id (`app_source_id`).
**Guess:** one hidden, per-project "API sends" source, so the metrics, logs and Reputation views keep working without a new storage path.
This is the main design decision for the map.

## Growth loops Resend uses, and fit for PostHog

From Resend's public docs index and integration pages:

| Loop                     | What Resend does                                                                                                                                                            | Fit for PostHog                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting marketplace      | Vercel Marketplace integration creates a Resend account, provisions an API key, auto-configures DNS on a Vercel domain, bills through Vercel; v0 gets the key as an env var | Medium. **Guess:** PostHog may already list on the Vercel Marketplace for analytics (not checked). Auto DNS on a Vercel-bought domain would directly attack "no email before DNS". Later map. |
| App builders             | Guides for Lovable, Bolt, v0, Replit; Lovable is prompt-driven: the user pastes a key and the builder writes the code                                                       | High once a send API and SDK exist. It is a docs and prompt-recipe job, cheap. PostHog is often already installed in these apps for analytics, so the key is one step away.                   |
| Shared onboarding sender | Without a verified domain you can send to your own address from the `resend.dev` test domain                                                                                | High for activation, but it is the #211 "send before DNS" bet, not this one. A send API should accept the same sandbox when it exists.                                                        |
| Test recipients          | `delivered@`, `bounced@`, `complained@`, `suppressed@resend.dev` simulate outcomes                                                                                          | Medium. Cheap way to let engineers test status lookup and webhooks without hurting the shared SES reputation.                                                                                 |
| SMTP relay               | SMTP guides for Supabase auth, NextAuth, Django, Rails, WordPress, Customer.io and more                                                                                     | Medium. Opens auth-email use cases (Supabase, NextAuth) with zero code, but needs an SMTP ingress service. Separate map.                                                                      |
| MCP server               | Resend MCP server for agents                                                                                                                                                | High fit, low cost: PostHog MCP tools are generated from the OpenAPI spec, so a PSAK-capable send endpoint gets an MCP tool almost for free.                                                  |
| Auth providers           | Auth0 custom email provider guide                                                                                                                                           | Low for now; follows SMTP.                                                                                                                                                                    |
| Partner listing          | PostHog itself appears in Resend's integrations list                                                                                                                        | Note only.                                                                                                                                                                                    |

Best fit for the map's first audience (engineering-led teams already on PostHog): the SDK method plus app-builder recipes plus the MCP tool.
Marketplace and SMTP are bigger and belong to later maps.

## The smallest version worth a map

A map whose destination is: **an engineer on a team already using PostHog sends their first transactional email from backend code with a project key, gets an id back, and sees it delivered.**

In:

- `POST /api/environments/:id/messaging/emails` and `GET .../messaging/emails/:id`, PSAK scope for send (new scope object, write) and read.
- Template by key with variables, validated before enqueue; raw `subject`/`html`/`text` as the alternative.
- `Idempotency-Key` with Resend-like semantics (24 h, same payload returns the same id, different payload 409).
- Category by key; transactional rules reuse the existing paths.
- One error shape for synchronous validation failures; async failures visible on `GET`.
- posthog-node and posthog-python `messaging.send` / `messaging.get`.
- A home for API-send metrics, logs and assets (the hidden source decision above).
- Docs and an MCP tool, generated from the endpoint.

Out (later maps): attachments, batch, multiple `to`, `scheduled_at`, SMTP relay, Vercel marketplace, outbound delivery webhooks to the caller, SMS and push on the same API.

First decisions that map faces:

1. Where API sends live in the data model: hidden per-project source vs a new first-class "message" record. One-way-ish, it shapes metrics and billing attribution.
2. Whether template keys are new (`MessageTemplate.key`, unique per team) or reuse ids. New field is the friendlier API.
3. Whether the endpoint is served by Django (auth, OpenAPI, MCP codegen for free) with the CDP API doing the send, or by the CDP API directly.
4. How API sends count against plan and quota, recommendations only per the map's scope.

## Sources

Code (repo-relative, `master`):

- `nodejs/src/cdp/cdp-api.ts`
- `nodejs/src/cdp/consumers/cdp-source-webhooks.consumer.ts`
- `nodejs/src/cdp/templates/_sources/webhook/incoming_webhook.template.ts`
- `nodejs/src/cdp/templates/_destinations/email/email.template.ts`
- `nodejs/src/cdp/async-functions/send-email.ts`
- `nodejs/src/cdp/schema/cyclotron.ts`
- `nodejs/src/cdp/schema/hogflow.ts`
- `nodejs/src/cdp/services/hogflows/hogflow-functions.service.ts`
- `nodejs/src/cdp/services/hog-function-invocation-pipeline.service.ts`
- `nodejs/src/cdp/services/messaging/email.service.ts`
- `nodejs/src/cdp/services/messaging/email-priority.ts`
- `nodejs/src/cdp/services/messaging/email-tracking.service.ts`
- `nodejs/src/cdp/services/messaging/message-assets.service.ts`
- `nodejs/src/cdp/services/messaging/recipient-preferences.service.ts`
- `products/messaging/backend/models/message_template.py`
- `products/messaging/backend/models/message_category.py`
- `products/messaging/backend/api/message_categories.py`
- `products/messaging/backend/api/message_templates.py`
- `products/workflows/backend/presentation/views/hog_flow.py`
- `products/workflows/frontend/Workflows/hogflows/steps/StepTrigger.tsx`
- `frontend/src/scenes/hog-functions/email-templater/emailTemplaterLogic.tsx`
- `posthog/scopes.py`
- `.agents/skills/adding-project-secret-api-key-auth/SKILL.md`

Resend docs:

- [Send email](https://resend.com/docs/api-reference/emails/send-email)
- [Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Errors](https://resend.com/docs/api-reference/errors)
- [API introduction (rate limit)](https://resend.com/docs/api-reference/introduction)
- [Create API key (permissions, domain scope)](https://resend.com/docs/api-reference/api-keys/create-api-key)
- [Retrieve email](https://resend.com/docs/api-reference/emails/retrieve-email)
- [Manage emails (event types)](https://resend.com/docs/dashboard/emails/manage-emails)
- [Test email addresses](https://resend.com/docs/dashboard/emails/send-test-emails)
- [Vercel Marketplace integration](https://resend.com/docs/guides/vercel-marketplace-integration)
- [Lovable integration](https://resend.com/docs/lovable-integration)
- [Docs index (integrations, SMTP, MCP)](https://resend.com/docs/llms.txt)

Postmark docs:

- [Email API](https://postmarkapp.com/developer/api/email-api)
- [Templates API](https://postmarkapp.com/developer/api/templates-api)
- [Messages API](https://postmarkapp.com/developer/api/messages-api)
- [API overview (errors)](https://postmarkapp.com/developer/api/overview)
