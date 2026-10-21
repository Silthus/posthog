Wizard: capture the migration summary and offer the Resend run on install
Slice: 18
Strand: wizard
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), section "Wizard"
Repository: PostHog/wizard
Base: slice 16's branch, or `main` once it merges

## What to build

- At the end of a `migrate` run, the Wizard reads the skill's summary block and captures `wizard: migration summary` with `from`, `sites_found`, `sites_rewritten`, `sites_left` and `dns_ready`. A missing or broken block captures the event with the fields it has and never fails the run.
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

- Native: slices 14 and 16.
- Live proof: slice 17.
