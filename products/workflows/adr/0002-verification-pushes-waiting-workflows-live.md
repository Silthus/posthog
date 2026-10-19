# Verification pushes waiting workflows live

The function that writes `verified = true` on an email sender calls the workflows facade's `enable_waiting_workflows(team_id, sender_ids)` inside its transaction.
The facade dispatches a retried Celery task after commit, and the task runs the same `enable` rule on each waiting workflow that uses those senders.
We chose a push from the one place that writes the flag over a workflows job that polls for verified senders, because the push covers the verify button and the background sweep with no new schedule, and a workflow goes live seconds after verification.

## Considered options

- **Call `enable` inline in the verification transaction.** Faster, but a failure would roll back the verification or be lost, and the sweep runs in Celery, where events from the global analytics client are lost.
- **A periodic job that finds waiting workflows with every sender verified.** Simple and self-healing, but it adds a schedule and a delay of up to one interval. It stays a follow-up backstop if the task's final-failure metric ever fires.

## Consequences

Once a sender is verified, nothing else revisits it, so the task retries with backoff and logs an error and counts a metric after its last retry.
Any new code path that writes `verified = true`, such as the domain wizard's `_mark_domain_verified`, must call `enable_waiting_workflows` too.
