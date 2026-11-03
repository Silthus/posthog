# The email batch loops over the single-send route in Django

The email batch sends each email with its own call to cdp-api's existing single-send route.
Django makes these calls, at most 10 at a time.
It does not make one call per batch to a new batch route.
We chose this because the loop changes no cdp-api code, no internal auth and no queue code, and a failure stays with one email.
The cost is one HTTP call, one JWT and one queue insert per email, which makes a batch slower than one internal call would.

## Considered options

- **One internal batch route (B).** cdp-api would check every email and queue them in one insert.
  It needs a new admission module, a JWT purpose that pins a set of workflows, and a single-chunk queue option.
  A queue failure would then be all or none, which conflicts with the per-email answers inside a `200`.
  B stays a follow-up.

## Consequences

- The public route, request and response are the same under both options, so B can replace the loop without callers noticing.
- The batch metrics (`messaging_email_batch_duration_seconds` and the `route` label on the CDP request metrics) decide when to build B.
  Do not replace the loop with a batch route before those metrics ask for it.
