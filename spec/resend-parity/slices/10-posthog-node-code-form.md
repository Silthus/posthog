posthog-node: the code form, with rendered content and local templates
Slice: 10
Strand: posthog-node
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), sections "Code form", "posthog-node"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921), "Client interface" (code form) and "Open"
Repository: PostHog/posthog-js
Base: slice 09's branch

## What to build

```ts
// Rendered content: already rendered for one recipient, for example React rendered to html in the app
await posthog.emails.send({ to, distinctId, templateKey: 'password-reset', subject: 'Reset your password', html })

// Local template: the code is the source of truth; PostHog fills in the variables
await posthog.emails.send({
  to,
  distinctId,
  templateKey: 'welcome',
  subject: 'Welcome, {{ variables.name }}',
  html: welcomeHtml,
  templateData: { name: 'Jane' },
})
```

- **Code form:** `templateKey`, `subject`, `html` and/or `text`, optional `from` and `replyTo`, optional `captureEngagement`. Exactly one form per send; a wrong combination does not compile.
- **Rendered content** (no `templateData`): posted to `/messaging/send/email/` as is. No `text` is derived in the SDK.
- **Local template** (with `templateData`): the SDK hashes `subject`, `html` and `text` with #5312's content hash and sends `template: { key, hash }` with `message_data`. On `409 template_outdated` it uploads the content by key and sends once more with the same idempotency key. Users never call an upload. The upload carries no link to the code.
- **The template form** moves from `/messaging_templates/{id}/send/` to `/messaging/send/email/` as `template: { id }`, with no caller change.
- A `409` for a key edited in PostHog returns its error and is never retried.

## Test seams

- The `emails` namespace with `fetch` mocked: the body for each case; the outdated-then-upload-then-send sequence with one idempotency key; the edited-key `409` not retried; no upload for rendered content.
- The hash: the same content gives the same hash as the server's `content_hash` v1 (a fixture both sides share).

## Proof

- Live on a local stack: a rendered send, a first local-template send that uploads, a second that does not, and a changed template that uploads again. Each lands in the dev mail catcher under its key.

## Acceptance criteria

- [ ] Rendered content never triggers an upload.
- [ ] A local template uploads only when its hash is new to PostHog.

## Blocked by

- Native: slices 09 and 04.
- Named: PostHog/posthog#118924 merged, before release.
