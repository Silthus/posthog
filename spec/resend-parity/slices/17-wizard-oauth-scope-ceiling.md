Wizard OAuth app: add the migration run's scopes to its scope ceiling
Label: wayfinder:task
Strand: task (HITL), outside the strands
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), section "Wizard"
Owner: a person with Django admin access in both regions (HITL)

## What to do

The Wizard's OAuth token carries only scopes inside the OAuth app's server-side ceiling. Without this step the run silently lacks the sender tools and falls back to the UI.

- [ ] Add `integration:read` and `integration:write` to the Wizard OAuth app's ceiling in the US region.
- [ ] The same in the EU region.
- [ ] Record what was changed, where, and when on this issue. No secrets.

## Blocks

- The live proofs of slices 16 and 18.
