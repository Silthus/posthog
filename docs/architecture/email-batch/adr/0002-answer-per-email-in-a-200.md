# The email batch answers each email inside a `200`

A batch that passes its whole-call checks always answers `200`, with one result per email in request order.
A result is either a `message_id` or the single send's error body.
When an email's outcome is unknown because its CDP call timed out, or the email never started because the batch reached its deadline, the email gets the single send's `503 delivery_unavailable` in its slot instead of failing the whole call.
We chose this because each email has its own `idempotency_key`, so a caller can retry exactly the emails that need it, and the other emails in the batch still go out.

## Considered options

- **A `207 Multi-Status`, or a whole-call `503` when any email is unconfirmed.** A whole-call error would make the caller retry emails that were already queued, and a mixed status code makes success checks harder for SDK users.

## Consequences

- A `200` does not mean every email was queued.
  The SDKs report a whole-call failure only for whole-call errors, and they expose one typed result per email.
- Only auth, a flag, the shape (count, duplicate keys, per-email content cap), the 8 MiB body limit and the throttle fail the whole call.
