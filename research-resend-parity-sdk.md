# What does a switch from Resend to PostHog need from `posthog-node` and a skill?

Research for [Silthus/posthog#522](https://github.com/Silthus/posthog/issues/522), part of the map [#461](https://github.com/Silthus/posthog/issues/461).
Evidence, all read on 2026-10-20:

- `resend/resend-node` at `794310314b0d` (v6.34.1), `resend/react-email` at `e0561e164e9c` (`@react-email/render` 2.1.1, `react-email` 6.11.3), `resend/resend-skills` at `b2ae7b1798b7`.
  File and line references below point into those clones.
- Resend's public docs, quoted where a page said it.
- The posthog-node draft [PostHog/posthog-js#5312](https://github.com/PostHog/posthog-js/pull/5312), branch `feat/node-emails-send` on the Silthus fork, head `87e9e95c`.
  References read `emails.ts:N` for `packages/node/src/emails.ts`.
- `upstream/master` of PostHog/posthog at `2099bfc9e6f`.
- One local render probe of `@react-email/render` (section 2).

No usage, revenue or customer data went into this file.
Guesses are marked **(guess)**.
Things I could not verify are marked **(unverified)**.

## Short answer

A Resend call site is `resend.emails.send({ from, to, subject, react | html | text, ...extras }, { idempotencyKey })` returning `{ data: { id }, error: { name, message, statusCode } }`.
[#5312](https://github.com/PostHog/posthog-js/pull/5312) shares the return shape (`{ data, error }`, `data.id`) and the never-throws rule.
Its **input** is different: `{ template, to, data, distinctId }`.
It has no `from`, `subject`, `html`, `text`, `react`, `replyTo` or idempotency key (`emails.ts:33-42`).
So today a Resend call site is a **rewrite**, not a mechanical edit, for every call that passes content inline.
In a public-code sample, `html:` and `react:` are the most common content fields, so most call sites are inline-content calls (section 1, ordinal counts).

Three findings decide the shape of the parity work:

1. **Inline content is the gap that matters, and it conflicts with the current backend.** The upstream send API only sends a stored template by id (`POST /messaging_templates/{id}/send/`, `message_templates.py:614`; the body has `to`, `identifiers`, `message_data` only, `message_templates.py:289-300`).
   The map's re-chart of 2026-10-16 dropped the inline-content call shape.
   A mechanical `react:` rewrite needs it back, or a skill that converts React Email components into stored templates.
2. **React Email can render once into a stored template only for substitution-only templates.** I ran it: `{{ variables.x }}` placeholders survive in text, `href` and preview text.
   Quotes inside Liquid expressions get HTML-escaped, and JS conditionals, loops and formatting run at render time and cannot become Liquid.
   Resend's own hosted templates have the same limit ("Plain substitution only", `resend-skills/skills/resend/references/templates.md`).
   Every provider I checked treats React Email as a **send-time renderer**, not a template format.
3. **Resend's per-domain key is `sending_access` + `domain_id`; PostHog's `phs_` key has scopes only.** Resend's docs never prescribe a staging/production split.
   The closest advice is the narrowest scope, one key per service, and one domain per key.
   PostHog has no sender field on a key (`project_secret_api_key.py:52`), and the sender is fixed per template (`transactional_email.py:59-68`).

**Smallest `posthog-node` addition list (section 5):** `from` (checked against verified senders), `subject` + `html`/`text` inline content (needs a backend decision), `to` as an array, `replyTo`, `idempotencyKey` as a second argument, and `error.name` as an alias of `error.code`.
Everything else (`cc`, `bcc`, `attachments`, `tags`, `scheduledAt`, `headers`, `batch`) stays out.
The type must reject it at compile time, and the skill reports each such call site for a human.

## 1. Resend's send surface

### The call

`Emails.send` is an alias of `create` (`emails.ts:52-76`).
`create` does two things: it renders `react` to `html` with `render()` (lines 65-67), then POSTs `/emails` with the camelCase fields mapped to snake_case (`parse-email-to-api-options.ts:19-43`).

The payload type is a union (`create-email-options.interface.ts:111-119`): either `html`/`text`/`react` (at least one) with `from` and `subject`, or a `template` with `react`/`html`/`text` forbidden.

| Field         | Type in resend-node                                                                                                                  | Source                                    | In #5312?                                                                                                   | Distance                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `from`        | `string`, required, `"Name <a@b.c>"`                                                                                                 | `create-email-options.interface.ts:65`    | No. The sender is the template's sender.                                                                    | New field. Needs backend.                                                                                                                               |
| `to`          | `string \| string[]`, max 50                                                                                                         | `:95`, send-email docs                    | `to: string` only (`emails.ts:36`). Upstream `to` is one `EmailField` (`message_templates.py:290`).         | Same name. Array needs backend.                                                                                                                         |
| `subject`     | `string`, required unless `template`                                                                                                 | `:83`                                     | No. The subject comes from the template (draft: the file's `<title>`, `email-template-file.ts:18-22`).      | New field. Needs inline content.                                                                                                                        |
| `html`        | `string`                                                                                                                             | `:19`                                     | No                                                                                                          | New field. Needs inline content.                                                                                                                        |
| `text`        | `string`. If omitted, Resend generates it from the HTML ("If not provided, the HTML will be used to generate a plain text version"). | `:25`, send-email docs                    | No. A template file has no text part (`email-template-file.ts:1`).                                          | New field. I found no plain-text generation in `products/messaging/backend` or `nodejs/src/cdp/services/messaging` **(unverified beyond those paths)**. |
| `react`       | `React.ReactNode`, Node SDK only                                                                                                     | `:13`, `emails.ts:65-67`                  | No                                                                                                          | New. See section 2.                                                                                                                                     |
| `replyTo`     | `string \| string[]`                                                                                                                 | `:77`                                     | No                                                                                                          | Same name wanted. Needs backend.                                                                                                                        |
| `cc`, `bcc`   | `string \| string[]`                                                                                                                 | `:53,59`                                  | No                                                                                                          | Out.                                                                                                                                                    |
| `headers`     | `Record<string,string>`                                                                                                              | `:71`                                     | No                                                                                                          | Out (guess: `List-Unsubscribe` and similar belong to the platform).                                                                                     |
| `tags`        | `{name, value}[]`, ASCII `[A-Za-z0-9_-]`, max 256 chars each                                                                         | `:89,148-157`                             | No. Closest is `distinctId` (`emails.ts:40-41`), which attributes the send.                                 | Out. Map tags to `data`/events by hand.                                                                                                                 |
| `attachments` | `{content, filename, path, contentType, contentId}[]`, max 40 MB                                                                     | `:47,132-146`                             | No                                                                                                          | Out.                                                                                                                                                    |
| `scheduledAt` | ISO 8601 or natural language                                                                                                         | `:108`                                    | No                                                                                                          | Out.                                                                                                                                                    |
| `topicId`     | `string \| null`                                                                                                                     | `:101`                                    | No                                                                                                          | Out. PostHog has message categories.                                                                                                                    |
| `template`    | `{ id, variables?: Record<string, string \| number> }`                                                                               | `create-email-options.interface.ts:28-33` | Similar idea: `template: string \| EmailTemplateFile`, `data: Record<string, unknown>` (`emails.ts:34-39`). | Different nesting: `template: {id, variables}` vs `template` + `data`.                                                                                  |

### Typical usage

I sampled public TypeScript code with GitHub code search (`resend.emails.send <field>`).
The counts are noisy because a multi-term query matches files, not adjacent text, so read them as an order only:

| Field                      | Count | Order                                             |
| -------------------------- | ----- | ------------------------------------------------- |
| `resend.emails.send` (any) | ~92k  | all                                               |
| `html:`                    | ~61k  | very common                                       |
| `text:`                    | ~29k  | common                                            |
| `headers:`                 | ~17k  | inflated by unrelated `headers:` in the same file |
| `react:`                   | ~16k  | common                                            |
| `replyTo`                  | ~24k  | common                                            |
| `attachments`              | ~5k   | occasional                                        |
| `tags`                     | ~3k   | occasional                                        |
| `template:`                | ~2.7k | occasional                                        |
| `cc:`                      | ~2k   | rare                                              |
| `idempotencyKey`           | ~1.8k | rare                                              |
| `resend.batch.send`        | ~1.4k | rare                                              |
| `scheduledAt`              | ~0.8k | rare                                              |

Reading: nearly every call site has `from`, `to`, `subject` and either `html` or `react`.
`replyTo` and `text` are common extras.
Attachments, tags, hosted templates, `cc`, idempotency keys, batch and scheduling are each a small slice **(guess: well under a tenth of call sites each)**.

### Return value and errors

Resend never throws for an API failure:

```ts
{ data: { id }, error: null, headers } | { data: null, error: { message, statusCode, name }, headers }
```

(`interfaces.ts:24-38`, `resend.ts` `fetchRequest`, about lines 119-215.) The constructor does throw when there is no key (`resend.ts` about line 89, "Missing API key").

`ErrorResponse.name` is one of 21 names in `RESEND_ERROR_CODE_KEY` (`interfaces.ts:1-22`).
The [errors page](https://resend.com/docs/api-reference/errors) lists the HTTP status for each.
The ones a call site can branch on:

| Resend `name`                                                       | HTTP          | Nearest PostHog today                                                |
| ------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------- |
| `validation_error`                                                  | 400, 401, 403 | `invalid` and `invalid_recipient` (400), `contracts.py:38,62`        |
| `missing_api_key`                                                   | 401           | draft `missing_secret_key` (`emails.ts:255`), no request made        |
| `restricted_api_key`                                                | 401, 403      | none yet (scope check)                                               |
| `invalid_idempotency_key`                                           | 400           | none                                                                 |
| `concurrent_idempotent_requests`, `invalid_idempotent_request`      | 409           | none                                                                 |
| `not_found`                                                         | 404           | draft `template_not_found`                                           |
| `missing_required_field`, `invalid_parameter`, `invalid_attachment` | 422           | `invalid` (400)                                                      |
| `rate_limit_exceeded`                                               | 429           | throttle scopes (`message_templates.py:335-352`)                     |
| `daily_quota_exceeded`, `monthly_quota_exceeded`                    | 429           | `quota_limited` (429, `contracts.py:66`, `message_templates.py:319`) |
| `application_error`                                                 | 500           | draft `api_error` / `unexpected_error`                               |
| `service_unavailable`                                               | 503           | `DeliveryUnavailable` -> 503 (`message_templates.py:328-329`)        |

The shapes differ in one place that matters: Resend's field is `error.name`; the draft's is `error.code` (`emails.ts:51-65`).
Same `message` and `statusCode`.
A cheap alias (`name` = `code`) keeps `if (error.name === 'rate_limit_exceeded')` call sites compiling.
The code values differ, so a branch on a Resend name would need rewriting anyway (guess: few call sites branch on names; most log `error.message`).

The success contract differs by one word: Resend `data.id`; PostHog's API answers `message_id` (`message_templates.py:312-315`), which the draft maps to `data.id` (`emails.ts:321-324`) and adds `warnings`.

### Idempotency

`send(payload, { idempotencyKey })` sets the `Idempotency-Key` header (`idempotent-request.interface.ts:1-8`, `resend.ts` lines 240-241).
Facts from the [send-email page](https://resend.com/docs/api-reference/emails/send-email): unique per request, kept 24 hours, 1-256 characters.
Same key and same body returns the first answer; a different body returns 409 (`resend-skills/skills/resend/SKILL.md`, "Idempotency Keys").
Resend's own convention is `<event-type>/<entity-id>` such as `welcome-email/user-123`.

# 5312 has none: "A send is not idempotent, so two calls send two emails. The SDK never retries a send that may have queued" (`emails.ts:116-117`), and a server error is never retried (`emails.ts:393-399`, `client.ts` `_requestWithSecretKey`, `retryCount: 0`). The backend already marks one failure as retry-safe: `DeliveryUnavailable` "did not accept the send. Safe to retry" (`contracts.py:69-70`). A key would let the SDK retry the 503 and a network error. This is the behavior Resend call sites assume when they pass a key.

### Batch

`resend.batch.send(emails[])` posts `/emails/batch` (`batch.ts:22-55`), up to 100 emails, no attachments (`create-batch-options.interface.ts:16-26`), no scheduling per the skill.
It renders each `react` first (`batch.ts:31-34`) and sends `x-batch-validation: strict` by default (`batch.ts:39-41`).
It returns `{ data: [{ id }, ...] }`.
Strict mode fails the whole batch if one email is invalid ("Batch is atomic", `resend-skills/skills/resend/SKILL.md`).
Batch is about 1.5% of the send-call count in the sample.
A loop of `emails.send` calls with keys (`welcome/${id}`) is an acceptable rewrite for a skill to emit.

### Hosted templates

Resend: create a template (HTML or React Email upload), declare variables, publish, then `send({ template: { id, variables } })`.

- Variable syntax: triple mustache `{{{NAME}}}` in HTML and subject; keys `[A-Za-z0-9_]`, up to 50 per template and 50 characters per key; string or number values (strings up to 2,000 characters) ([template variables](https://resend.com/docs/dashboard/templates/template-variables), [send-email](https://resend.com/docs/api-reference/emails/send-email)).
- Reserved: `FIRST_NAME`, `LAST_NAME`, `EMAIL`, `UNSUBSCRIBE_URL` (send-email page), plus `contact` and `this` (variables page).
- A missing variable without a fallback fails the send with a validation error.
- A draft cannot send; only a published version does ([create template](https://resend.com/docs/dashboard/templates/create-template)).
- `html`, `text` and `react` cannot go with a `template`; `from`, `subject` and `reply_to` in the payload override the template's defaults.
- No control flow: "Plain substitution only — no `{{#each}}`, `{{#if}}`" (`resend-skills/skills/resend/references/templates.md`).

PostHog's stored template is a Liquid template with `{{ variables.* }}` and the draft's `data` (`emails.ts:38`; `message_templates.py:298-299`).
Liquid has control flow (`nodejs/src/cdp/utils/liquid.ts`, liquidjs), so a Resend hosted template converts mechanically only by rewriting `{{{NAME}}}` to `{{ variables.name }}`.
Casing matters: Resend variable keys are case-sensitive and often upper-case.

## 2. React Email

### How Resend renders `react`

- **In the SDK, on the caller's machine, at every send.** `create` calls `render(payload.react)` before the HTTP call (`emails.ts:65-67`).
  The server never sees React.
- `render.ts:1-12` does a dynamic `import('@react-email/render')` and throws "Failed to render React component.
  Make sure to install `@react-email/render` or `@react-email/components`" if it is missing.
  The package is an **optional peer** of `resend` (`package.json:59-66`, `"@react-email/render": "*"`, `optional: true`).
- `@react-email/render` 2.1.1 has peers `react` and `react-dom` at `^18.0 || ^19.0` and depends on `html-to-text`, `html5parser`, `prettier` and `entities` (`packages/render/package.json:121-130`).
  The `react-email` meta package re-exports it (`packages/react-email/src/index.ts:1`) and the current docs import from `react-email`.
  `resend` still imports `@react-email/render` by name.
  A project with only `react-email` installed relies on hoisting **(guess; untested under pnpm's strict layout)**.
  A posthog-node copy of this pattern should import `@react-email/render`, as resend-node does.
- The docs tell Resend users to call the component as a function: `react: WelcomeEmail({ name: 'John' })` ([send with Node.js](https://resend.com/docs/send-with-nodejs)).
  The skill samples use JSX (`resend/react-email/skills/react-email/references/SENDING.md`).

### What `render()` and `toPlainText` produce

- `render(node, options?)` returns a Promise of a string: the XHTML 1.0 Transitional doctype followed by the markup (`packages/render/src/node/render.tsx:79-82`).
  Options: `pretty`, and `plainText` (`shared/options.ts:6-42`).
- `plainText: true` returns `toPlainText(html)` instead (`render.tsx:73-77`).
  `toPlainText` is `html-to-text` with `wordwrap: false`, skipping `img` and anything with `data-skip-in-text="true"`, and printing links as `text url` (`shared/utils/to-plain-text.ts:7-23`).
  The `Preview` component carries `data-skip-in-text`, so preheader text drops out of the plain version.
- **The Resend SDK does not call `toPlainText`.** It only renders HTML.
  The plain-text part comes from the Resend API, which builds it from the HTML when `text` is missing.
  The react-email skill says "The Node SDK automatically handles the plain-text rendering", which is right in effect but done server-side.
- For PostHog this matters.
  The upstream send path uses `email.text or ""` (`transactional_email.py:67`).
  Without a text part generated somewhere, a `react:` rewrite ships HTML-only mail.
  The SDK can compute it with `render(node, { plainText: true })`, or the backend can generate it.

### Can one render become a stored template with `{{ variables.* }}`?

Yes for substitution, no for logic.
I rendered a component with each prop set to a Liquid placeholder string (`@react-email/render` 2.1.1, react 19.3.1, run 2026-10-20 in a scratch directory):

| Case                                                                                             | Result in the rendered HTML                                                             |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `{{ variables.name }}` as text child, `Preview` text, `href` of `Button` and `Link`, a list item | Kept verbatim. Plain text keeps them too (`Hi {{ variables.name }},`).                  |
| `{{ variables.url }}?a=1&b={{ variables.b }}` in an `href`                                       | Kept; `&` becomes `&amp;` (valid HTML, harmless).                                       |
| `{{ variables.name \| default: "there" }}`                                                       | **Broken:** the quotes become `&quot;`, so Liquid sees `default: &quot;there&quot;`.    |
| `{% if variables.vip == "yes" %}VIP{% endif %}`                                                  | **Broken:** `&quot;` inside the tag.                                                    |
| `{{ variables.x \| default: 'a' }}`                                                              | **Broken:** `&#x27;a&#x27;`.                                                            |
| A JS ternary `premium ? A : B` in the component                                                  | Only the chosen branch is in the HTML. No `{% if %}` is emitted.                        |
| `items.map(...)`                                                                                 | Renders one `<li>` per array entry at render time. A stored template needs `{% for %}`. |

Where it breaks:

- **Conditionals and loops** in the component run in JS against the props you passed, so they are decided at render time.
  A stored template needs Liquid control flow around markup.
  React Email has no raw-HTML component in this release (components: body, button, code-block, code-inline, column, container, font, head, heading, hr, html, img, link, markdown, preview, row, section, tailwind, text; `packages/react-email/src/components`).
  `dangerouslySetInnerHTML` adds a wrapper element, which can break table structure **(unverified)**.
- **Quotes** in any Liquid expression get escaped (above).
  Only `{{ variables.x }}` with no string literal survives.
  Workable only if filter arguments avoid quotes.
- **Formatting of props**: `price.toFixed(2)`, `date.toLocaleDateString()`, pluralization and string concatenation operate on the placeholder string, not the value.
  The Liquid equivalents (`| round`, `| date`) must be written as Liquid, with the quote limit above.
- **Typed props**: a component that reads `props.items.length` or an object shape cannot take a placeholder string.
- Outside the template, nothing else breaks: `Tailwind` inline styles and components that only place text and attributes render fine **(guess; only the listed components were run)**.

A workable pattern is a "variables proxy": a `variables` object whose every property returns the string `{{ variables.<key> }}`, and a rule that the component only places values, never branches on them **(guess; not built)**.
That is the same constraint as Resend's hosted templates.

So the answer to "render once or every send" is: **per send** gives Resend's exact semantics and no constraints, but needs inline content on the send endpoint.
**Render once** gives a stored, editable, code-managed template, and works only for substitution-only emails.

### How other providers handle React Email

| Provider | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                              | Source                                                                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resend   | Two paths: `react:` rendered in the SDK on each send, or upload through the `react-email` preview app's Resend tab (`npx react-email@latest resend setup`, needs a `full_access` key, `packages/react-email/src/cli/commands/resend/setup.ts:12-17`). The docs only say to "add props to the component to be used as variables". How props become `{{{VAR}}}` is **not documented** in what I read. The upload code is not in the open repo (unverified). | [template emails with React Email](https://resend.com/docs/knowledge-base/template-emails-with-react-email), [create template](https://resend.com/docs/dashboard/templates/create-template) |
| Postmark | No import. Option A: render in your app, send as `HtmlBody`. Option B: move content into Postmark Templates (Mustachio).                                                                                                                                                                                                                                                                                                                                  | [Resend migration guide](https://postmarkapp.com/migration-guides/resend)                                                                                                                   |
| Plunk    | React Email is a send-time renderer (`render` -> HTML). Its own templates use Liquid `{{ key }}` with conditionals and loops (search result of the docs; the page was not fetched).                                                                                                                                                                                                                                                                       | `resend/react-email` `apps/docs/integrations/plunk.mdx`; [Plunk templates](https://docs.useplunk.com/concepts/templates)                                                                    |
| useSend  | `render` from `@react-email/render`, then `html` into `emails.send`. No `react` option and no template variables mentioned.                                                                                                                                                                                                                                                                                                                               | [use with React Email](https://docs.usesend.com/guides/use-with-react-email)                                                                                                                |
| Loops    | No React Email page. "Bring your own MJML" with `{DATA_VARIABLE:name}` tags; conditionals through editor sections.                                                                                                                                                                                                                                                                                                                                        | [personalizing emails](https://loops.so/docs/creating-emails/personalizing-emails)                                                                                                          |

None of the five, as far as I read, compiles a React component into a stored template with placeholders and control flow.
The consistent pattern is "render to HTML, send the HTML".

## 3. Keys and senders at Resend

- **Permissions.** `permission: 'full_access' | 'sending_access'` and an optional `domain_id` (`api-keys/interfaces/create-api-key-options.interface.ts:4-8`).
  `full_access` "Can create, delete, get, and update any resource"; `sending_access` "Can only send emails" ([create API key](https://resend.com/docs/api-reference/api-keys/create-api-key)).
- **Domain restriction.** `domain_id` "Restrict[s] an API key to send emails only from a specific domain", and only applies when `permission` is `sending_access`.
  Full-access keys cannot be domain-restricted.
- **Edit later?** The API-keys page says the permission and domain can be changed in the dashboard, and the API can only rename a key ([API keys](https://resend.com/docs/dashboard/api-keys/introduction)).
  `resend-skills/skills/resend/references/api-keys.md:28` says both are fixed at creation.
  The two sources disagree; assume "recreate the key" for an agent.
- **Error for a send from another domain.** Not documented.
  `auth.md` lists `403` as "Key lacks permission for this resource" **(unverified as the response for this case)**.
  `restricted_api_key` (401, "restricted to only send emails") is the documented error for a sending key used on a non-send endpoint ([errors](https://resend.com/docs/api-reference/errors)).
- **What Resend recommends:**
  - "restrict to a single domain when possible" and "the narrowest scope that fits the task" ([auth.md](https://resend.com/auth.md)).
  - "Prefer 'Sending access' over 'Full access'" and "Give each service its own key" ([leaked key guide](https://resend.com/docs/knowledge-base/how-to-handle-a-leaked-api-key)); the per-key logs identify which integration leaked.
    This guide frames keys per service, not per environment.
  - Use a subdomain per purpose to isolate reputation ([domains](https://resend.com/docs/dashboard/domains/introduction)).
  - The API-keys page has **no environment-specific advice**: it never mentions staging or production.
- **How Resend users keep staging off the production domain.** There is no official rule.
  The practice that follows from the docs: a separate key per environment, `sending_access`, `domain_id` set to a staging subdomain, and the sandbox sender.
  `onboarding@resend.dev` "can only deliver to your Resend account email" (`resend-skills/skills/resend/SKILL.md`, gotcha 11), and `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev` simulate outcomes (same file, "Testing").
  Separate staging domains need a plan that allows more than one domain **(third-party claim, unverified)**.
  Third-party blogs recommend `staging.<domain>`; I did not find that on a Resend page.

**PostHog today.** A `phs_` key has `team` and `scopes` (`project_secret_api_key.py:14-52`), no sender field.
The sender of a transactional template is chosen at `make_transactional` (`from_integration_id`, default sender; `message_templates.py:303-309`, `transactional_email.py:59-68,95`) and fixed after.
So the only isolation today is **one PostHog project per environment**, each with its own verified sender and key.
A key that cannot send from the production sender inside the same project needs a new field **(guess: `allowed_sender_ids` on the key, checked when the send resolves its sender, 403 with a stable code)**.
Mirror Resend: set at creation, change by recreating.
The shape belongs to [#525](https://github.com/Silthus/posthog/issues/525).

## 4. Migration: a "move from Resend to PostHog" skill

### What exists elsewhere

No competitor publishes a coding-agent skill that migrates a codebase **from** Resend.
The nearest are:

| Item                             | What it is                                                                                                                                                                                                                                                       | Link                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bird, "Migrate from Resend"      | A page with a "Hand this to your agent" prompt: inventory first, leave every existing DNS record untouched, both providers authenticated side by side, port the send call, sandbox run, production traffic and Resend retirement each gated on an explicit reply | [bird.com/docs/guides/email/migrate/resend](https://bird.com/docs/guides/email/migrate/resend)                                                                |
| Postmark, Resend migration guide | DNS, templates, field mapping table, "Run both providers in parallel", suppressions, black-hole test address                                                                                                                                                     | [postmarkapp.com/migration-guides/resend](https://postmarkapp.com/migration-guides/resend)                                                                    |
| Plunk, Bento, toSend, Mailgun    | Human guides (seen as search results only; the Plunk page returned 404 when fetched, so I cite none of their content)                                                                                                                                            | [Plunk](https://www.useplunk.com/guides/migrate-from-resend), [Bento](https://bentonow.com/migrate/from/resend), [toSend](https://tosend.com/migrate/resend/) |
| Resend's own skills              | `resend`, `resend-cli`, `react-email`, `email-best-practices`, `agent-email-inbox` skills, for working **with** Resend                                                                                                                                           | [resend/resend-skills](https://github.com/resend/resend-skills), [react-email skill](https://github.com/resend/react-email/tree/main/skills/react-email)      |

### Steps the skill should run

Gates ask the person; the rest an agent can run alone.

1. **Preflight.** The transactional flag is on for the project; a verified sender exists (the agent sender-verification tools from the map, [#466](https://github.com/Silthus/posthog/issues/466)); a `phs_` key with the send scope exists.
   If a check fails, stop and say which.
2. **Inventory.** Search the repo for: `from 'resend'`, `new Resend(`, `emails.send`/`emails.create`, `batch.send`, `template: {`, `idempotencyKey`, `@react-email/`, `react:`, `render(`, webhook handlers that verify Resend/Svix signatures, `RESEND_API_KEY` in env files, CI and deploy config, and test addresses on `resend.dev`.
   Print a table: file, line, fields used.
3. **Classify each call site.**
   - **Mechanical:** only `from`, `to`, `subject`, `html`/`text`/`react`, `replyTo`, `idempotencyKey` and a result read of `data.id` / `error.message`.
   - **Needs a template conversion:** `react` with props that branch, loop or format (section 2).
   - **Unsupported:** `cc`, `bcc`, `attachments`, `tags`, `scheduledAt`, `headers`, `topicId`, `batch`.
     Report it and leave the call on Resend; do not drop the field.
     Reason: a silent drop changes who receives the mail.
4. **Sender and domain.** List the distinct `from` addresses and their domains.
   For each, show the person PostHog's DNS records, because DNS changes affect the whole domain and a person publishes them (Bird's prompt does the same).
   Leave Resend's records alone.
5. **Templates.** Substitution-only React Email or Resend hosted templates: upload as code-managed templates (`{{{NAME}}}` -> `{{ variables.name }}`).
   Logic-heavy `react:` call sites: use per-send inline content if the backend gets it, otherwise list them as manual.
6. **Key and client.** Add `POSTHOG_SECRET_KEY` (`phs_`) beside the existing project token; draft needs both (`new PostHog('phc_...', { secretKey: 'phs_...' })`, `types.ts:225`).
   Resend needs one key.
   Keep `RESEND_API_KEY` until step 8.
7. **Rewrite and prove one call site at a time.** Start with the lowest-risk email (a password reset or welcome mail; Postmark's guide says to start with a "low-risk, like password resets" message and run both in parallel).
   Run in a **staging** project first.
   Send to an address the person owns (Resend's `delivered@resend.dev` test addresses have no PostHog equivalent **(guess)**; locally the dev mail catcher is the proof, as the map's destination says).
   A send is proven by `data.id` plus a delivery event for that id in PostHog.
8. **Cut over and clean up, gated.** Production traffic moves only on the person's go-ahead; removing Resend's key, DNS records and webhooks waits for a second go-ahead (Bird's two gates; Postmark: "Remove the old Resend records once the cutover is finished").
   Carry over suppressions by hand until PostHog has an import (the Customer.io research found no suppression import either).

### Can a domain stay verified at both providers?

Yes, for the records involved, if the person keeps the labels apart.
Postmark's guide says "both providers' records can coexist during your transition"; Bird's prompt says both "authenticate side by side until I switch traffic".
I did not find a Resend page that says it.

PostHog verifies a domain through SES (`ses.py:555-632`):

| Record           | Name                                | Value                                  |
| ---------------- | ----------------------------------- | -------------------------------------- |
| DKIM (3 records) | `<token>._domainkey.<domain>` CNAME | `<token>.dkim.amazonses.com`           |
| SPF              | `@` TXT                             | `v=spf1 include:amazonses.com ~all`    |
| MAIL FROM        | `<label>.<domain>` MX 10            | `feedback-smtp.<region>.amazonses.com` |
| MAIL FROM SPF    | `<label>.<domain>` TXT              | `v=spf1 include:amazonses.com ~all`    |
| DMARC            | `_dmarc.<domain>` TXT               | `v=DMARC1; p=none;`                    |

Resend's default return-path subdomain is `send` ([custom return path](https://resend.com/docs/dashboard/domains/custom-return-path)); its exact record names are generated per domain and not on the pages I fetched.
The collision risks:

- **MAIL FROM label.** PostHog's label is configurable per domain (`mail_from_subdomain`, `ses.py:473`; the map's per-domain label work in [#116864](https://github.com/PostHog/posthog/pull/116864)).
  Pick one that is not `send`, or whatever Resend uses on that domain.
- **Root SPF.** A name can carry one SPF record.
  PostHog asks for the SPF TXT at `@`.
  If the root already has an SPF record (another provider, Workspace), merge the `include:` instead of adding a second record.
  Resend's SPF sits on its return-path subdomain by default **(guess; verify in the Resend dashboard)**, so it does not compete at the root.
- **DKIM** hostnames are unique per provider, so they do not clash.
- **DMARC** is one record per domain and independent of the sender ([Resend DMARC](https://resend.com/docs/dashboard/domains/dmarc)); keep the existing policy.

Resend's own guidance is to send from a subdomain (`updates.example.com`) and verify subdomains separately.
For a switch, the same subdomain is the cleanest choice, because the cutover is then a change of `from`, not a change of DNS.

## 5. Gaps: the smallest `posthog-node` list

Goal: a typical Resend call site becomes a mechanical rewrite. "Backend" means a change the posthog-node PR cannot make alone.

| #   | Addition                                                                                                                                                                    | Why it is on the list                                                                                                                                                                           | Backend?                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | `from: string` (`"Name <a@b.c>"` or bare address), matched to a verified sender, error `invalid_from_address` or `sender_unavailable` (`contracts.py:50`) when none matches | Every call site passes `from`. It is also the lever for sender-limited keys in [#525](https://github.com/Silthus/posthog/issues/525)                                                            | Yes                                                               |
| 2   | Inline content: `subject` + `html` (+ `text`) per send, no template                                                                                                         | Most call sites pass `html` or `react` (section 1 order). Needs a decision: reopen the inline shape the 2026-10-16 re-chart dropped, or make the skill convert every call site into a template. | Yes (decision for Michael)                                        |
| 3   | `react`: SDK renders with `@react-email/render` (dynamic import, optional peer, as resend-node) and sends the HTML plus `render(node, { plainText: true })` as `text`       | The call-site shape React Email users already have. Only works with #2.                                                                                                                         | No, after #2                                                      |
| 4   | `to: string \| string[]`                                                                                                                                                    | Resend takes arrays; the typical call passes one address (guess), but a type that rejects arrays breaks the cheap rewrite. Start with one recipient and a clear error for more.                 | Yes (to lift the single `EmailField`, `message_templates.py:290`) |
| 5   | `replyTo: string \| string[]`                                                                                                                                               | Common extra field                                                                                                                                                                              | Yes                                                               |
| 6   | `send(payload, { idempotencyKey })` -> `Idempotency-Key` header; with a key, retry network errors and the 503                                                               | Resend's retry story; today the SDK never retries (`emails.ts:116-117`)                                                                                                                         | Yes (dedupe, 24-hour memory, 409 on a changed body)               |
| 7   | `error.name` as an alias of `error.code`, plus the Resend status mapping for `rate_limit_exceeded` and the quota errors                                                     | Keeps `error.name` call sites compiling                                                                                                                                                         | No                                                                |
| 8   | A `template: { id, variables }` alias for `template` + `data`                                                                                                               | Only for Resend hosted-template call sites. Cheap, but nested differently from the draft. Skip if the skill rewrites them.                                                                      | No                                                                |

**Not on the list**, with the reason: `cc`, `bcc`, `attachments`, `tags`, `scheduledAt`, `headers`, `topicId` (each a small slice of call sites; the typings refuse them so the compiler flags the call site and the skill reports it), `batch` (loop with keys), `get`/`list`/`update`/`cancel` (not send), and Resend's webhooks (delivery events are PostHog events).

One friction the list does not remove: Resend needs **one** value (`RESEND_API_KEY`).
The draft needs the project token **and** a secret key (`types.ts:221-228`).
Most PostHog users already have the token; a skill can add the second env var.

Two things in the draft are worth checking before the list is final:

- The draft posts to `/api/projects/@current/messaging/send/email/` and uploads to `/messaging_templates/by_key/{key}/` with `template_outdated`, `content_hash` and `if_not_superseded` (`emails.ts:5-6,333-339,396-397`).
  I found none of those routes or codes on `upstream/master` (`2099bfc9e6f`): the only send route is `POST /messaging_templates/{id}/send/`.
  They match the planned by-key upload and send in the map, not the code on master.
- The draft treats a 5xx send as "may have queued" and never retries (`emails.ts:393-399`), while the backend raises 503 only when "the email pipeline did not confirm the send" (`message_templates.py:633-636`, `contracts.py:69-70`).
  The two read the same status differently.
  An idempotency key (item 6) resolves it; without one the SDK is right to be cautious.

## Open questions for Michael

1. **Inline content or template-only?** Item 2 decides whether a `react:` / `html:` call site is a one-line rewrite or a template conversion.
   The first reverses a re-chart decision; the second makes the skill do real work per call site and leaves logic-heavy React Email components manual.
2. **Is `from` accepted per send, or fixed per template?** It is the cheapest way to make key limits by sender meaningful (one key, one sender), and it matches Resend.
   It also lets a staging key hold a staging sender and fail on any other.

## Not verified

- How the `react-email` preview app's Resend upload turns props into `{{{VAR}}}`.
  The upload code is not in the open repository.
- What error Resend returns for a domain-restricted key sending from another domain.
- Resend's exact DNS record names.
  Its pages point to the dashboard.
- `dangerouslySetInnerHTML` as a way to emit `{% if %}` blocks inside table markup.
- Plunk's, Bento's and toSend's migration guides: seen as search results only.
- Code-search counts are an order, not a measurement.
