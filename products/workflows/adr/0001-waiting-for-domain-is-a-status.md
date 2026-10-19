# Waiting for a domain is a status value

A workflow whose email sender is not verified yet is stored as `status = waiting_for_domain`, a fourth value beside `draft`, `active` and `archived`.
We considered storing the person's intent (`enabled`) apart from what blocks the workflow, and deriving the shown status from both.
We kept one status because a derived status would change every place that reads `status` in Python, Node and the frontend, for a single blocker.
Node loads only `active` workflows, so the new value needs no change to execution.

## Considered options

- **Split intent from readiness.** An `enabled` flag plus a list of blockers, with the status derived. It reads well once a second blocker exists, such as a billing limit or a missing integration. Reconsider it then.
- **Refuse to enable.** Reject the Enable while a sender is unverified. The person would have to come back after verification, which is the step this design removes.

## Consequences

Every reader that compares `status` to `active` treats a waiting workflow as not running, which is correct.
Readers that list "not archived" or "draft or active" need `waiting_for_domain` added where a waiting workflow should appear, such as workflow search and the integration delete guard.
