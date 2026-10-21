Docs: send code content, errors and idempotency on the transactional email API page
Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, sections "Docs", "Contract pins"
Contract: [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921)
Cast: Opus 5.5, high
Repository: PostHog/posthog.com
Base: `docs/transactional-email-api` (PostHog/posthog.com#21306)

## What to build

The page `/docs/workflows/transactional-email-api` teaches a send from code first, the way the SDK now works:

- A `key` on every send that names the email, and `content` from one helper, Node first (`html()`, `text()`, `libraryTemplate()`), then cURL with the wire fields. A library send under its own `key` shows how one email can switch templates and keep its history.
- The plain-text part: PostHog derives it from `html` when `text` is missing.
- `from`, `reply_to`, the optional `distinct_id` and the address fallback, and why to pass the app's user ID.
- What `202` means: stored in PostHog's queue for delivery, not accepted by the provider or delivered.
- Idempotency: the key on every call, the replay, the `422`, the in-flight `409`, and what posthog-node retries.
- Engagement capture: on by default for sends from code, `captureEngagement: false` per send, and the events count as analytics events.
- The error shape with `name`, and one anchored section per new `code` the contract lists, quoting the server's `why` and `fix` once Harley's route answers them.
- Examples show `from` on the user's own domain.

## Test seams

- Every `docs_url` the contract's codes produce resolves to an anchor (extend #21306's anchor check).
- The page builds.

## Proof

- Rendered page screenshots at the new sections.
- The anchor list matches the error table of #120921.

## Acceptance criteria

- [ ] Every new code has an anchor.
- [ ] The billing line for engagement events is on the page.
- [ ] No example sends from a domain the reader does not own.

## Blocked by

- Native: ticket 03 (posthog-node PR 1).
- Named: Harley's code-content route (S4), and checks before queueing (S6), because the page promises that a refused send never gets a `202`.

## How to build (map #461)

- Run the `impact` check, then build test-first with `/tdd` at the seams named above. Mock only what the seam section allows.
- Repo skills apply where the diff touches their area.
- Read the contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) first. Where the code must differ from it, stop and raise the difference with Michael.
- Public repo: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or the PR. Fixture addresses use `example.com`.
- Shipped means a reviewed draft PR: the design pass, the owed proofs, the description with `pr-description`, and one cross-family review recorded with `fleet proof`. Never mark ready, enqueue or merge.
