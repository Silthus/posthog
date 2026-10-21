Docs: Migrate from Resend, with a prompt to copy into your agent
Slice: 19
Strand: docs-migrate
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), sections "Docs", "Migration skill"
Repository: PostHog/posthog.com
Base: `master`

## What to build

A "Migrate from Resend" page:

- Two ways in: `npx @posthog/wizard migrate resend`, or a copyable prompt for the reader's own coding agent that loads the `migrate-email` skill.
- What moves, what stays on Resend (with the field list), and that both providers send in parallel during cutover.
- The two hand-offs to the person: DNS and the project secret key, with staging as its own project and key.
- A field and error-name mapping table from Resend to PostHog, linking the API page, and how hosted templates become templates in your code.
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

- Native: slices 15 and 16.
