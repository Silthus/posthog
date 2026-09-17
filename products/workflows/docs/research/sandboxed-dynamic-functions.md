# Sandboxed dynamic functions: what a TypeScript callback step would need

Research note. Nothing is built here.

- Question: what would it take to let a workflow step be a dynamic TypeScript function, authored in the workflow source, serialized into the workflow definition, dispatched asynchronously by the Cyclotron worker to a sandbox, and resolved back into the parent job?
- Source: this repository at `f637db96f1fc853ea6a83694f02b94ab690bdcaf` (2026-09-17), plus two fork branches and primary vendor documentation. Every repository claim cites a file and a line.
- Location: `products/workflows/docs/research/`, beside the read-only mode note from issue 63.

## Summary

Six findings decide the shape of the work.

1. **The park-and-resume primitive is complete and it is small.** An action handler returns `{ scheduledAt }` and the job parks. Everything it must remember goes in `state.currentAction`. Nothing new is needed in Cyclotron.
2. **The extension seam is a registered async function, not a new action type.** `nodejs/src/cdp/async-functions/` is a keyed registry with a documented return-value contract and a worked example. A `function` action pointing at a new template is enough; the definition JSON needs no new node type.
3. **Two transports already exist, and they answer different questions.** Poll-from-the-worker is specified in full for the LLM node. Wake-the-job-from-outside is shipped twice: the subscription matcher writes `scheduled = NOW()` straight into `cyclotron_jobs`, and Django calls a scoped-JWT CDP route to pull parked jobs forward.
4. **There is no "resume job N with payload" endpoint, but every part of one exists.** The public unauthenticated ingress, the per-call scoped JWT, and the direct state write are all in production for other purposes.
5. **The repository runs no untrusted JavaScript anywhere today.** HogVM is a bytecode interpreter, not a JS engine. The only real code sandbox is the tasks product's Docker runner, and it is built for minutes-long agent runs, not for a sub-second step.
6. **The variable cap, not the sandbox, is the binding limit on the result.** A step result must fit inside a 5 KB total variable budget.

## 1. The dispatch-and-resume primitive that exists today

### The handler contract

Every workflow action handler returns one shape (`nodejs/src/cdp/services/hogflows/actions/action.interface.ts:8-14`).

```ts
export interface ActionHandlerResult {
    nextAction?: HogFlowAction
    scheduledAt?: DateTime
    finished?: boolean
    result?: unknown
    error?: any
}
```

`scheduledAt` is the park signal. `nextAction` is the continue signal. `result` is what reaches `output_variable`.

The executor loop reads that shape at `hogflow-executor.service.ts:526-543`, and `shouldEndHogFlowExecution` (`:286-318`) stops the in-process walk when `queueScheduledAt` is set. `scheduleInvocation` (`:731-752`) performs the park.

```ts
result.invocation.queueScheduledAt = scheduledAt
result.finished = false
```

### How `delay` parks

`DelayHandler.execute` computes a wake time from `state.currentAction.startedAtTimestamp` and returns `{ scheduledAt }` (`actions/delay.ts:23-27`). Its comment at `:18-22` records the rule that matters for any new parking step: park **without** advancing `currentAction`, because an eager advance lets the subscription matcher wake the job at the wrong step.

`wait_until_time_window.ts:14-30` is the same shape.

### How `wait_until_condition` parks and wakes

`actions/conditional_branch.ts:36-109` serves both `conditional_branch` and `wait_until_condition`. The wake is event-driven: the handler reads `eventMatched` off `state.currentAction` (`:54-62`), a field an external consumer wrote. `checkConditions` (`:111-151`) re-parks on a 10 minute poll cap when nothing matched, which is a backstop for the event path, not the primary mechanism.

### How a hog function suspends on `fetch` and resumes

The Hog `fetch()` call does no I/O. It registers intent (`nodejs/src/cdp/async-functions/fetch-handler.ts:30-39`).

```ts
result.invocation.queueParameters = fetchQueueParameters
```

`HogExecutorAsyncService.executeWithAsyncFunctions` (`services/hog-executor-async.service.ts:90-179`) then branches on `queueParameters.type`.

```ts
const queueParamsType = nextInvocation.queueParameters?.type
if (['fetch', 'sendPushNotification', 'email'].includes(queueParamsType ?? '')) {
```

That list at `:106` is the dispatch table a new transport joins. `fetch` runs inline in the same worker (`:124-132`); only `email` is a real queue hop. The response is pushed straight onto the VM stack at `:505-506`, and a retry re-parks the same invocation by setting `queueScheduledAt` (`:462`).

`CYCLOTRON_INVOCATION_JOB_QUEUES` is `['hog', 'hogoverflow', 'hogflow', 'email']` (`nodejs/src/cdp/types.ts:279`). `fetch` is a queue-parameter type, not a queue. A new dynamic-function transport therefore needs no new queue, exactly as spec #22 concluded for the LLM node.

### The bridge between the two levels

`HogFunctionHandler.execute` (`actions/hog_function.ts:66-89`) is where an unfinished hog function becomes a parked workflow job.

```ts
result.invocation.state.currentAction!.hogFunctionState = functionResult.invocation.state
result.invocation.queue = functionResult.invocation.queue
result.invocation.queueParameters = functionResult.invocation.queueParameters
result.invocation.queueMetadata = functionResult.invocation.queueMetadata
...
return { scheduledAt: functionResult.invocation.queueScheduledAt ?? DateTime.now() }
```

Everything a resumed step needs is carried in `hogFunctionState`, `queueParameters`, and `queueMetadata`. A sandbox handle, a poll count, and a deadline all fit there with no schema change.

### Where the park becomes a database row

`CyclotronJobQueuePostgresV2.queueInvocationResults` (`services/job-queue/job-queue-postgres-v2.ts:192-227`) turns the in-memory `queueScheduledAt` into `job.reschedule(...)`, and the worker writes it (`services/cyclotron-v2/worker.ts:449-470`).

```
status = 'available', lock_id = NULL, ... scheduled = $3
```

The dequeue predicate is `status = 'available'` ordered by `(queue_name, priority, scheduled)` (`rust/cyclotron-node-migrations/20260303000001_initial_schema.sql:1-30`). So "park until time T" and "wake now" are the same write with a different `scheduled`.

The older Rust crate keeps a richer enum, `Available | Running | Completed | Failed | Paused | Canceled` (`rust/cyclotron-core/src/types.rs:11-18`), and `Worker::set_scheduled_at` (`rust/cyclotron-core/src/worker.rs:255-269`) carries the comment that sleeping, retry backoff and scheduling are one operation. The production Node path does not use this crate, and its status enum has no `paused`. Do not plan around `Paused`.

### How a result becomes a workflow variable

`HogFlowExecutorService.trackActionResult` (`hogflow-executor.service.ts:790-869`) writes `handlerResult.result` into `state.variables`, resolving `result_path` with lodash `get` and optionally spreading an object into `${key}_${prop}` keys.

The cap is flat and total (`:847-863`).

```ts
const resultSize = Buffer.byteLength(JSON.stringify(result.invocation.state.variables), 'utf8')
if (resultSize > 5120) {
```

Over the cap, the keys just written are deleted and the step throws. This is the binding constraint on what a sandboxed function may return, and it is a property of the workflow engine, not of any sandbox.

## 2. The two nearest precedents

### Precedent A: the LLM action transport (`feat/workflows-llm-action-cdp`)

The branch went further than spec #22 described, and the extra part is the part this ticket needs.

**What the worker sends.** `POST {siteUrl}/api/projects/{teamId}/workflow_llm_generations/` with `Authorization: Bearer {team.secret_api_token}` (`origin/feat/workflows-llm-action-cdp:nodejs/src/cdp/services/llm-generation.service.ts:305-355`). The body is `{invocation_id, hog_flow_id, prompt, model, output_fields, wake_token}`. The team secret token is a credential the CDP already holds, which is why this path needed no new auth.

**How it learns the job is done.** Not by polling. The Django task emits an internal Kafka event `$workflows_llm_generation_finished` (`products/workflows/backend/services/llm_generation.py:140-159`). The subscription matcher, the same consumer that serves `wait_until_condition`, prefilters raw message bytes for that name and parses out `{invocation_id, wake_token}` (`consumer.ts:724-747`). It then wakes the job.

The design rule is written in the method's own docstring (`consumer.ts:749-754`).

```
* Wakes the parked llmGenerate jobs a generation-finished event addresses. The event is a
* wake-only signal: the job is pulled to `scheduled = NOW()` untouched, re-enters the
* generation service, and collects its result through the authenticated retrieve. A missed or
* lost wake is therefore never fatal - the job's own backup poll ladder still runs.
```

Three properties matter for a sandbox callback.

1. **The wake carries no payload.** The result travels back over an authenticated `GET`, initiated by the worker. An untrusted caller can at most make the job look sooner, never change what it reads.
2. **A `wake_token` in the parked job's own `queueMetadata` is the authority** (`consumer.ts:764-772`). An event whose token does not match belongs to another incarnation of the step and is ignored.
3. **The wake is an optimization, not the contract.** `BACKUP_POLL_MARKS_SECONDS = [60, 180, 300]`, measured from acceptance, is the safety net (`llm-generation.service.ts:26-29`). A lost wake costs latency, not correctness.

**Limits on that branch.**

| Parameter | Value | Source |
|---|---|---|
| Submit timeout | 5 s | `llm-generation.service.ts:17` |
| Retrieve timeout | 3 s | `llm-generation.service.ts:18` |
| Poll interval, preview and retry only | 2 s | `llm-generation.service.ts:21` |
| Backup poll ladder | 60 s, 180 s, 300 s | `llm-generation.service.ts:27` |
| Max step executions | 20 | `llm-generation.service.ts:32` |
| Throttle bounces | 10 | `llm-generation.service.ts:29` |
| Transport failures | 3 | `llm-generation.service.ts:35` |
| Preview deadline | 25 s | `llm-generation.service.ts:50` |
| Result payload | 4096 bytes, 80% of the 5 KB variable cap | `products/workflows/backend/tasks/llm_generate.py:47-49` |
| Wall clock in the task | 60 s, Celery 65 s soft / 90 s hard | `llm_generate.py:57, 218-219` |
| Concurrency | 30 global, 5 per team | `posthog/settings/celery.py:28-33` |

State lives in Redis, keyed `workflow_llm_generation:{team_id}:{record_id}`, with a dedupe id that is a SHA-256 of the request (`products/workflows/backend/services/llm_generation.py:79-89`). There is no Django model. The endpoint authenticates with `TeamSecretTokenAuthentication` and is allow-listed by view name in `posthog/permissions.py:346-348`.

**What transfers directly.** All of it. Swap the Celery generation task for a sandbox run, and the transport is unchanged: submit returns a handle, the worker parks, a finished event wakes it, the worker retrieves the result over an authenticated call, the result lands in `output_variable`.

### Precedent B: `products/tasks/` sandbox runs

This is the only place PostHog runs untrusted code on its own infrastructure, and it is further along than the ticket assumed.

**Provider selection** (`products/tasks/backend/logic/services/sandbox.py:625-644`). `SANDBOX_PROVIDER` is read from the environment (`posthog/settings/temporal.py:47-49`); `docker` is gated on `DEBUG` or `TEST` (`sandbox.py:573-583`), and everything else defaults to Modal.

```python
# Default to Modal everywhere
from .modal_sandbox import ModalSandbox
return ModalSandbox
```

**Isolation.** Modal's gVisor container by default, with a stronger tier requested through `experimental_options = {"vm_runtime": True}` (`modal_sandbox.py:749-751`).

**Egress control, two independent layers.** At the platform, `block_network` and `outbound_domain_allowlist` are passed straight to `modal.Sandbox.create` (`modal_sandbox.py:752-757`). Inside the box, a tool called agentsh enforces policy at the syscall level (`products/tasks/backend/logic/services/agentsh.py:239-240`).

```
Network policy enforcement happens at the syscall level (ptrace) —
it does not depend on proxy environment variables.
```

The `SandboxConfig` comment records the trap that matters most (`sandbox.py:121-124`).

```python
outbound_domain_allowlist: list[str] | None = None
# gVisor only. An empty domain allowlist means unrestricted network in
# Modal, so callers that require no egress must state it explicitly.
```

**Resources.** `memory_gb: float = 16`, `cpu_cores: float = 4`, `disk_size_gb: float = 64`, `default_execution_timeout_seconds: int = 10 * 60` (`sandbox.py:97-120`). These are defaults for a coding agent, not for a workflow step. A dynamic function would want a far smaller box and a far shorter timeout, and both are already parameters.

**Dependencies.** Full. The base image carries Node 24 with npm, yarn, pnpm and tsc, plus Python and build tooling (`products/tasks/backend/sandbox/images/Dockerfile.sandbox-base:1-56`).

**Startup cost.** Provisioning is a multi-activity Temporal sequence with 5 minute timeouts per step (`products/tasks/backend/temporal/process_task/workflow.py:1238-1249`), including image resolution, health probes and repository clone. This is the finding that decides the prototype: the tasks sandbox as configured is minutes to warm, and a workflow step needs seconds. The provider is right; the configuration is not.

**How a run reports back.** `POST /api/projects/<project_id>/tasks/<task_id>/runs/<run_id>/event_stream/`, matched by regex and short-circuited before Django routing in `posthog/asgi.py:146-153`. Auth is a JWT with audience `posthog:sandbox_event_ingest` and claims `{run_id, task_id, team_id, sandbox_id}` (`products/tasks/backend/logic/services/connection_token.py:22-41`), minted in the `start_agent_server` activity and passed into the sandbox. Body limits are explicit: 1 MB per line, 5 MB per request, 1000 events (`products/tasks/backend/logic/stream/event_ingest.py:41-43`). Durable output goes to object storage at `tasks/logs/team_<id>/task_<id>/run_<run_id>.jsonl` (`products/tasks/backend/models.py:1960-1967`).

**The reuse is already happening.** `products/streamlit_apps/` runs user Python in a per-app Modal sandbox with egress locked to the callback and OTEL hosts (`products/streamlit_apps/backend/logic/app_runtime.py:90-141`). `products/notebooks/` runs a Jupyter kernel in one (`products/notebooks/backend/kernel_runtime.py:26-31, 772`). `products/canvas/` builds user React in one (`products/canvas/backend/build_service.py:143-160`). A workflows caller would be the fourth, not the first.

## 3. Postbacks and external resume

### There is no resume endpoint

No route, task, or consumer accepts "resume invocation N with this payload". Two things come close, and between them they contain every part of one.

### Close thing 1: the subscription matcher writes job state directly

`nodejs/src/cdp/consumers/cdp-hogflow-subscription-matcher.consumer.ts` is a Kafka consumer, a separate process from the worker that parked the job. It finds parked jobs by `(team_id, distinct_id)` or `(team_id, person_id)` (`:425-440`).

```sql
SELECT id, team_id, function_id, parent_run_id, action_id, distinct_id, person_id
FROM cyclotron_jobs
WHERE status = 'available'
  AND scheduled > NOW()
  AND function_id = ANY($5::uuid[])
```

Then it wakes them (`:547-553`).

```sql
UPDATE cyclotron_jobs cj
SET scheduled = NOW(), state = u.state
FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::bytea[]) AS state) u
WHERE cj.id = u.id AND cj.status = 'available'
```

This is a payload-carrying external resume in everything but name. The payload is the rewritten `state` blob; the wake is `scheduled = NOW()`. It deliberately does not filter on `queue_name`, because a parked step can sit on any queue (`:417-421`).

### Close thing 2: Django calls the CDP to move parked jobs

`POST /api/projects/:team_id/hog_flows/:id/reschedule_parked` (`nodejs/src/cdp/cdp-api.ts:266-269`) exists so Django can pull wake times forward after an author shortens a delay. Its comment (`:1009-1017`) states the auth model.

```
// Auth: a scoped JWT minted by Django per call, pinned to this team + workflow — NOT the
// fleet-wide internal secret (the route is exempted from that middleware). Fails closed when
// the key isn't provisioned.
```

A per-call, per-object scoped JWT minted by the party that dispatched the work is exactly the credential a sandbox callback wants. The pattern is shipped; only the payload direction is missing.

### The public ingress that a sandbox would post to

The CDP already terminates unauthenticated public traffic (`cdp-api.ts:280-299`).

- `POST|GET /public/webhooks/:webhook_id`: the `template-source-webhook` ingress, capped at 512 KB by `publicBodySizeLimit` (`:280-287`).
- `POST /public/webhooks/dwh/:webhook_id`: the warehouse source variant. Its URL is built in Python at `products/data_warehouse/backend/logic/external_data_source/webhooks.py:26`.
- `GET /public/m/pixel`: the email tracking pixel.
- `POST /public/m/ses_webhook`: the SES delivery postback.

These all *create* work. None resumes existing work. A `/public/workflows/resume/:token` route would sit in the same table, behind the same body-size guard, and reuse the `generate_preferences_token` / `validate_preferences_token` pair at `:274-275` as the token precedent.

### What a resume endpoint would need

1. A token that names the invocation, the action, and an expiry, minted at dispatch. The scoped-JWT precedent at `:1009-1017` and the preferences-token pair at `:274-275` both fit.
2. Single use, or at least idempotent. The wake is a raw `UPDATE ... WHERE status = 'available'`, so a second POST after the job has been re-locked is a silent no-op today, which is the right failure but not a stated contract.
3. A size guard on the payload, because the result lands in a 5 KB total variable budget.
4. A decision on what happens when nothing is parked. The matcher's answer is "the `WHERE status = 'available'` matched zero rows"; a callback needs a real status code.

### The two task-run postbacks, which are the real precedent

`products/tasks/` has the only shipped "the sandbox calls PostHog back" path.

- `internal/tasks/runs/<run_id>/agent-proxy-callback/` (`products/tasks/backend/agent_proxy_callback.py`, routed at `posthog/urls.py:562-563`, `csrf_exempt`). It is deliberately not a DRF viewset action; the header comment at `:20-25` says auth is the sandbox event-ingest JWT.
- `/api/projects/<project_id>/tasks/<task_id>/runs/<run_id>/event_stream/` (`products/tasks/backend/logic/stream/event_ingest.py:38-40`), authorized by the same JWT cross-checked against the URL parameters (`:480-502`).

The auth model is two factors, and the reasoning is written down (`agent_proxy_callback.py:85-93`).

```python
# Service-to-service guard: the event-ingest JWT is also held by the sandbox, so the JWT alone
# does not prove the caller is the agent-proxy. Require the shared secret so a sandbox cannot
# drive this callback directly ...
expected_secret = settings.AGENT_PROXY_CALLBACK_SECRET
```

It fails closed when the secret is unset, outside dev and test. Copy this reasoning: a token the sandbox holds cannot on its own prove the caller is the sandbox and not the customer code inside it.

The callback then advances the job by signalling Temporal (`products/tasks/backend/models.py:1936-1957`).

```python
handle = client.get_workflow_handle(self.workflow_id)
asyncio.run(handle.signal(ProcessTaskWorkflow.heartbeat, arg=agent_active))
```

Temporal gives that path a resume primitive Cyclotron does not have. A Cyclotron equivalent is a `state` write plus `scheduled = NOW()`, which is what the subscription matcher already does.

## 4. Sandboxing already in the repository

| Mechanism | Isolation | Dependencies | Startup | Where it runs | Status |
|---|---|---|---|---|---|
| HogVM | Language level. A closed 58-opcode bytecode interpreter with no filesystem, network, or `eval` opcode | None. `import` loads another Hog bytecode chunk, not an npm module | Microseconds | In process, Node CDP worker; also Rust in `cohort-core` and `cymbal` | Live |
| `common/plugin_transpiler` | None. It is a Babel build step | Fixed presets | One subprocess per build | Django shells out to `node dist/index.js` | Live, but it produces browser JS |
| Legacy plugins | None needed. A fixed allowlist compiled into the binary | Fixed | None | In process, Node CDP worker | Live, closed set |
| Tasks / Streamlit / Notebooks sandbox | Modal gVisor container, or a VM tier | Full. `npm install`, `pip install` | Minutes, Temporal-provisioned | Modal in production, Docker in dev | Live |
| Canvas build | Modal sandbox in production, unsandboxed local process in dev and test | Fixed set, no arbitrary npm | Seconds to minutes | Modal | Live |

### HogVM cannot be the answer

`common/hogvm/typescript/src/operation.ts:1-58` is the full instruction set. There is no `eval`, no `new Function`, no dynamic import of JavaScript. `CALL_GLOBAL`'s `'import'` case (`execute.ts:741`) resolves a name in a host-supplied program map. The stdlib is about 90 pure functions (`stl/stl.ts:490` onward), and the only built-in async function is `sleep` (`stl/stl.ts:1803-1810`).

HogVM is a good sandbox and the wrong language. Shipping TypeScript through it would mean writing a TypeScript-to-Hog compiler, which is a larger project than the sandbox.

### What is explicitly absent

- No `isolated-vm` and no `vm2` anywhere, in source or in any `package.json`.
- No `nsjail`, `firecracker`, `wasmtime`, or `wasmer`.
- No Deno.
- The server-side plugin VM that once ran uploaded plugin JavaScript is retired. `nodejs/src/plugin-scaffold.ts:1-4` marks the remains as legacy types only, and the surviving plugins are a hardcoded map (`nodejs/src/cdp/legacy-plugins/index.ts:1-38`).
- The only WASM is `common/hogql_parser/parser_wasm.cpp`, a browser build of the HogQL parser, not a runtime.
- `products/warehouse_sources/backend/temporal/data_imports/sources/e2b/` is a warehouse import source for E2B's own billing data. It is not the sandbox vendor's SDK, and a grep hit there is a false positive.

The conclusion: **PostHog runs no untrusted JavaScript on its own servers today.** Site apps run in the visitor's browser. Everything server-side is either Hog bytecode or a Modal sandbox.

## 5. Sandboxing options outside the repository

From primary vendor documentation only. Cold-start figures are the vendor's own words, not benchmarks under load, and they are not comparable with each other.

| Vendor | Isolation | Cold start | Dependencies | Egress control | Pricing shape | Callback to PostHog |
|---|---|---|---|---|---|---|
| [CF Workers for Platforms](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/get-started/dynamic-dispatch/) | V8 isolate, 128 MB | Not documented | Bundled at upload; `nodejs_compat` covers ~30 `node:` modules | [Outbound Workers](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/outbound-workers/) intercept every user `fetch()` | [$25/mo + $0.30/M req + $0.02/M CPU-ms + $0.02/script over 1,000](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/platform/pricing/) | Result is the HTTP response; no outbound call needed |
| [CF Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/) | V8 isolate created at runtime | ["start in milliseconds"](https://developers.cloudflare.com/changelog/post/2026-03-24-dynamic-workers-open-beta/) | Modules supplied inline; no npm install | [`globalOutbound: null` cuts all network, or route through a gateway Worker](https://developers.cloudflare.com/dynamic-workers/usage/egress-control/) | Workers requests + CPU-ms; per-worker-created charge announced, not yet billing | Via a `globalOutbound` gateway that injects the credential |
| [Deno Deploy subhosting](https://docs.deno.com/subhosting/manual/) | Not stated in the docs | Deploy "less than a second … to around ten seconds"; per-request not documented | npm and `node:` compatible; code shipped inline | **Not documented** | [$200/mo Builder, $2/M req over 25M](https://deno.com/deploy/pricing) | Result is the HTTP response |
| [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) | [Firecracker microVM, dedicated kernel](https://vercel.com/docs/sandbox/concepts) | "Milliseconds" | Full root Linux, Node LTS, `npm install` works | [`networkPolicy` deny-all plus domain and CIDR allowlist, updatable at runtime, with credential brokering](https://vercel.com/docs/sandbox/concepts/firewall) | [$0.128/active-CPU-hr + $0.0212/GB-hr, 1-minute minimum + $0.60/M creations](https://vercel.com/docs/sandbox/pricing) | Best fit. The firewall injects the key, so the code never holds it |
| [E2B](https://e2b.dev/security) | Firecracker microVM, own kernel | Not documented | Full Linux VM, arbitrary packages | [`allowInternetAccess: false` plus IP/CIDR and wildcard-domain rules, `updateNetwork()` at runtime](https://docs.e2b.dev/network/internet-access.md) | [$0.000014/vCPU-s + $0.0000045/GiB-s, no creation fee](https://e2b.dev/pricing) | Allowlist the host; no credential injection, so the token sits inside |
| [Modal sandboxes](https://modal.com/docs/guide/sandbox) | [gVisor](https://modal.com/docs/guide/security) | ["about one second"](https://modal.com/docs/guide/cold-start) | Any OCI image | [`block_network`, `outbound_cidr_allowlist`, `outbound_domain_allowlist`](https://modal.com/docs/guide/sandbox-networking) | [$0.0000131/core-s + $0.00000222/GiB-s](https://modal.com/pricing) | Already how `products/tasks/` works |
| [Runloop devboxes](https://docs.runloop.ai/docs/devboxes/overview) | "Virtual machine technology"; hypervisor not named | "a few seconds" to first command | Full VM, root | [`allowed_hostnames` with wildcards, deny-all via empty list](https://docs.runloop.ai/docs/network-policies) | [$0.108/CPU-hr + $0.0252/GB-hr](https://runloop.ai/pricing) | Allowlist the host |
| [Fly Machines](https://fly.io/docs/machines/) | [Firecracker microVM](https://fly.io/docs/reference/architecture/) | "subsecond" | Any OCI image, full root | [Ports and protocols only. No destination or CIDR filtering, and changes need a restart](https://fly.io/docs/machines/guides-examples/network-policies/) | [Per-second on a CPU/RAM preset, ~$0.0028/hr up](https://fly.io/docs/about/pricing/) | Cannot scope egress to a host |

Concurrency caps, which are likely the binding constraint at workflow volume: E2B 100 on the $150/mo tier and 600 on the next one up; Modal 100 on Starter and 5,000 on the $250/mo Team plan; Vercel 10 on Hobby and 10,000 on Pro; Runloop 3 on trial and undocumented above that; Fly undocumented.

Four things follow.

**The split is isolate versus microVM, and it is the whole decision.** A V8 isolate starts in milliseconds and cannot `npm install`. A microVM starts in hundreds of milliseconds to seconds and can. Which side a dynamic function step belongs on is a product question about whether user code needs packages, not a research finding.

**PostHog already owns a working answer.** Modal is configured, paid for, and used by four products. gVisor is a weaker boundary than Firecracker on paper, and that is worth weighing explicitly for customer code, but the egress story (`outbound_domain_allowlist` plus the syscall-level agentsh policy in section 2) is already stronger than most of this table.

**Vercel Sandbox is the only vendor whose egress layer solves the credential problem.** Allowlist the PostHog host and have the firewall inject the key, so untrusted code posts a result back without ever holding a token. Cloudflare Dynamic Workers reaches the same place through a `globalOutbound` gateway binding. This matters less if the result returns through the worker's authenticated retrieve, which is what section 8 proposes, and it is the reason that design is preferable.

**Three gaps could not be closed from documentation** and would need a vendor conversation: Deno Deploy's egress control, Runloop's paid concurrency limit, and Fly's per-organization machine cap.

## 6. What the JSON definition carries

### No new action type is needed

A `function` action already carries an arbitrary input bag (`nodejs/src/cdp/schema/hogflow.ts:47-56`).

```ts
type: z.literal('function'),
config: z.object({
    template_uuid: z.string().optional(),
    template_id: z.string(),
    inputs: z.record(z.string(), CyclotronInputSchema),
    mappings: z.array(CyclotronInputMappingSchema).optional(),
}),
```

A dynamic function step is a `function` action whose `template_id` names a new template and whose `inputs` carry the code plus the arguments. Every common field it needs already exists on `_commonActionFields` (`hogflow.ts:17-33`): `on_error`, `filters`, and `output_variable` with `result_path` and `spread`.

This matters for issue #34. The v1 authoring surface does not need a place to put a function value; it needs a template whose input happens to be a string of code. Nothing in the emit step has to change to leave room.

### Three ways to represent the code

**Inline source string.** One `code` input of type `string`. It diffs, it round-trips, and it needs no upload step, no storage, and no second API call. The cost: the whole program sits in the definition, so a large function bloats every read of the workflow, and the 5 KB variable cap has a sibling problem in definition size. It is also the only option where the SDK's emit step stays a pure function of the source file.

**Reference plus content hash.** A `{code_ref, sha256}` pair, with the body uploaded separately. It keeps the definition small and makes the revision diff readable. The cost is a second write path, a storage model, a garbage-collection question, and a way for `push --dry-run` to diff something it must fetch. It also breaks the SDK's current property that running the file is the whole operation.

**Pre-bundled artifact.** The SDK bundles the function with its dependencies and uploads the bundle. It is the only option that answers "can I `import` a package", and it is the most expensive: a bundler in the SDK, a build step in CI, and an artifact store.

**The recommendation is inline source for the prototype, with the field named so the other two remain reachable.** An input named `code` taking a string can later accept `{ref, sha256}` if the template's `inputs_schema` grows a second input and the handler branches on which is present. Nothing about choosing inline now forecloses the other two, because the discriminator lives in the template's input schema, not in the action type.

### What each means downstream

- **The SDK's emit step.** Inline is a template literal in the workflow source, serialized as-is. A reference needs an upload before the definition is valid, which means `emit` and `push` stop being separable.
- **Revisions and diffs.** Inline shows the code change in the workflow diff, which is the whole pitch of workflows as code (spec map #23, frame item 4). A hash shows that something changed and points elsewhere.
- **Read-only mode** (research on issue 63). A code-managed workflow whose function bodies are inline is fully described by its source file, so the read-only guard has nothing extra to cover. A reference model adds a second mutable thing the UI must lock.

### Secrets

`HogFlow.encrypted_inputs` exists, and `HogFlowFunctionsService.getSensitiveValues` (`hogflow-functions.service.ts:57-84`) collects secret-marked input values so a test run can redact them from logs. Anything handed to a sandbox is readable by the code inside it, so a dynamic function must not receive secret inputs. That is a rule to state, not a mechanism to build.

## 7. Security and limits

### What the CDP runtime enforces today

| Limit | Value | Source |
|---|---|---|
| Async steps per invocation | 5 | `services/hog-executor.service.ts:27`, passed at `:209` |
| Hog execution wall clock | 550 ms | `cdp-services.ts:448` reading `CDP_WATCHER_HOG_COST_TIMING_UPPER_MS` (`cdp/config.ts:199`) |
| HogVM memory | 64 MB | `common/hogvm/typescript/src/constants.ts:2`, enforced in `execute.ts:199-202` |
| HogVM call stack | 1000 frames | `constants.ts:5`, enforced at `execute.ts:845-846` |
| Log lines per invocation | 25 | `hog-executor.service.ts:28` |
| Fetch timeout ceiling | 10 s | `cdp/utils/cdp-fetch.ts:11` |
| Fetch retries | 3, base 1 s, max 30 s | `cdp/config.ts:259-261` |
| Public request body | 512 KB | `cdp-api.ts:280-286` |
| Workflow variables, total | 5 KB | `hogflow-executor.service.ts:847-849` |

The 550 ms budget is the number that decides the architecture. The HogVM library default is 5000 ms (`constants.ts:3`); the CDP runs its Hog an order of magnitude tighter, because the worker must not block. No dynamic function can run in-process under that budget, so a dynamic step is always a park-and-resume step, never an inline one. That is the same conclusion spec #22 reached for the LLM node.

There is no response body size cap on fetch. `_fetch` reads the whole body (`nodejs/src/common/utils/request.ts:329-372`). A sandbox result path needs its own cap.

### Egress is already guarded, and the guard is worth inheriting

All CDP outbound HTTP runs through `nodejs/src/common/utils/request.ts`.

- Scheme allowlist, `http:` and `https:` only (`:96-113`).
- IP literals validated directly against global-unicast ranges, blocking loopback, link-local `169.254.0.0/16`, `0.0.0.0/8`, and broadcast (`:118-190`).
- A custom DNS resolver re-validates every resolved address (`:178-235`), which is DNS rebinding protection, not just a first-hop check.
- Blocked requests are counted and attributed to team and function (`cdp/utils/cdp-fetch.ts:47-69`).
- `SecureRequestError` is explicitly not retriable (`cdp-fetch.ts:143-168`).

This protects PostHog's own network from a customer's Hog. It does nothing for a sandbox, because the sandbox is not in this process. Egress control for user TypeScript is a property of the chosen sandbox, and it is the single hardest requirement to satisfy.

### What the sandbox must prevent

1. **Secrets exposure.** Workflow inputs can be `secret` (`hogflow-functions.service.ts:57-84` collects them so test runs can redact them from logs). Anything shipped to a sandbox is readable by the code in it. A dynamic function must receive rendered, non-secret inputs only, or the secret model has to change.
2. **Arbitrary egress.** The CDP's SSRF guard does not travel. A sandbox with open egress lets a customer reach their own internal network from PostHog's IP space, and lets them exfiltrate whatever they were handed.
3. **Resource exhaustion.** CPU, memory, and wall clock, per invocation and per team. The HogWatcher already degrades and disables expensive hog functions by cost (`cdp/config.ts:196-217`), and its cost inputs are timings. A sandbox step needs the same treatment or it becomes the cheapest way to burn a worker.
4. **Cross-tenant access.** One sandbox per invocation, or a provably fresh isolate. Reuse across teams is the failure that cannot be recovered from.
5. **Self-reference.** `services/self-loop-guard` already exists for hog functions that fetch PostHog's own ingest endpoint (imported at `hog-executor-async.service.ts:29-36`). A sandbox that can call back into PostHog inherits that problem and its guard.

### Which enforcement transfers

Transfers as written: the async-step budget, the fetch retry and backoff policy, the public body-size limit, the 5 KB variable cap, and the HogWatcher cost model.

Does not transfer: the HogVM memory and timeout limits, and the SSRF guard. Those are properties of running in this process.

## 8. Prototype proposal

**The smallest demoable thing is a `function` action on a new hidden template whose Hog body is one call to a new registered async function, `runSandboxedFunction`, which submits the code and inputs to a small service, parks the job, and collects the result over an authenticated retrieve when a finished event wakes it.**

Every seam it needs is in place. The template is a file in `nodejs/src/cdp/templates/_destinations/`, following the shape of the LLM branch's `workflow-llm.template.ts`. The async function is a file in `nodejs/src/cdp/async-functions/` registered through `registerAsyncFunction` (`async-function-registry.ts:29-34`), and `example.ts:12-24` documents the return-value contract it must satisfy: a queueing handler stages `result.invocation.queueParameters` and lets the matching worker push the response onto the VM stack once the real work finishes. The dispatch branch is one entry added to the list at `hog-executor-async.service.ts:106`, next to `fetch`, `sendPushNotification` and `email`. Parking is `queueScheduledAt`, which `HogFunctionHandler` already propagates from the inner invocation to the workflow job (`actions/hog_function.ts:66-89`), and the sandbox handle, the wake token, the execution count and the deadline all fit in `queueMetadata` with no schema change. Waking is the `$workflows_llm_generation_finished` pattern: the service that ran the code emits an internal event, the subscription matcher prefilters for it and pulls the job to `scheduled = NOW()` after checking the wake token against the parked job's own metadata (`consumer.ts:749-772`). The result comes back through an authenticated `GET`, never through the wake, so the callback path stays a signal an attacker can at most replay. The result lands in `output_variable` through the existing `trackActionResult` (`hogflow-executor.service.ts:790-869`) and is bounded by the same 5 KB cap. No new Cyclotron queue, no new action type, no change to the definition schema.

### What changes where

**The worker (`nodejs/src/cdp/`)**

- `async-functions/run-sandboxed-function.ts`: a new registered async function that stages `queueParameters: {type: 'sandboxedFunction', code, args}`. Registration requires an import in `async-functions/index.ts` (`example.ts:10`).
- `services/hog-executor-async.service.ts:106`: one entry in the dispatch list, and one branch beside the `fetch` branch.
- `services/sandboxed-function.service.ts`: submit, retrieve, reschedule-on-pending, and the failure taxonomy. Copy the structure of `llm-generation.service.ts` including the backup poll ladder, because the wake must stay an optimization.
- `consumers/cdp-hogflow-subscription-matcher.consumer.ts`: a second prefiltered event name and a second wake path, or a generalization of the one the LLM branch adds.
- `templates/_destinations/.../sandboxed-function.template.ts`: `status: 'hidden'`, one `code` input of type `string`, one `args` input of type `json`, plus a `mock` so the editor's test panel works with real HTTP requests turned off.
- `schema/cyclotron.ts`: one member on the queue-parameters union.

**The API (Django)**

- A workflows-owned pair, `POST /api/projects/:team_id/workflow_sandbox_runs/` and `GET .../<id>/`, registered in `products/workflows/backend/routes.py`. Auth is `TeamSecretTokenAuthentication` with two view names added to the allow-list in `posthog/permissions.py`, exactly as the LLM branch does (`posthog/permissions.py:346-348`). This is the credential the CDP already holds.
- State in Redis with a request-hash dedupe key, no Django model, following `products/workflows/backend/services/llm_generation.py:79-89`.
- A task that provisions a sandbox through `products/tasks/backend/facade/sandbox.get_sandbox_class_for_backend`, runs the code, captures the result, writes the terminal record, and emits the finished event. Egress must be stated explicitly, because an empty allowlist means unrestricted network (`products/tasks/backend/logic/services/sandbox.py:121-124`).
- A per-team submit throttle and a concurrency cap. Both are copy-paste from the LLM branch.

**The SDK (the workflows-as-code prototype)**

- A `fn` step that takes a TypeScript arrow function, serializes its source with `Function.prototype.toString`, and emits a `function` action pointing at the new template with the source in the `code` input. That is the whole change, and it is why section 6 recommends inline source.
- Structural validation that the function body is present and under a size bound, with the `status` / `message` / `why` / `fix` error shape this effort standardizes on.

### What can be faked for a demo

- **The sandbox.** Run the submitted code in a local subprocess, or in a pre-warmed Modal box with a fixed image and no dependency install. The transport is the thing being demonstrated, not the isolation. State loudly that the fake has no isolation.
- **The wake event.** Skip Kafka entirely and let the backup poll ladder be the only mechanism. A 2 second poll shows the loop closing, and the wake is a latency optimization the real version adds.
- **Dependencies.** A fixed allowlist of imports, or none. `products/canvas/` already ships this compromise (`products/canvas/packages/canvas_builder/package.json:5-14`).
- **Throttles, quotas, and billing.** Omit entirely.
- **The editor panel.** The step can be authored through the API only. The workflow builder does not need a code editor for the loop to be demoable.

### What cannot be faked

The 5 KB variable cap, the `wake-is-a-signal` rule, and the requirement that the sandbox receives no secret inputs. Each of those is a property the real design must have, and a prototype that violates one teaches the wrong lesson.

