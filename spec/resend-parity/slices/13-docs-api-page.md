Docs: both send forms, errors and idempotency on the transactional email API page
Slice: 13
Strand: docs-api
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), section "Docs"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921)
Repository: PostHog/posthog.com
Base: `docs/transactional-email-api` (PostHog/posthog.com#21306)

## What to build

The page `/docs/workflows/transactional-email-api` covers what both SDKs send:

- The template form by `template_id` with `template_data`, and the code form by `template_key`: rendered content, and local templates with `{{ variables.* }}` that the SDK uploads when they change. Node and Python first, then cURL with the wire fields.
- React Email: render to `html` in your code, then send it as rendered content.
- PostHog derives the plain-text part from `html` when `text` is missing.
- Always pass `distinct_id`, and why: otherwise engagement events land on a person keyed by the address.
- Client setup: `secret_key`, `app_host` for any host that is not PostHog Cloud, `max_retries`.
- What `202` means: queued for delivery, not delivered.
- Idempotency: the key on every call, the replay, `422`, the in-flight `409`, what the SDKs retry, and `max_retries=0` with a key derived from the email's purpose for job runners.
- Engagement capture: on by default for code sends, `capture_engagement: false` per send, and the events count as analytics events.
- The error shape with `name`, and one anchored section per `code` in the contract's table, quoting the server's `why` and `fix`.

## Test seams

- Every `docs_url` the server and the SDKs emit resolves to an anchor (extend #21306's anchor check).
- The page builds.

## Proof

- Rendered page screenshots of the new sections.

## Acceptance criteria

- [ ] Every example passes `distinct_id`.
- [ ] Every error code in the contract has an anchor.

## Blocked by

- Native: slices 07, 09 and 10.
