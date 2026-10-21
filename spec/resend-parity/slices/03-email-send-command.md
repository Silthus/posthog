EmailSendCommand and the typed CDP outcome (R2)
Slice: 03
Strand: send-api
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), section "Send API (ours)"
Architecture: #526, seams `EmailSendCommand` and `Queued | Rejected | Unavailable`, PR "R2 EmailSendCommand"
Repository: PostHog/posthog
Base: slice 02's branch

## What to build

A mechanical refactor with no behavior change:

- The Django send route builds one `EmailSendCommand` and hands it to the CDP client.
- The CDP client returns `Queued(message_id, warnings) | Rejected(code, why, fix) | Unavailable`, and the route maps each to its HTTP answer.
- Both send routes (`messaging_templates/{id}/send/` and `messaging/send/email/`) go through it.

## Test seams

- The send route at the HTTP boundary, with the CDP client faked at its interface: each outcome maps to today's status code and body.

## Proof

- The existing send route tests pass unchanged.

## Acceptance criteria

- [ ] No user-visible change on either route.

## Blocked by

- Native: slice 02.
