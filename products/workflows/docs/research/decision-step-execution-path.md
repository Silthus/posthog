# How a workflow decision step reaches a hosted System One model

Research ticket: `Silthus/posthog#242`. Map: `Silthus/posthog#240`.
Code read at upstream `master` `39cc02e` (2026-10-04). Paths are repo-relative.
Prior art: `PostHog/posthog#107832` ("Classify with Jev", closed unmerged; its last head is `5af6142`) and spec `Silthus/posthog#22` ("Generate text").

## Recommendation

Use **path 1, reshaped**: Node CDP calls a workflows-owned Django route, and that route calls the `ml_inference` facade.
Change three things relative to `#107832`:

1. **Transport.** Do not use the inline `callInternalApi` loop. Add a `decide` queue-parameter type with its own Node service, the way `sendPushNotification` works. The service makes one in-cluster call per execution. It reschedules on 429 and 503 and honors `Retry-After`, so a slow or saturated gateway does not block the consumer loop. A batch workflow gets backpressure without failing people.
2. **Gates and status codes live in Django.** Django checks the workflows flag, the AI data processing approval, the AI credit budget, and a per-team and global admission budget. It calls `decide_when_available` with `ai_product="workflows"` and `privacy_mode=True`. Status codes are retry instructions: reschedule on 429 and 503, and give a terminal failure with a named code for everything else.
3. **Auth.** Use a new scoped service JWT purpose (`WORKFLOW_DECIDE`) and accept the cost of one new secret. No existing credential can carry the call (see path 3).

Path 2 (Node calls the gateway directly) is faster by one hop.
It puts the gateway relay key in the CDP. It also re-implements the billing header contract in TypeScript and loses the server-side flag and consent checks, because Node can evaluate neither.
Keep it as the graduation route only if the Django hop becomes the bottleneck.

Batch several people into one request later, not in v1. Requests do take up to 32 questions, and HogQL `jev()` already proves the row-per-question pattern. But no cross-invocation coalescing exists in the CDP today.

## The model call itself

- The wire call is `POST {origin of AI_GATEWAY_URL}/v1/systemone` with body `{model, state, questions}` and `Authorization: Bearer AI_GATEWAY_API_KEY` (`products/ml_inference/backend/logic/decisions.py:34,72-78,98,126-133`; `posthog/llm/system_one.py:21`).
- `AI_GATEWAY_API_KEY` is a `phs_` project secret (`posthog/settings/web.py:1332-1335`).
- One request carries one `state` and at most 32 questions. A choice question takes at most 16 options (`products/ml_inference/backend/facade/contracts.py:37-39,57-58,81-82`).
- The facade has three entry points (`products/ml_inference/backend/facade/api.py:23-47`):
  - `decide` checks `decisions_enabled`. That check covers region, `is_ai_data_processing_approved`, and the `ml-inference-decisions` flag (`logic/decisions.py:43-69`).
  - `decide_when_available` checks the region only (US, EU, or DEBUG; `logic/decisions.py:38-40`).
  - `decide_unchecked` checks nothing.
- There are no retries in the facade. The default timeout is 30 s (`logic/decisions.py:35,113`).
- Errors (`contracts.py:16-34`, `logic/decisions.py:93-122`):
  - `DecisionsDisabledError`: the team is not enabled or the region has no service.
  - `GatewayNotConfiguredError`: the gateway is unset or not https.
  - `DecisionGatewayUnreachableError`: any `httpx.RequestError`, which includes timeouts.
  - `DecisionGatewayError(status_code)`: every non-200, including 402 and 429.
- The facade forces `team_id` into the gateway labels last, so a caller cannot override it (`logic/decisions.py:99-100`). `privacy_mode=True` sends `X-PostHog-Privacy-Mode`. Without it, the gateway records state and answers into the internal AI observability project (`contracts.py:72-74`, `logic/decisions.py:110-111`).

## Billing (common to all paths)

- The usage report bills `$ai_generation` events whose `ai_product` is in `POSTHOG_AI_PRODUCTS`, whose `$ai_billable` is true, and whose cost is above 0. It charges the team in the `team_id` property (`posthog/tasks/usage_report.py:1756-1767,1870-1878,1948-1989`).
- `workflows` is already in that list (`usage_report.py:1759`). The facade default `ai_product="ml_inference"` is **not** in it (`contracts.py:67`), so a workflow caller must pass `ai_product="workflows"`.
- A caller cannot set `$ai_billable`: the gateway strips caller labels with a `$ai_` prefix (`posthog/llm/gateway_client.py:271-276`). The gateway decides whether a hogference call is billable. That code is in `PostHog/ai-gateway`, which is not readable from here **[unverified]**. The HogQL settings comment says each decision "is a billed gateway call" (`posthog/settings/web.py:1340-1341`).
- `#107832` first omitted the `team_id` label. Review caught that the cost would bill team 0, and the PR added it. The facade does this for every caller, which is one reason to go through the facade.
- The credit pre-check is `is_team_over_ai_credit_budget(team.api_token)` (`ee/billing/quota_limiting.py:350-358`). It reads the Redis zset `@posthog/quota-limits/ai_credits`, memoized per worker for 30 s (`quota_limiting.py:93,104,239-249`).
- The 402 mapping exists in one place only: inline in HogQL `jev()`. A gateway 402 becomes "out of AI credits" (`posthog/hogql/transforms/prompt_jev.py:178-179`). The pre-check fails open, because the gateway's 402 is the backstop (`prompt_jev.py:511-522`). There is no shared helper.

## Path 1: Node CDP to a Django route to the `ml_inference` facade

This is the shape of `#107832`.
That PR called `build_system_one_client` directly, not the facade (`#107832` `products/workflows/backend/api/workflow_classifications.py`).

- **Latency.** Two hops: worker to Django in the cluster, then Django to the gateway. Django adds auth, a team load, a flag check, and a Redis credit lookup. Nothing here measures the hop. The `#107832` description says Jev itself answers "well under a second".
  - Do not call `decide` on this hot path. Its flag check uses `only_evaluate_locally=False` (`logic/decisions.py:57-66`), so it can make a network flag call per decision. HogQL evaluates its flag locally (`prompt_jev.py:494-505`).
- **Billing.** Django passes `ai_product="workflows"`, `trace_id` = the run's invocation id, and `privacy_mode=True`. The facade adds `team_id`. Django runs the credit pre-check and maps a gateway 402 to a terminal `quota_exceeded`.
- **Flag and consent.** Both are checked in Django.
  - Call `decide_when_available` and check `team.organization.is_ai_data_processing_approved` explicitly, because `decide_when_available` skips it (`api.py:30-38`). `#107832` checked approval inline and returned 403.
  - Check one workflows flag, aggregated on organization, in the builder and in the route. Spec `#22` gives the reasoning: browser and Django agree only on the organization key, and the CDP cannot evaluate flags. The CDP has no flag evaluation outside templates (grep of `nodejs/src/cdp`).
- **Secret.** A new scoped JWT purpose needs a new secret in web and in the CDP worker. `#107832` added `WORKFLOW_CLASSIFY_JWT_SECRET(S)`. The review warned that the secret must be provisioned through the charts and secrets repos before the step works. The rule is "mint a new key for a new use case rather than widen an existing one's" (`products/workflows/backend/service_jwt.py:11-14`).
- **Failure handling with the inline helper**, as `#107832` did it:
  - `callInternalApi` makes up to 3 attempts with 250 ms and 500 ms backoff (`nodejs/src/cdp/async-functions/internal-api-call.ts:16-17,110,139`).
  - It retries 408, 429, 500, 502, 503, and 504 (`nodejs/src/cdp/utils/cdp-fetch.ts:158-165`). It blocks the consumer loop while it does so.
  - Its default timeout is 3 s (`nodejs/src/common/config.ts:275`).
  - Review findings on `#107832`:
    - The 3 s worker timeout was shorter than Django's 5 s gateway timeout, so a slow answer was dropped and retried 3 times. Fix: the worker timeout must exceed Django's.
    - A gateway rejection mapped to 502 was retried. Fix: 422.
    - The route had no per-team limit, because the default DRF throttles skip service-JWT requests.
    - The context had no size bound. Fix: 65,536 characters, matching the decide API.
- **Failure handling with the recommended transport.** A `decide` queue-parameter type, dispatched in `nodejs/src/cdp/services/hog-executor-async.service.ts:127-180` next to `sendPushNotification`. The push service already parses and caps `Retry-After` and backs off with jitter (`nodejs/src/cdp/services/messaging/push-notification.service.ts:85-110`).

  | Outcome | Django answers | Node does |
  |---|---|---|
  | Decision | 200 with probabilities | Push onto the stack; the step writes variables and picks a branch |
  | Gateway timeout or unreachable, or gateway 5xx | 503 + `Retry-After` | Reschedule; bounded, then terminal `gateway_unavailable` |
  | Team or global admission budget spent, or gateway 429/529 | 429 + `Retry-After` | Reschedule at `Retry-After`; bounded bounces, then terminal `throttled` |
  | Over AI credits (pre-check or gateway 402) | terminal envelope `quota_exceeded` | Fail the step; `on_error` applies |
  | Flag off, no consent, self-hosted or no gateway | terminal envelope (`feature_unavailable`, `ai_processing_not_approved`, `gateway_unavailable`) | Fail the step; `on_error` applies |
  | Gateway rejects the input | terminal `model_refused` | Fail the step |

  - A failed step follows `on_error`. `continue` is the default and takes the action's continue edge (`nodejs/src/cdp/services/hogflows/hogflow-executor.service.ts:787-826`; `nodejs/src/cdp/services/hogflows/hogflow-utils.ts:85`). For a decision with N branches, the continue edge must be a defined fallback branch. That belongs to the action-shape ticket.
  - Spec `#22` uses the same status-code-as-retry-instruction contract, with `quota_exceeded` as a terminal 200 rather than a 402. A decision step should match it.
- **Throughput.**
  - A batch workflow builds one hogflow invocation per person, up to `CDP_BATCH_WORKFLOW_MAX_AUDIENCE_SIZE` (`nodejs/src/cdp/consumers/cdp-cyclotron-worker-batch-resolve.consumer.ts:334-360`; `nodejs/src/cdp/config.ts:363`).
  - A hogflow worker runs up to `CONSUMER_BATCH_SIZE` jobs at once (`nodejs/src/common/config.ts:382`; `nodejs/src/cdp/consumers/cdp-cyclotron-worker-hogflow.consumer.ts:34`).
  - The only limit before the step is per workflow (`nodejs/src/cdp/services/hog-flow-invocation-pipeline.service.ts`, bucket `CDP_RATE_LIMITER_*` at `nodejs/src/cdp/config.ts:250-251`). Nothing limits per team, and the hogflow queue has no rate-limited dequeue. Only the SES email queue has one (`nodejs/src/server.ts:345-353`).
  - Without a Django admission budget, a batch run sends every person to Django and the gateway at once.
  - Precedent for an admission budget: signals consumes a per-team and a global Redis token bucket before every Jev call (`products/signals/backend/system_one_decision.py:55-56,194-218`; `posthog/token_bucket.py:157`).
  - The public decide route uses `AIBurstRateThrottle` and `AISustainedRateThrottle` (`products/ml_inference/backend/presentation/views.py:45`; `posthog/rate_limit.py:814-823`). It is session-only (`scope_object = "INTERNAL"`) and far too low for workflows, so a workflows route is needed anyway.
- **Batching.** Not in v1: one request per person, with one question, or a few if the step asks several.
  - HogQL `jev()` shows the multi-person pattern. `state = {row_i: text}`, one question per row says "Evaluate only the text in state.row_i", up to 32 rows per request, 4 requests in flight, and inputs are deduplicated (`prompt_jev.py:150-166,191,209-258`).
  - The CDP could coalesce concurrent invocations of the same step within one dequeue batch into such a request, with a Django batch route behind it. Nothing in the CDP coalesces across invocations today.
  - Whether answer quality holds with mixed people in one state is **[unverified]**.

## Path 2: Node CDP to the AI gateway directly

- **Latency.** One hop. No Django worker is held.
- **Secret.** The CDP gets `AI_GATEWAY_URL` and `AI_GATEWAY_API_KEY`. Today no Node config holds a gateway or LLM key (grep of `nodejs/src` for `AI_GATEWAY`, `hogference`, `llm-gateway`, `openai`, `anthropic`).
  - That key is a relay credential: the gateway bills whatever `team_id` label the caller sends.
  - The facade's protection, setting `team_id` last, would have to be rebuilt in TypeScript.
- **Billing.** The `X-PostHog-Properties`, `X-PostHog-Product`, `X-PostHog-Distinct-Id`, `X-PostHog-Trace-Id` and privacy headers (`posthog/llm/gateway_client.py:285-307`) and the response parser (`logic/decisions.py:136-181`) would be duplicated in Node.
  - This bypasses the facade that the product rules call "the ONLY module other products are allowed to import" (`products/ml_inference/backend/facade/api.py:1-5`).
- **Credits.** This part is cheap. Node `QuotaLimiting` reads the same Redis key prefix (`nodejs/src/common/services/quota-limiting.service.ts:18`). It needs `ai_credits` added to its `QuotaResource` union (`:8-16`). The 402 mapping moves to Node.
- **Flag and consent.** These are the weak points.
  - The CDP cannot evaluate flags, so the only gate is the builder.
  - The Node `Team` type has no `is_ai_data_processing_approved` (grep of `nodejs/src`), so the team manager query would have to load it.
- **Failure handling.** This is the same queue-parameter service, with gateway statuses read directly.
- **Throughput.** This is the most natural place to coalesce people into 32-question requests and to apply a Valkey token bucket. The SES `RateLimiterService` is the precedent (`nodejs/src/server.ts:345-353`). Neither exists for this use yet.

## Path 3: reuse an existing AI route (`run-scout`, `create-task`)

- Neither step uses `callInternalApi`. Each queues a `fetch` to the public site URL with its own JWT audience and a 30-minute token (`nodejs/src/cdp/async-functions/run-scout.ts:16-64`; `nodejs/src/cdp/async-functions/create-task.ts:17-55`).
  - Retries come from the queued-fetch engine: up to `CDP_FETCH_RETRIES`, with 1 s to 30 s backoff and no `Retry-After` (`nodejs/src/cdp/config.ts:301-303`).
- Both routes start long-running work and return 201 or 202. The template then awaits the result for minutes (`nodejs/src/cdp/templates/_destinations/posthog_tasks/posthog-create-task.template.ts:79-83`; `nodejs/src/cdp/templates/_destinations/posthog_signals/posthog-run-scout.template.ts`). Neither returns a decision. A scout or task run for a single pick from a list is the cost `#107832` set out to avoid.
- Carrying a decide call on their credentials means accepting the scout or tasks audience on a new route. `service_jwt.py:11-14` forbids that.
- The one existing credential that needs no new secret is the team secret token (`TeamSecretTokenAuthentication`, `posthog/auth.py:410-450`). Spec `#22` chose it for "Generate text", and the CDP already loads it (`nodejs/src/common/utils/team-manager.ts:143`). But it is nullable (`posthog/models/team/team.py:356-360`), and only `rotate_secret_token_and_save` sets it (`team.py:979-993`). No team-creation path generates it. So a project that never generated a secret token could not run the step.
  - The same gap applies to spec `#22`. It is recorded here for the conductor and not acted on.
  - Its view-name allowlist would also need the route (`posthog/permissions.py:431-441`).

## The mocked test walk

- The builder's test run posts `mock_async_functions: true` (`products/workflows/frontend/Workflows/hogflows/panel/testing/hogFlowEditorTestLogic.ts:1166`).
- The CDP then replaces every registered async function with its `mock(args, logs)` (`nodejs/src/cdp/cdp-api.ts:1630-1662`). It runs one step per call (`cdp-api.ts:814-872`). No credits are spent, because nothing reaches Django.
- A `decide` async function therefore needs a `mock` that:
  - validates inputs exactly like the live route (2 to 16 options, the context size limit). `#107832` review found a mock that accepted 17 options;
  - picks a deterministic answer, so the walk can continue down one branch. `#107832` returned the first category with confidence 1;
  - says it was mocked. Spec `#22`'s rule: nothing in a mock reads like a real answer.
- If the decision becomes a native action type instead of a `function` template, its handler needs its own test branch. The automatic mocking only covers async functions called from Hog.

## Files a build would touch (path 1, recommended shape)

Node:

- `nodejs/src/cdp/async-functions/decide.ts` (new: `execute` sets the queue parameters, `mock` returns the fake decision) and `async-functions/index.ts`.
- `nodejs/src/cdp/schema/cyclotron.ts`: the `decide` queue-parameter schema, next to the push schema at `:172`.
- `nodejs/src/cdp/services/hog-executor-async.service.ts`: the dispatch branch at `:127-180`.
- A new decision service under `nodejs/src/cdp/services/`: the in-cluster call with an explicit timeout, the reschedule with `Retry-After` and a bounded bounce count, and terminal codes into run logs.
- `nodejs/src/cdp/utils/jwt-utils.ts` (audience) and `nodejs/src/cdp/config.ts` (`WORKFLOW_DECIDE_JWT_SECRET`).
- The action or template. Which one depends on the action-shape ticket: a native branching type in `hogflow-executor.service.ts`, or a template under `nodejs/src/cdp/templates/_destinations/posthog_workflows/`.

Django:

- `posthog/jwt.py` (audience), `posthog/settings/data_stores.py` (`WORKFLOW_DECIDE_JWT_SECRETS`), `products/workflows/backend/service_jwt.py` (purpose).
- `products/workflows/backend/presentation/views/workflow_decisions.py` (new) and `products/workflows/backend/routes.py`.
- The view checks the flag, consent, credits, and a token-bucket admission. It calls `ml_inference` `decide_when_available` and maps errors to the table above.
- Endpoint contract tests next to `workflow_scout_runs` and `workflow_tasks`.
- Save-time validation of options and context in `products/workflows/backend/presentation/views/hog_flow.py`, so a broken step fails at save. That file already does this for run-scout.
- If the step is a template: `posthog/cdp/flag_gated_templates.py`.
- The `ml_inference` facade needs no change.

Outside this repo: provision `WORKFLOW_DECIDE_JWT_SECRET` for web and the CDP worker in the charts and secrets repos before the flag widens.

## Open questions

- Whether the Go gateway marks hogference generations `$ai_billable` with a cost above 0, and whether it enforces its own per-team rate limits on `/v1/systemone`. Both live in `PostHog/ai-gateway`, which is not readable from here.
- Admission budget values, and the reschedule bounce count, for the dogfood phase.
- Whether multi-person batching keeps answer quality. Measure this before building the coalescer.
