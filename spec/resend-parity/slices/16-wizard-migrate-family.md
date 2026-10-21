Wizard: turn migrate into a family with migrate statsig and migrate resend
Slice: 16
Strand: wizard
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), section "Wizard"
Repository: PostHog/wizard, plus one companion change in PostHog/context-mill
Base: `main` in each repo

## What to build

`npx @posthog/wizard migrate resend` runs the `migrate-email` / `resend` skill, and `npx @posthog/wizard migrate statsig` keeps the Statsig run.

- Replace the flat `migrate` command with a family command that runs the generic agent-skill program with the skill id.
- Give the `migrate` family its extra scopes (`integration:read` and `integration:write`, for sender setup), per family, not for every skill run. The skill uploads nothing, so it needs no template scope.
- Companion context-mill change: the `migrate` group and the `migrate-email` group declare `parentCommand: migrate` with `statsig` and `resend`, in the same release window.
- Release note and README: bare `wizard migrate` now opens a picker in a terminal and fails in CI with "requires a subcommand".
- A token without the extra scopes is not an error: the skill falls back to the UI path.

## Test seams

- The family resolution test with a fake `skill-menu.json` that holds a Statsig and a Resend entry.

## Proof

- `migrate resend` and `migrate statsig` resolve to their skills; bare `migrate` shows the picker.
- One local run of `migrate resend` with `--local-context-mill --local-mcp --local-posthog` on the happy fixture reaches the skill's first step. The full run waits on slice 17.

## Acceptance criteria

- [ ] `migrate statsig` behaves as `migrate` did.
- [ ] The scope additions apply to the `migrate` family only.

## Blocked by

- Native: slice 14.
- Live proof: slice 17.
