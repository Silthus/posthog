# The accepted send is a typed field on the run state

cdp-api stamps the accepted content, sender, key-limit snapshot and tracking policy on the run as `HogFlowInvocationContext.send`, and the email step reads it without rendering again.
We rejected a reserved key in `variables`: steps can write variables (`hogflow-executor.service.ts:962-966`), their total is capped at 5 KB (`:972`), and a caller could inject its own HTML through `message_data`.
The context already carries typed fields stamped at enqueue, such as `accountAudience` (`types.ts:451`).

## Consequences

- The field is part of the queued job format. The worker deploys before cdp-api starts stamping it, and mixed-version rollouts need a cross-version proof.
