Resend migration skill v0: move hosted-template and HTML sends, report the rest
Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, sections "Migration skill", "Send attribution", "Testing Decisions"
Cast: Opus 5.5, high
Repository: PostHog/context-mill
Base: `feat/send-transactional-email-skill` (PostHog/context-mill#433), or `main` once #433 merges

## What to build

A coding agent, or the Wizard's `wizard skill <id>`, runs a new `migrate-email` skill group with a `resend` variant on an app that uses Resend, and gets a local diff plus a report.

- **Detect and stop early.** No `resend` package, no `from 'resend'` or `new Resend(` in source, and no call to `api.resend.com`: stop before any edit. `@react-email/*` alone is a renderer, not Resend; it only classifies content.
- **Preflight.** Check that the transactional email API and the upload and send tools are on for the project. If a flag is off, stop and name it.
- **Inventory and classify** every send call site (#522's steps): moved now, or left on Resend with a reason. Left on Resend in v0: React Email sites, attachments, idempotency keys (until the SDK and Harley's idempotency land), and every Resend-only field (`cc`, `bcc`, `tags`, `headers`, `scheduledAt`, `topicId`, `batch.send`, more than one `to`). Never drop a field.
- **Move** hosted-template and simple HTML sends: upload each template by key with `source` (repository, path, ref), rewrite `{{{NAME}}}` to `{{ variables.name }}`, and rewrite the call site to `fetch` the send route `POST /api/projects/@current/messaging/send/email/` with a top-level `key` equal to the uploaded template's key, `template: { key }`, `message_data`, `identifiers.distinct_id` from the app's existing identify call when it has one, and the header `X-PostHog-Migrated-From: resend`.
- **Sender and DNS.** List the `from` addresses, create and verify senders through the MCP sender tools when they are on, otherwise send the person to the UI. Keep Resend's records; pick a MAIL FROM label that is not Resend's. Hand the DNS records or the Domain Connect link to the person.
- **Key.** Ask the person for a project secret key with `hog_flow:write` and store it as `POSTHOG_PROJECT_SECRET_API_KEY`. List every other place `RESEND_API_KEY` appears.
- **Tier.** Check the project's sending tier before cutover and say so in the report.
- **Report** `posthog-migrate-email-resend-report.md`, the name the Wizard's generic skill runner expects (`posthog-${skillId}-report.md`), ending with a machine-readable summary block: `from`, `sites_found`, `sites_rewritten`, `sites_left`, `templates_uploaded`, `dns_ready`.
- **Gates.** Never remove `resend` while a site uses it. Never touch DNS or the Resend account. Never commit.
- Sender setup, upload and error handling come from the same sources as `send-transactional-email`, through context-mill's `shared_docs` and `{{> partial}}` includes, so there is one authored source and the bundle works without the send skill installed.
- Wizard-only conventions sit in one optional section ("Inside the PostHog Wizard").

## Test seams

- The bundle build test (as #433 added): the skill builds, its reference files are present, its links resolve, and it resolves with no other skill installed.
- The MCP `SkillCatalog` ranking for "migrate from Resend", "replace resend with posthog", "switch email provider", before and after.
- Agent runs with `wizard skill <id>` on the happy fixture (PostHog/wizard-workbench#2221), a REST-only fixture, and a negative fixture with React Email but no Resend, judged by the diff.

## Proof

- Happy fixture: every hosted-template and HTML site moved, React sites unchanged with report rows, the project typechecks, the summary block parses. Each moved flow, triggered once against the local stack, lands one email in the dev mail catcher, and the send event carries `migrated_from: resend`.
- Negative fixture: empty diff.
- Gaps: real DNS publish and SES delivery; sender verification through the MCP until PostHog/posthog#116863 to #116865 land.

## Acceptance criteria

- [ ] No call site loses a field: each unsupported site is unchanged and has a report row with a reason.
- [ ] Every moved send carries `X-PostHog-Migrated-From: resend`.
- [ ] The report ends with the summary block the Wizard reads.
- [ ] The skill text reads correctly outside the Wizard.

## Blocked by

- Native: [Send attribution](https://github.com/Silthus/posthog/issues/530), and ticket 01 if Open decision 4 holds (attribution on the route this skill calls).
- Named: PostHog/posthog#118924 (upload and send by key), Harley's body route (S4) for the required top-level `key`, PostHog/context-mill#433 (the reference files it links to), and Open decision 4 of the spec (attribution on `messaging/send/email/`).

## How to build (map #461)

- Run the `impact` check, then build test-first with `/tdd` at the seams named above. Mock only what the seam section allows.
- Repo skills apply where the diff touches their area.
- Read the contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) first. Where the code must differ from it, stop and raise the difference with Michael.
- Public repo: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or the PR. Fixture addresses use `example.com`.
- Shipped means a reviewed draft PR: the design pass, the owed proofs, the description with `pr-description`, and one cross-family review recorded with `fleet proof`. Never mark ready, enqueue or merge.
