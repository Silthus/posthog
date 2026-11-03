# What a cancel guarantees

A cancel stops a send atomically: one guarded update wins or loses against the worker's claim, and a canceled job never reaches the worker.
Two guarantees around it are weaker, by choice.

A repeated cancel answers `200` while the job row exists, about 10 seconds after the cancel.
After that it answers `200` only when the `canceled` status row has reached ClickHouse, and `404` otherwise.
A rerun can still bring back a canceled email when it read its page before the cancel and inserts after the janitor deleted the row, or when the `canceled` run row was lost.
The existing upserts skip a job canceled before any claim, which closes the race while the row exists.

## Considered options

- **Keep canceled jobs past the janitor.** That makes a repeated cancel reliable, but it changes the janitor and keeps each such row for 30 days. The rows are content-free tombstones, because this option clears `state` at the cancel.
- **A durable cancel record, checked in the same statement that inserts a rerun's job.** That closes the rerun race, at the cost of a new store that lives as long as reruns can reach a run.

## Consequences

Only the new cancel writes `canceled` with `transition_count = 0`. The upsert condition relies on that.
