Resend migration skill v1: move every supported site to posthog.emails.send
Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, sections "Migration skill", "Testing Decisions"
Cast: Opus 5.5, high
Repository: PostHog/context-mill
Base: ticket 02's branch, or `main` once it merges

## What to build

The `migrate-email` / `resend` skill moves every supported Resend call site, v0's own `fetch` calls included, to posthog-node:

- Client setup: add `posthog-node` at the release that carries the new `emails`, with `secretKey` and `migratedFrom: 'resend'` once on the client.
- `html:` sites become `content: html(subject, html, text?)`, `text:` sites `content: text(subject, text)`, React sites `content: react(subject, element)` (if ticket 05 is charted), hosted templates `content: libraryTemplate(templateKey, data)`. Every site gets a `key` named for its kind of email; a v0 library site keeps the `key` it already sends.
- `from`, `replyTo` and `idempotencyKey` move as they are. `distinctId` comes from the app's existing identify call.
- `if (error.name === ...)` branches keep working; branches on Resend's `last_event` are rewritten to `emails.get(id).status` once ticket 12 ships, otherwise reported. Error names follow the #120921 table, so a branch on a Resend name with no PostHog counterpart is reported, not guessed.
- Sites with Resend-only fields stay on Resend with report rows, as in v0.
- The skill proves the chain on one person: a send, an engagement event, and a product event on the same distinct ID (#532).

## Test seams

- Bundle build test and ranking, as in v0.
- Agent runs on the happy fixture (PostHog/wizard-workbench#2221) and the hard fixture (Silthus/next-session: REST, idempotency key, `.ics` attachment), judged by the diff: no `from 'resend'` left on the happy app, `posthog.emails.send` count equals the old send count, the project typechecks; on the hard app every unsupported site is unchanged with a reason and `resend` stays a dependency.

## Proof

- Each flow of the migrated happy app, triggered once on the local stack, lands one email in the dev mail catcher.
- One send, its engagement event and a product event show on one person in the local project.
- Gaps: real SES delivery and DNS publish.

## Acceptance criteria

- [ ] No v0 `fetch` call remains.
- [ ] A replayed Resend idempotency key keeps its meaning.
- [ ] The summary block still parses.

## Blocked by

- Native: tickets 02, 03, 04, and 05 if charted. Ticket 12 is not a blocker; without it, `last_event` branches are reported.
- Named: Harley's code-content route (S4) and idempotency wiring (S5).

## How to build (map #461)

- Run the `impact` check, then build test-first with `/tdd` at the seams named above. Mock only what the seam section allows.
- Repo skills apply where the diff touches their area.
- Read the contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) first. Where the code must differ from it, stop and raise the difference with Michael.
- Public repo: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or the PR. Fixture addresses use `example.com`.
- Shipped means a reviewed draft PR: the design pass, the owed proofs, the description with `pr-description`, and one cross-family review recorded with `fleet proof`. Never mark ready, enqueue or merge.
