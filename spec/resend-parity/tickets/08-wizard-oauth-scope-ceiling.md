Wizard OAuth app: add the migration run's scopes to its scope ceiling
Label: wayfinder:task
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, section "Wizard"
Owner: a person with Django admin access in both regions (HITL)

## What to do

The Wizard's OAuth token carries only scopes inside the OAuth app's server-side ceiling. Without this step the run silently lacks the sender and upload tools and falls back to the UI.

- [ ] Confirm which scope gates the template upload MCP tool for an OAuth token (likely `hog_flow:write`).
- [ ] Add `integration:read`, `integration:write` and that scope to the Wizard OAuth app's ceiling in the US region.
- [ ] The same in the EU region.
- [ ] Record what was changed, where, and when on this ticket. No secrets.

## Blocks

- The live proofs of tickets 07 and 09.
