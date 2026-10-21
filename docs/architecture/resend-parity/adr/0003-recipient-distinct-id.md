# The recipient's distinct ID is explicit or absent

`emails.send` takes an optional `distinctId` for the recipient and never reads posthog-node's `withContext`, because the request context holds the requester, not the recipient.
A send without one falls back to the address. A later PR may fill a missing ID from exactly one identified person with that address, behind the same field, once production proofs pass ([#534](https://github.com/Silthus/posthog/issues/534)).
Identity is frozen at acceptance, so callbacks never look the recipient up again.

## Considered options

- Require `distinctId`, with an explicit email-only flag. Rejected: a send needs only an address, so the ID stays optional.
- Inherit the request context, as `capture` does. Rejected: invites, admin actions and digests go to someone else.
- Always infer from the email address. Rejected as a guarantee: ClickHouse person data lags ingestion, and `docs/internal/person-data-access.md` rules it out for identity decisions. A welcome email right after `identify()` would often miss.
