# Contributing to workflows

This product is designed so other teams can add their own workflow trigger types, action nodes, and any backend functionality that those nodes need.

At a high level:

- **Frontend (workflows editor)** uses registries to discover which trigger types and action nodes to show.
- **Backend (CDP Hog templates)** defines what a “function node” actually does via a Hog function template (`template_id`).
- **Backend (async functions)** provides any custom runtime functionality used by Hog code (e.g. HTTP requests, enriched lookups, etc.).

## How the pieces connect

When you add a new “hog function” action node, the wiring is:

1. Frontend action node sets `config.template_id`.
2. Backend template with the same `id` contains the Hog code run for that node.
3. Hog code may call async functions (e.g. `postHogGetTicket(...)`).
4. Async function implementation is registered in the Node service and executed at runtime.

Concrete end-to-end example:

- Frontend action node uses `template_id: 'template-posthog-get-ticket'`:
  - products/workflows/frontend/Workflows/hogflows/registry/actions/conversations.ts
- Backend template defines `id: 'template-posthog-get-ticket'` and calls `postHogGetTicket(...)`:
  - nodejs/src/cdp/templates/\_destinations/posthog_conversations/posthog-get-ticket.template.ts
- Backend async function registers `postHogGetTicket`:
  - nodejs/src/cdp/async-functions/conversations.ts

## Frontend: adding a trigger type

Trigger types extend the trigger selector UI in the workflow editor. A trigger type is responsible for:

- How it appears in the dropdown (label, description, icon)
- How it maps to/owns a config (`matchConfig`)
- How to build an initial config when selected (`buildConfig`)
- Optionally, how to render extra configuration UI (`ConfigComponent`)

### 1) Implement and register the trigger definition

Create a new file under:

- products/workflows/frontend/Workflows/hogflows/registry/triggers/

Then call `registerTriggerType(...)` from:

- products/workflows/frontend/Workflows/hogflows/registry/triggers/triggerTypeRegistry.ts

Example implementation:

- products/workflows/frontend/Workflows/hogflows/registry/triggers/conversations.tsx

Minimal skeleton:

```tsx
import { IconBolt } from '@posthog/icons'

import { registerTriggerType } from 'products/workflows/frontend/Workflows/hogflows/registry/triggers/triggerTypeRegistry'

registerTriggerType({
  value: 'my_product_something_happened',
  label: 'Something happened',
  icon: <IconBolt />,
  description: 'Trigger when something happens',
  // Optional: featureFlag: FEATURE_FLAGS.MY_FLAG,
  matchConfig: (config) => config.type === 'event' && /* detect your event filter config */ false,
  buildConfig: () => ({
    type: 'event',
    filters: {
      events: [{ id: '$my_event', type: 'events', name: 'My event' }],
    },
  }),
  // Optional: ConfigComponent,
})
```

### 2) Ensure it’s imported (registered)

Registration is done via module side effects. Your trigger file must be imported by the workflows frontend bundle.

The workflows registry entrypoint is:

- products/workflows/frontend/Workflows/hogflows/registry/triggers/index.ts

Add an import for your file there (pattern shown by `conversations`).

### 3) (Optional) Add a configuration UI

If your trigger needs extra UI beyond the standard “Event” filters, provide a `ConfigComponent`.

Reference:

- products/workflows/frontend/Workflows/hogflows/registry/triggers/conversations.tsx

Notes:

- `ConfigComponent` receives the workflow node; use `workflowLogic` actions to update `node.data.config`.
- Keep configs serializable and stable: configs are persisted as part of the workflow.

## Frontend: adding an action node

Action nodes shown in the “Build” toolbar come from:

- Built-ins in products/workflows/frontend/Workflows/hogflows/panel/HogFlowEditorPanelBuild.tsx
- Registered categories from products/workflows/frontend/Workflows/hogflows/registry/actions/actionNodeRegistry.ts

Each category contains one or more `CreateActionType` nodes (see type in products/workflows/frontend/Workflows/hogflows/hogFlowEditorLogic.tsx).

### 1) Add an action node category

Create a new file under:

- products/workflows/frontend/Workflows/hogflows/registry/actions/

Then call `registerActionNodeCategory(...)` from:

- products/workflows/frontend/Workflows/hogflows/registry/actions/actionNodeRegistry.ts

Example category:

- products/workflows/frontend/Workflows/hogflows/registry/actions/conversations.ts

Minimal skeleton:

```ts
import { registerActionNodeCategory } from 'products/workflows/frontend/Workflows/hogflows/registry/actions/actionNodeRegistry'

registerActionNodeCategory({
  label: 'My product',
  // Optional: featureFlag: FEATURE_FLAGS.MY_FLAG,
  nodes: [
    {
      type: 'function',
      name: 'Do a thing',
      description: 'Does a thing and stores the result.',
      config: { template_id: 'template-my-product-do-thing', inputs: {} },
      // Optional: output_variable: { key: 'thing', result_path: null, spread: true },
    },
  ],
})
```

### 2) Ensure it’s imported (registered)

As with triggers, registration is done via side-effect imports.

Add your file to:

- products/workflows/frontend/Workflows/hogflows/registry/actions/index.ts

The editor imports the registry entrypoint here:

- products/workflows/frontend/Workflows/hogflows/panel/HogFlowEditorPanelBuild.tsx

### 3) (Optional) Give the step a bespoke configuration panel

A `function` step renders its `inputs_schema` through the generic input renderer. When that is not enough (a picker fed by the workflow's own variables, a preview button, a grouped model list), branch on the template id in:

- products/workflows/frontend/Workflows/hogflows/steps/components/HogFlowFunctionConfiguration.tsx

The file already holds `isEmailStep`, `isPushStep`, and `isLlmStep` literal-id consts and returns a different body per branch. This is the cheap route: no new step type, no schema change, no backend work. Keep the generic renderer for the inputs that do not need custom UI (the "Generate text" step renders its `prompt` that way and hands only the rest to `LlmGenerateConfiguration`). Put the panel's business logic in a kea logic beside the component, not in hooks.

## Backend: adding a Hog function template (`template_id`)

Workflow “function” nodes run Hog code via Hog function templates. For a new action node, you typically add a new destination template and reference it by `template_id`.

### 1) Create the template file

Create a new template under:

- nodejs/src/cdp/templates/\_destinations/

Workflows-specific templates live under:

- nodejs/src/cdp/templates/\_destinations/posthog_workflows/

Conversations examples that are used by workflows live under:

- nodejs/src/cdp/templates/\_destinations/posthog_conversations/

Examples:

- nodejs/src/cdp/templates/\_destinations/posthog_conversations/posthog-get-ticket.template.ts
- nodejs/src/cdp/templates/\_destinations/posthog_conversations/posthog-update-ticket.template.ts

Guidelines:

- Choose a stable, unique `id` (this is what the frontend uses as `template_id`).
- For workflow-only templates, prefer `status: 'hidden'` so they don’t show up in generic template pickers.
- Keep `inputs_schema` accurate: it drives UI and validation.

### 2) Register it in the templates index

Templates are exported from a central list. Add an import and include it in `HOG_FUNCTION_TEMPLATES_DESTINATIONS`:

- nodejs/src/cdp/templates/index.ts

Reference for how existing workflows templates are added:

- Imports: `posthogGetTicketTemplate`, `posthogUpdateTicketTemplate`, `posthogSetHogflowVariableTemplate`
- List: `HOG_FUNCTION_TEMPLATES_DESTINATIONS`

## Backend: adding an async function

Async functions are Node-side functions callable from Hog code.

Example of a simple pattern and required `mock` implementation:

- nodejs/src/cdp/async-functions/example.ts

Example used by workflows templates:

- nodejs/src/cdp/async-functions/conversations.ts

### 1) Implement the async function

Add a new file under:

- nodejs/src/cdp/async-functions/

Then register it:

```ts
import { registerAsyncFunction } from '../async-function-registry'

registerAsyncFunction('myAsyncFn', {
  execute: async (args, context, result) => {
    // Validate args
    // Use context.hub services as needed
    // Write to result.invocation / result.logs / result.error
  },
  mock: (args, logs) => {
    // Used in the workflows “Test” tooling when real requests are disabled
    return { status: 200, body: {} }
  },
})
```

Notes:

- Always validate/guard your arguments. Throwing errors will surface in invocation logs.
- `mock` is product-facing in test tooling; keep its shape consistent with the real implementation.
- If you need a fetch request, follow the established `queueParameters` pattern used in:
  - nodejs/src/cdp/async-functions/conversations.ts
- A queue-parameter type that is not a plain fetch needs four edits, and skipping any one of them fails at run time rather than at build time. `llmGenerate` (the "Generate text" step) is the worked example:
  1. **Schema.** Add the variant schema, its `z.infer` type export, and its membership in the `CyclotronInvocationQueueParametersType` union in nodejs/src/cdp/schema/cyclotron.ts. The async function `.parse()`s the args into `result.invocation.queueParameters`; it does not touch the VM stack.
  2. **Dispatch.** In nodejs/src/cdp/services/hog-executor-async.service.ts, add the type string to the allowlist array in `executeWithAsyncFunctions` **and** a branch that calls your service. The array alone throws `Unknown queue type`; the branch alone leaves the type unrouted, so the VM resumes on an empty stack ("Invalid HogQL bytecode, stack is empty, can not pop"). Add the service to `HogExecutorAsyncDependencies`, construct it in nodejs/src/cdp/cdp-services.ts, and stub it in nodejs/src/cdp/templates/test/test-helpers.ts, which builds the executor for every template test.
  3. **Test runs.** The branch forwards `options?.isTest ?? false` to the service. `llmGenerate` uses it to take a bounded in-process path: the editor's preview runs in the API process and is never dequeued again, so it polls in-process until the generation finishes instead of rescheduling. Only `mock_async_functions=false` reaches the service at all; with mocking on, the async function's own `mock` answers and no queue parameters are ever staged.
  4. **Rescheduling.** A call that is still pending comes back as a reschedule, never as a wait: `createInvocationResult` clears `queueParameters`, `queueMetadata`, `queuePriority`, and `queueScheduledAt`, so re-assign the ones you need and set `result.finished = false`. `llmGenerate` restores its queue parameters, carries its poll state (generation id, poll count, deadline) on `queueMetadata`, and sets `queueScheduledAt` 2 seconds out (`POLL_INTERVAL_SECONDS`) for as long as the endpoint answers 202. On the terminal answer it pushes the result envelope onto `result.invocation.state.vmState.stack` itself.
  - Service and shape to copy: nodejs/src/cdp/services/llm-generation.service.ts.

### 2) Import it so it actually registers

Async functions are registered via side-effect imports. Add your file to:

- nodejs/src/cdp/async-functions/index.ts

If you skip this step, your async function will never be available to Hog code.

## Frontend: adding a custom input type

The input configuration UI (`CyclotronJobInputs`) supports product-specific input types via a lazy renderer registry.
Built-in types (`string`, `number`, `boolean`, etc.) are handled directly in the switch statement.
Custom types are looked up in `CUSTOM_INPUT_RENDERERS` and lazy-loaded when rendered.

### 1) Create the renderer component

Create a React component in your product that default-exports a function accepting `CustomInputRendererProps`:

```tsx
import type { CustomInputRendererProps } from 'lib/components/CyclotronJob/customInputRenderers'

export default function MyCustomInput({ value, onChange }: CustomInputRendererProps): JSX.Element {
  return <input value={value} onChange={(e) => onChange(e.target.value)} />
}
```

### 2) Register it in the mapping

Add an entry to `CUSTOM_INPUT_RENDERERS` in:

- frontend/src/lib/components/CyclotronJob/customInputRenderers.ts

```ts
export const CUSTOM_INPUT_RENDERERS = {
  my_custom_type: lazy(() => import('products/my_product/frontend/components/MyCustomInput')),
}
```

The component is lazy-loaded via `React.lazy`, so no product code is bundled until the input type is actually rendered.

### 3) Add the type to the schema unions

Add your type string to `CyclotronJobInputSchemaType.type` in:

- frontend/src/types.ts
- nodejs/src/cdp/types.ts
- nodejs/src/cdp/schema/cyclotron.ts
- products/workflows/frontend/Workflows/hogflows/steps/types.ts

### 4) Use it in a template

Reference the type in your template's `inputs_schema`:

```ts
{
    key: 'my_field',
    type: 'my_custom_type',
    label: 'My field',
    required: false,
}
```

Existing example:

- `posthog_assignee` type defined in nodejs/src/cdp/templates/\_destinations/posthog_conversations/posthog-update-ticket.template.ts
- Renderer in products/conversations/frontend/components/Assignee/CyclotronJobInputAssignee.tsx

## Metrics and version attribution

Workflow metrics live in the ClickHouse `app_metrics2` table, written by the CDP workers.
Every hog flow metric is written **twice**:

- `app_source: 'hog_flow'`, `app_source_id: '<flow id>'` — all versions combined. What the UI reads.
- `app_source: 'hog_flow_version'`, `app_source_id: '<flow id>/<version>'` — only the version whose config produced the metric.

`instance_id`, `metric_kind` and `metric_name` mean the same thing in both series, so a version-scoped read is the version-agnostic query with `app_source` and `app_source_id` swapped.
`app_metrics2` can't hold the version in a column of its own — it's an AggregatingMergeTree whose sort key is its aggregation key, so a new dimension would have to join the ORDER BY and re-key existing parts.

The versioned series is always keyed by the **flow**, even where the version-agnostic series is not.
Batch and broadcast runs put the run id in `app_source_id` so per-run views group by the run, but a per-version rollup has to key on the flow itself — otherwise every run of a broadcast mints a fresh key and its versions never aggregate.
So `hog_flow` reads stay exactly as they are, and `hog_flow_version` is always `<flow id>/<version>`.

Nothing reads the versioned series yet.
`/metrics` and `/metrics/totals` always return the version-agnostic one, and adding a filter to them is the natural next step.
Until then, query it directly in HogQL, where the table is exposed as `app_metrics` (the HogQL name maps to the `app_metrics2` table; raw ClickHouse separately has a deprecated v1 table literally named `app_metrics`):

```sql
SELECT metric_name, sum(count)
FROM app_metrics
WHERE app_source = 'hog_flow_version' AND app_source_id = '<flow id>/3'
GROUP BY metric_name
```

Conversions carry the version as a `$workflow_version` property on the `$workflows_conversion` event, so version comparisons work in insights and cohorts too.

Things to know when reading these numbers:

- **The version is the one that ran the step, not the one the person entered on.** Live edits reach runs already in flight, so a run that starts on v2 and sends its email after v3 is published attributes the trigger to v2 and the email to v3. Per-version rates are therefore a comparison of what each config did while it was live, not a fixed entry cohort.
- **Conversions are the exception: they follow the message, not the step that happened to run.** A conversion can land days after the send, so it can't be attributed at match time — the published version by then may be one that never reached this person. The run carries `flowVersion` in its state, seeded at run start and re-pinned by each email or push step to the version that sent, so a conversion is credited to the same version its `email_sent` was. A run that converts without ever sending keeps the run-start version, and one parked before this shipped has none at all and lands only in the version-agnostic series.
- **Engagement metrics carry the sending version, which is not always the live one.** `email_delivered`, `email_opened`, `email_link_clicked`, the bounce metrics and complaints (`email_blocked`) arrive from an SES webhook long after the send, by which time the workflow may have been republished. The version rides on the tracking code minted at send time (`ph_id`, and the `X-PostHog-Tracking-Code` header) rather than being read off the flow when the webhook lands — reading it on arrival would blame the newest version for the previous one's sends. A message whose only surviving carrier is the short SES `EmailTags` value has no version and lands in the version-agnostic series alone.
- **Engagement versions are not flowing yet.** The tracking-code layouts are only compatible in one direction, so the rollout is two-phase: the marker-aware parser ships first, and `generate` starts emitting it only once that parser is everywhere. Emitting early would shift every field for a pod still on the old parser and drop the metric for the length of the rolling deploy. Flip `EMIT_VERSIONED_PAYLOAD` in `nodejs/src/cdp/services/messaging/helpers/tracking-code.ts` to start phase two.

When adding a metric for a hog flow, set `app_source_version` on the `MinimalAppMetric` if you're calling `queueAppMetric` directly.
Metrics pushed onto a `result.metrics` array need nothing: `HogFunctionMonitoringService.queueInvocationResults` stamps the version for the whole result.
For anything emitted after the run has ended — a webhook, a callback — the version has to come from whatever the message carried, never from a fresh lookup of the workflow.

Building a version picker? The list of versions that have metrics is `{flow.version} ∪ {revision versions}`, not just the revisions endpoint. A workflow that has never been edited has zero `HogFlowRevision` rows but still reports metrics under `<flow id>/1`.

## Common pitfalls

- **Forgot the side-effect import**: triggers/actions must be imported by their `index.ts`, and async functions must be imported by nodejs/src/cdp/async-functions/index.ts.
- **Template id mismatch**: `config.template_id` in the frontend must exactly match `template.id` in the backend.
- **Mocks don’t match real behavior**: workflows test tooling relies on `mock` returning realistic structures.
- **Feature flag gating**: if you add `featureFlag` to triggers or categories, make sure you’re using an existing flag from `lib/constants`.
