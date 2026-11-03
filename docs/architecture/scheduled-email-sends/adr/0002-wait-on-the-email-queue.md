# Scheduled sends wait on the email queue

A scheduled send is a job on the existing `email` queue with `scheduled` set to the requested time.
"Never claimed", `status = 'available' AND transition_count = 0`, is the scheduled state: the first claim increments `transition_count`, and cancel and reschedule guard on it.
A reader may expect a separate queue, or a marker column.
We chose plain reuse because it needs no step that moves due jobs and changes no worker.
A flag gives the rollback safety more cheaply than a separate queue, as long as no scheduled send waits when cdp-api or the worker rolls back.

## Considered options

- **A separate `email_scheduled` queue, promoted when due.** An older worker never polls it, which makes rollback safe without a flag. It costs a promotion sweep and a second claim path.
- **Change the worker's claim index or query.** That touches the hot path of every email.

## Consequences

Each waiting send sits in the email claim index.
A claim steps over every waiting send that sorts ahead of the due ones, at about 20 ns each in a local measurement.
A gauge of waiting scheduled sends alerts at 100,000, and that alert is the trigger to move waiting sends onto their own queue.
`transition_count = 0` now carries a meaning, so a change that resets it, or claims without incrementing it, breaks cancel.
