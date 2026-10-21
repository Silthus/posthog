posthog-python: the code form, with rendered content and local templates
Slice: 12
Strand: posthog-python
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), sections "Code form", "posthog-python"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921), "Client interface" (code form) and "Open"
Repository: PostHog/posthog-python
Base: Harley's template-send PR, after it merges (not open yet)

## What to build

posthog-python gets the code form that slice 10 gives posthog-node, so both SDKs match:

- The code-form `@overload` beside Harley's template form, typed with his `TypedDict` and `Unpack` pattern: `template_key`, `subject`, `html` and/or `text`, the sender (`from` is a Python keyword, so the name follows whatever his PR picks, and the contract notes it), `reply_to`, `capture_engagement`, `template_data`.
- Rendered content without `template_data`; local templates with it, hashed with the same content hash, uploaded once on `409 template_outdated`, then sent again with the same idempotency key.
- `AsyncPosthog` gets the same.
- Errors raise Harley's typed exceptions with the contract's fields.

## Test seams

- Harley's `emails` tests, extended: one case per code-form mapping row, the outdated-upload-send sequence, no upload for rendered content.
- The shared hash fixture from slice 10.

## Proof

- Live on a local stack: the same four sends as slice 10, in Python.
- A parity table against posthog-node's slice 10.

## Acceptance criteria

- [ ] For the same input, the request matches posthog-node's byte for byte except the User-Agent.

## Blocked by

- Native: slices 04 and 10.
- Named: Harley's posthog-python template-send PR merged.
