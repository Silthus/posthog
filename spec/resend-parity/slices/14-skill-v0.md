Resend migration skill v0: find every Resend send, set up the sender, and report
Slice: 14
Strand: skill
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), sections "Migration skill", "Testing Decisions"
Repository: PostHog/context-mill
Base: slice 20's commits on `feat/send-transactional-email-skill` (PostHog/context-mill#433), or `main` once #433 merges

## What to build

A coding agent, or the Wizard's `wizard skill <id>`, runs a new `migrate-email` skill group with a `resend` variant on an app that uses Resend. v0 prepares the move and rewrites no call site; v1 (slice 15) makes the one cutover.

- **Detect and stop early.** No `resend` package, no `from 'resend'` or `new Resend(` in source, and no call to `api.resend.com`: stop before any edit. `@react-email/*` alone is a renderer, not Resend; it only classifies content.
- **Preflight.** Check that the transactional email API is on for the project. If a flag is off, stop and name it.
- **Inventory and classify** every send call site (#522's steps): hosted template, rendered HTML, React, text, or left on Resend with a reason. Left on Resend: attachments, `last_event` checks, and every Resend-only field (`cc`, `bcc`, `tags`, `headers`, `scheduledAt`, `topicId`, `batch.send`, more than one `to`). Never drop a field.
- **Sender and DNS.** List the `from` addresses, create and verify senders through the MCP sender tools when they are on, otherwise send the person to the UI. Keep Resend's records; pick a MAIL FROM label that is not Resend's. Hand the DNS records or the Domain Connect link to the person.
- **Key.** Ask the person for a project secret key with `hog_flow:write` and store it as `POSTHOG_PROJECT_SECRET_API_KEY`. List every other place `RESEND_API_KEY` appears.
- **Tier.** Check the project's sending tier before cutover and say so in the report.
- **Report** `posthog-migrate-email-resend-report.md`, the name the Wizard's generic skill runner expects, ending with a machine-readable summary block: `from`, `sites_found`, `sites_rewritten`, `sites_left`, `dns_ready`.
- **Gates.** Never touch DNS or the Resend account. Never commit. The agent never creates a template.
- Sender setup and error handling come from the same sources as `send-transactional-email`, through context-mill's `shared_docs` and `{{> partial}}` includes, so the bundle works without the send skill installed.
- Wizard-only conventions sit in one optional section ("Inside the PostHog Wizard").
- **Wizard entry.** The `migrate` group and the new `migrate-email` group declare `parentCommand: migrate` with `statsig` and `resend`, so slice 16 resolves `wizard migrate resend`. The Statsig entry keeps working with today's Wizard.

## Test seams

- The bundle build test (as #433 added): the skill builds, its references are present and resolve, with no other skill installed.
- The MCP `SkillCatalog` ranking for "migrate from Resend", "replace resend with posthog", "switch email provider", before and after.
- Agent runs with `wizard skill <id>` on the happy fixture (PostHog/wizard-workbench#2221), a REST-only fixture, and a negative fixture with React Email but no Resend, judged by the report and the diff: no call site changed.

## Proof

- Each fixture's report, with the summary block parsed.
- Gaps: real DNS publish and sender verification on a deployed project.

## Acceptance criteria

- [ ] No call site changes in v0.
- [ ] The summary block parses on every fixture.

## Blocked by

- Native: slice 20.
- Named: PostHog/context-mill#433, the base.
