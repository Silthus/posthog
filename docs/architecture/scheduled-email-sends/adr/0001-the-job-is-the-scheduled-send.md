# The queue job is the scheduled send

A scheduled email is one cyclotron job, with no ledger beside it.
A ledger would buy strict state and history past the job's life, but it needs a second store and a protocol that keeps the two from diverging.
Django can't reach the cyclotron database, so a Django ledger means two databases kept in step, and a ledger inside cyclotron is the same table with extra steps.
The job's row lock already gives an atomic cancel and reschedule, and `email_status` keeps the history.

## Consequences

The message id is the job id, and every cancel, reschedule and list goes through cdp-api.
Once the janitor deletes a finished job, two records remain: the status projection, which is best effort, and the run history. The run history keeps the invocation snapshot that a rerun inserts again, which is the rerun gap in ADR 0006.
