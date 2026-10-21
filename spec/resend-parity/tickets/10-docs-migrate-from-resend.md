Docs: Migrate from Resend, with a prompt to copy into your agent
Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, sections "Docs", "Migration skill"
Cast: Opus 5.5, high
Repository: PostHog/posthog.com
Base: `master`

## What to build

A "Migrate from Resend" page:

- Two ways in: `npx @posthog/wizard migrate resend`, or a copyable prompt for the reader's own coding agent that loads the `migrate-email` skill.
- What moves, what stays on Resend (with the field list), and that both providers send in parallel during cutover.
- The two hand-offs to the person: DNS and the project secret key, with staging as its own project and key.
- A field and error-name mapping table from Resend to PostHog, linking the API page.
- What `202` means and that engagement events count as analytics events, linking the API page.
- The Wizard page gets a short `migrate resend` entry.

## Test seams

- The page builds; every link resolves.

## Proof

- Rendered page screenshots.
- The copied prompt, pasted into a coding agent on the happy fixture, starts the skill.

## Acceptance criteria

- [ ] The field list matches the skill's unsupported-field table.
- [ ] The page names the Wizard once, then calls it the setup agent.

## Blocked by

- Native: tickets 06 and 07.

## How to build (map #461)

- Run the `impact` check, then build test-first with `/tdd` at the seams named above. Mock only what the seam section allows.
- Repo skills apply where the diff touches their area.
- Read the contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) first. Where the code must differ from it, stop and raise the difference with Michael.
- Public repo: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or the PR. Fixture addresses use `example.com`.
- Shipped means a reviewed draft PR: the design pass, the owed proofs, the description with `pr-description`, and one cross-family review recorded with `fleet proof`. Never mark ready, enqueue or merge.
