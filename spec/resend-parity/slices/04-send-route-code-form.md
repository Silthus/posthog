Send route: the code form, rendered content and local templates
Slice: 04
Strand: send-api
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), sections "Code form", "Send API (ours)"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921), "Client interface" (code form) and "Open"
Architecture: #526, seams `AcceptedSend` and the fixed slot, PR "2 Code-content route"
Repository: PostHog/posthog
Base: slice 03's branch

## What to build

`POST /api/projects/@current/messaging/send/email/` takes the code form next to the template form:

- **Fields:** `template_key` (the key rule of #118924: `^[a-zA-Z0-9_-]+$`, at most 400 characters), `subject`, `html` and/or `text`, optional `from`, `reply_to` (a list), `capture_engagement`, and `identifiers.distinct_id` with the address as fallback. Exactly one form per request.
- **Rendered content** (no `message_data`): cdp-api stamps the content on the run as `state.send: AcceptedSend`, and the worker delivers it through the fixed slot without a second render. The content is never stored as a template version.
- **Local template** (`template: { key, hash }` plus `message_data`): the send and the upload by key are on #118924. This slice changes two of its answers so the SDK's upload-and-resend loop works:
  - A key PostHog does not know yet answers `409 template_outdated`, not `404`, so the first send of a new local template uploads it. #118924 answers `404` today (`messaging_send.py`, `MessageTemplateMissing`).
  - The SDK's upload carries `if_code_managed: true`, beside #118924's `if_not_superseded`. Under the row lock, a template whose content was edited in PostHog (`managed_by` is not `code`) refuses that upload with `409` and why and fix, and nothing is sent. #118924's upload adopts such a template today (`template_uploads.py`, `_write_upload`); an upload without the flag keeps doing that.
  - It runs through `EmailSendCommand` and `AcceptedSend` with pinned content.
- **Text:** when only `html` is present, the server derives `text`.
- **Workflow per key:** a `template_key` that names a template uses that template's transactional workflow. Any other key gets one workflow on its first send, made under a lock so two first sends make one. Workflows made here stay out of the workflow list and fire no `hog_flow_created`.
- **Tracking:** tracking header v3 carries `capture_engagement`, on by default for code sends. UTMs on for new keys.
- `from` must be a verified sender; otherwise `400 sender_not_verified` with why and fix.

## Test seams

- The send route at the HTTP boundary with cdp-api faked at its client interface: field validation, the exactly-one-form rule, the address fallback, `from` checks.
- cdp-api's send route with the queue faked: `AcceptedSend` on the invocation, text derived from HTML.
- The fixed slot: delivers `state.send` as given.
- The workflow-per-key lookup: same key twice, concurrent first sends, a key that names a template.
- The send and upload routes at the HTTP boundary: the first send of a new key gets `template_outdated`, then uploads and sends; an upload with `if_code_managed` to a template edited in PostHog gets `409` and changes nothing.

## Proof

- Live on a local stack: one rendered send and one local-template send land in the dev mail catcher, both under their key's workflow.
- **Cross-version:** `AcceptedSend` is part of the queued job format. Run an old worker against a new cdp-api and the reverse, and show that no job is lost or sent twice (ADR 0002). The worker deploys first.

## Acceptance criteria

- [ ] Rendered content is never stored as a template version.
- [ ] Two first sends with one new key make one workflow.
- [ ] A send never overwrites content edited in PostHog.
- [ ] The template form behaves as before.

## Blocked by

- Native: slice 03.
- Named: PostHog/posthog#118924, the base.
