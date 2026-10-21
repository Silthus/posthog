Wizard: turn migrate into a family with migrate statsig and migrate resend
Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, section "Wizard"
Cast: Opus 5.5, high
Repository: PostHog/wizard, plus one companion change in PostHog/context-mill
Base: `main` in each repo

## What to build

`npx @posthog/wizard migrate resend` runs the `migrate-email` / `resend` skill, and `npx @posthog/wizard migrate statsig` keeps the Statsig run.

- Replace the flat `migrate` command with a family command that runs the generic agent-skill program with the skill id.
- Give the `migrate` family its extra scopes (`integration:read`, `integration:write`, and the upload tool's scope; the PR confirms which one), per family, not for every skill run.
- Companion context-mill change: the `migrate` group and the `migrate-email` group declare `parentCommand: migrate` with `statsig` and `resend`, in the same release window.
- Release note and README: bare `wizard migrate` now opens a picker in a terminal and fails in CI with "requires a subcommand".
- A token without the extra scopes is not an error: the skill falls back to the UI path.

## Test seams

- The family resolution test with a fake `skill-menu.json` that holds a Statsig and a Resend entry.

## Proof

- `migrate resend` and `migrate statsig` resolve to their skills; bare `migrate` shows the picker.
- One local run of `migrate resend` with `--local-context-mill --local-mcp --local-posthog` on the happy fixture reaches the skill's first step. The full run waits on ticket 08.

## Acceptance criteria

- [ ] `migrate statsig` behaves as `migrate` did.
- [ ] The scope additions apply to the `migrate` family only.

## Blocked by

- Native: ticket 02.
- Live proof: ticket 08.

## How to build (map #461)

- Run the `impact` check, then build test-first with `/tdd` at the seams named above. Mock only what the seam section allows.
- Repo skills apply where the diff touches their area.
- Read the contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) first. Where the code must differ from it, stop and raise the difference with Michael.
- Public repo: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or the PR. Fixture addresses use `example.com`.
- Shipped means a reviewed draft PR: the design pass, the owed proofs, the description with `pr-description`, and one cross-family review recorded with `fleet proof`. Never mark ready, enqueue or merge.
