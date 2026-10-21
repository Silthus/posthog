send-transactional-email skill: teach the flat contract
Slice: 20
Strand: skill
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), sections "Code form" and "Migration skill (ours, context-mill)"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921)
Repository: PostHog/context-mill
Base: `feat/send-transactional-email-skill` (PostHog/context-mill#433), unreleased

## What to build

The migration skill reuses `send-transactional-email`'s guidance (slice 14), so that guidance must match the SDK first. #433 teaches #5312's shape, which slice 09 removes:

- STEP 8 sends the flat forms: a local template by `templateKey` with `templateData`, rendered content by `templateKey` with `html`, and a template made in PostHog by `templateId`. `templateFile()`, the `template` field, the `data` field and the deploy-time upload by key go.
- The bundled-file advice for Next.js, serverless and edge runtimes goes with `templateFile()`: a local template is a string in code.
- Idempotency replaces "sends are not idempotent": the SDK sends a key and retries with it; job runners pass `maxRetries: 0` and a key derived from the email's purpose.
- STEP 9 lists the contract's codes and the `409` for a key edited in PostHog.
- HTTP callers send the code form to `/messaging/send/email/` and handle `409 template_outdated` by uploading by key and resending with the same key.

## Test seams

- #433's bundle build test, unchanged.
- One agent run of the skill on the happy fixture (PostHog/wizard-workbench#2221), judged by the diff: it sends by `templateKey`, and no `templateFile` remains.

## Proof

- The fixture diff in the PR.

## Acceptance criteria

- [ ] No reference to `templateFile`, `uploadTemplate` or the `template` field remains.
- [ ] #433 merges no earlier than the posthog-node release with slice 10.

## Blocked by

- Native: none. Build from the contract.
- Named, before #433 merges: the posthog-node release with slices 09 and 10.
