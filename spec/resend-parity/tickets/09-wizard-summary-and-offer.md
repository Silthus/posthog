Wizard: capture the migration summary and offer the Resend run on install
Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, section "Wizard"
Cast: Opus 5.5, high
Repository: PostHog/wizard
Base: ticket 07's branch, or `main` once it merges

## What to build

- At the end of a `migrate` run, the Wizard reads the skill's summary block and captures `wizard: migration summary` with `from`, `sites_found`, `sites_rewritten`, `sites_left`, `templates_uploaded` and `dns_ready`. A missing or broken block captures the event with the fields it has and never fails the run.
- A deterministic Resend detector: `resend` in `package.json`. `@react-email/*` alone is not Resend. A REST-only app gets no offer; the skill still handles it when run.
- An install run that finds Resend offers `migrate resend` in its outro. A run without Resend shows nothing new.

## Test seams

- The summary parser with a full, a partial and a missing block, asserting the captured event at the analytics boundary.
- The detector on fixture `package.json` files.
- The outro with and without the detector's hit.

## Proof

- One local `migrate resend` run on the happy fixture captures the event with the counts from its report.
- One install run on the happy fixture shows the offer.

## Acceptance criteria

- [ ] The event never carries file paths or code.
- [ ] The offer never starts a run by itself.

## Blocked by

- Native: tickets 02 and 07.
- Live proof: ticket 08.

## How to build (map #461)

- Run the `impact` check, then build test-first with `/tdd` at the seams named above. Mock only what the seam section allows.
- Repo skills apply where the diff touches their area.
- Read the contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) first. Where the code must differ from it, stop and raise the difference with Michael.
- Public repo: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or the PR. Fixture addresses use `example.com`.
- Shipped means a reviewed draft PR: the design pass, the owed proofs, the description with `pr-description`, and one cross-family review recorded with `fleet proof`. Never mark ready, enqueue or merge.
