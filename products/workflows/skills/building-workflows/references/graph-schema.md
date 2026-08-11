# Workflow graph schema

The contract for `actions` and `edges`. The stored workflow is loose JSON, but **the visual editor validates every node against a strict schema keyed on `type`**. A node that saves successfully but doesn't match this contract will **break the editor view for the whole workflow** when someone opens it. Treat the shapes below as required, not advisory.

## Contents

- Node (action) shape
- Action types and their `config`
- Edges
- `function*` inputs
- Duration strings (`delay_duration`, `max_wait_duration`)
- Conversion & exit condition
- Pre-submit checklist

## Node (action) shape

Every action object has these common fields plus a type-specific `config`:

```json
{
  "id": "unique_within_workflow",
  "name": "Human label",
  "description": "",
  "type": "<see action types>",
  "config": {},
  "on_error": "continue",
  "filters": null,
  "output_variable": null
}
```

- `id` — unique within the workflow; edges reference it by `from`/`to`.
- `on_error` — optional; **only `continue` or `abort`.** Omit to use the default.
- `filters` — optional property filters gating the action: `{properties: [<cond>]}`. Send `properties`, not `bytecode`.
- `output_variable` (optional). Store a step result into one or more workflow variables. Either one object `{key, result_path?, spread?, label?}` or an array of those objects. A bare string is also accepted and is coerced to `{key: "<that string>"}` at save.
  - `key` is the workflow variable to write. `result_path` selects a path inside the step result (for example `fields.subject`); omit it to store the whole result. `spread` writes each property of an object result as its own variable named `{key}_{property}`. `label` is the display label of the variable the editor auto-creates.
  - **Workflow variables are capped at 5120 bytes in total.** The declared `variables` list is rejected at save above that size ("Total size of variables definition must be less than 5KB"). At run time the executor measures every variable together right after a step writes: over 5120 bytes it deletes the keys that step just wrote and fails the step. Store fragments with `result_path`, not whole responses.

## Action types and their `config`

Use **only** these `type` values — they are the complete supported set. An unknown or unsupported `type` breaks the editor's parse for the entire graph.

| `type`                   | `config`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trigger`                | a trigger config (see below). Exactly one trigger node per workflow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `delay`                  | `{ "delay_duration": "30m" }` — see duration rules below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `conditional_branch`     | `{ "conditions": [ { "filters": {"properties": [<cond>]}, "name?": "" } ] }`. Index N pairs with the `branch` edge `index: N`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `random_cohort_branch`   | `{ "cohorts": [ { "percentage": 50, "name?": "A" } ] }`. Percentages are relative weights and should sum to 100, but a total above or below 100 still splits traffic in the given proportions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `wait_until_condition`   | `{ "condition?": {"filters": {"properties": [<cond>]}}, "events?": [{"filters": {...}, "name?": ""}], "max_wait_duration": "7d" }`. `condition` is optional: an **events-only** wait is valid (server seeds a missing `condition` as `{filters: null}`). Duration rules as `delay`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `wait_until_time_window` | `{ "timezone": "UTC", "use_person_timezone?": false, "day": <"weekday" / "weekend" / "any" / ["monday",...]>, "time": <"any" / ["10:00","11:00"]> }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `function`               | `{ "template_id": "<live template id>", "inputs": { ... }, "mappings?": [] }`. Don't guess the id or its inputs — discover them live (see below). The one id you can write from memory is `template-workflow-llm`, the "Generate text" step, which runs a prompt and stores the answer in workflow variables. It stays a `function` node, so `template_id` is required. Each run spends the project's PostHog AI credits. See the worked example below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `function_email`         | `{ "template_id?": "template-email", "template_uuid?": "<saved template UUID>", "inputs": {"email": {"value": {...}}}, "message_category_type?": <"marketing" / "transactional">, "tracking_enabled?": <bool> }`. `template_id` is the **literal** `template-email`; omit it and the server infers it from the step type. Reference a saved library template (from `workflows-list-email-templates`) by putting its UUID in `template_uuid`, never in `template_id` — a UUID sent as `template_id` is moved into `template_uuid` automatically. When `template_uuid` is set and the value has no body keys (`subject`/`text`/`html`/`design`), the server copies the template's body into `inputs.email.value` at save (a snapshot — later template edits don't propagate); you still supply `from` and `to`. If you author any body key inline, your body wins and `template_uuid` is provenance only. `tracking_enabled` defaults to true; when false, no open pixel is injected and links are not rewritten, so opens/clicks are not recorded for this step (delivery/bounce/unsubscribe still are). |
| `function_sms`           | `{ "template_id?": "template-twilio", "inputs": { ... }, "message_category_type?": "..." }`. `template_id` is the **literal** `template-twilio`; omit it and the server infers it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `function_push`          | `{ "template_id?": "template-native-push", "inputs": { ... }, "message_category_type?": <"marketing" / "transactional"> }`. `template_id` is the **literal** `template-native-push`; omit it and the server infers it. Sends a mobile push notification via FCM/APNs. Its `inputs` are richer than email's — `title`, `body`, and a `channels` list of the FCM/APNs integration ids to send through — so retrieve the `template-native-push` `inputs_schema` (as with `function`) for the exact keys, and use the project's push integration ids for `channels`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `exit`                   | `{ "reason?": "Done" }`. Usually one terminal exit node.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Branch and wait condition filters (the `filters` wrapper is mandatory)

`conditional_branch` and `wait_until_condition` gate on a **`filters` object**, the action-filter shape (`{properties?, events?, actions?, source?, filter_test_accounts?}`). The wrapper is not optional:

- Write `{ "filters": { "properties": [<cond>] } }` on each condition, **never** `{ "properties": [<cond>] }` directly on the condition object. The bare form saves but the visual editor flags it and the branch compiles to a constant, so it never evaluates your condition.
- `conditional_branch` conditions are **property-only** (person/group `<cond>`s). Event/action filters are rejected here ("Event filters are not allowed in conditionals").
- `wait_until_condition` is event-aware: its `condition.filters` and each `events?[].filters` may also carry `events`/`actions`. An entry naming neither an event nor an action is dropped (it would match everything).
- `source` is optional (defaults to `events`). Never send `bytecode`; the server compiles it from `properties`.

### Trigger `config` (the `trigger` node)

Discriminated on `config.type`:

- `event` — `{ "type": "event", "filters": { "events": [{ "id": "<event>", "name": "<event>", "type": "events", "order": 0, "properties": [<cond>] }], "properties": [<cond>], "filter_test_accounts": false } }`. Fires on **every** matching occurrence. Throttle repeats with `trigger_masking` (dedup/sampling — not behavioral filtering).
- `webhook` / `manual` / `tracking_pixel` — `{ "type": "webhook", "template_id": "<literal>", "inputs": { ... } }`. These use a **fixed built-in source template**, not one you look up: `template-source-webhook` for both `webhook` and `manual`, `template-source-webhook-pixel` for `tracking_pixel`. Omitting or guessing it fails the create with `Template not found` against the trigger node. They are `source_webhook` templates and are **not** in the destination catalog (`cdp-function-templates-list` is `type=destination`), so don't try to discover them there. Each needs `inputs.event` and `inputs.distinct_id` wrapped in `{value: ...}`, and the right values **differ per trigger type** because a different request reaches the template:
  - `webhook` — a POST whose body you control: `"inputs": { "event": { "value": "{request.body.event}" }, "distinct_id": { "value": "{request.body.distinct_id}" } }`.
  - `manual` — the "trigger manually" button POSTs `{user_id, $variables}`, so the body carries no `event`: use the fixed literal `"inputs": { "event": { "value": "$workflow_triggered" }, "distinct_id": { "value": "{request.body.user_id}" } }`. Pointing `event` at `{request.body.event}` here makes every manual run return 400 (the source template rejects an empty `event`) while the UI still shows a success toast, so the workflow silently never fires.
  - `tracking_pixel` — a bodyless `GET`, so read query params: `"inputs": { "event": { "value": "{request.query.ph_event}" }, "distinct_id": { "value": "{request.query.ph_distinct_id}" } }`. Body references resolve empty here and the pixel still returns its 200 GIF, so every hit is dropped with no error to retry on.
- `batch` — `{ "type": "batch", "filters": { "properties": [<cond>] } }`. The audience: person-property conditions and/or cohort references. **No event/action filters** (silently dropped, so rejected). Does not fire on enable — dispatch a one-off broadcast with `workflows-run-batch`, or make it **recurring** with `workflows-schedule-create` (attaches an RRULE schedule; each firing re-broadcasts to this same `config.filters.properties` audience). A recurring workflow is a `batch` trigger plus a schedule — there is no separate "schedule" trigger type to author.

### Trigger masking (throttling an event trigger)

`trigger_masking` is a top-level workflow field (not an action) that throttles an already-matching `event` trigger — it dedups/samples firings, it does not decide who enters.

```json
"trigger_masking": { "hash": "{person.id}", "ttl": 3600, "threshold": null }
```

- `hash` — HogQL template defining the dedup key. `"{person.id}"` = once per person.
- `ttl` — seconds to suppress repeats of the same hash (60–94608000).
- `threshold?` — fire once per N matches of the same hash (a sampler: N=3 fires on the 1st, 4th, 7th…). Omit to fire once then suppress within `ttl`.
- Don't send `bytecode` — compiled server-side from `hash`.

### Condition shape (`<cond>`)

Property conditions used in trigger/action `filters`, branch conditions, and conversion:

```json
{ "key": "plan", "value": ["pro"], "operator": "exact", "type": "person" }
```

`type` is `event` | `person` | `group`. Never include `bytecode` — the server compiles it.

## Edges

```json
{ "from": "source_id", "to": "target_id", "type": "continue", "index": 0 }
```

- `type: "continue"` — fall-through: the sequential next step, or the **no-match** path out of a `conditional_branch`. For a `wait_until_condition` it is the **`max_wait_duration` timeout** path.
- `type: "branch"` — requires `index`, matching `config.conditions[index]` on a `conditional_branch`. A `wait_until_condition` **resolves** (its `condition` matches or an `events` entry fires) out the `branch` edge at **`index: 0`**.
- **Every non-exit node needs a reachable next action** via an outgoing edge, or execution fails with "No next action found".
- A `conditional_branch` with N conditions typically has N `branch` edges (`index: 0..N-1`) plus one `continue` edge for the no-match path.
- A `wait_until_condition` needs a `branch` edge at `index: 0` (resolution) **and** a `continue` edge (timeout). Without the `index: 0` branch it only ever advances on timeout, never on the event/condition firing.

## `function*` inputs

Inputs are keyed by the template's input schema, each wrapped in `{value: ...}`:

```json
"inputs": { "url": { "value": "https://example.com/hook" } }
```

- **Wrap values in `{value: ...}`.** A flat string won't enable templating.
- Templating uses **single-curly** `{person.x}` / `{event.x}` inside the value string. Liquid-style `{{ ... }}` is rejected on hog-templated fields ("Placeholders are not allowed in this context") — the only fields that accept Liquid are ones whose input schema declares `templating: liquid` (the email input on `function_email` does; most others don't).
- **Dictionary input values are template strings too** — write booleans/numbers as single-expression templates: `"{true}"`, `"{42}"`, which evaluate to the typed value.
- Required inputs must be present, or create fails with "This field is required".

### Discovering function templates (do this, don't guess)

The set of available `function` templates and their required inputs is **live data**, not something to hardcode — it changes as integrations are added. For a `function` node:

1. `cdp-function-templates-list` (filter `type=destination`) to find the right template and its `id`.
2. `cdp-function-templates-retrieve` with that id to read its **`inputs_schema`** — the exact keys, types, and which are required.
3. Build `inputs` from that schema. A `template_id` not in the live list fails with "Template not found".

`function_email`, `function_sms`, and `function_push` are the exception — their `template_id` is the fixed literal `template-email` / `template-twilio` / `template-native-push`, so you don't look the `template_id` up, and you can omit it entirely: the server infers the literal from the step type. A saved email template's UUID goes in `template_uuid` alongside the literal, never in `template_id` (a UUID sent as `template_id` is moved into `template_uuid` automatically). For `function_email`, referencing a template means you only author `from`/`to`: the server materializes the template's body at save (see the action-types table). `function_push` still has variable `inputs` (notably `channels`), so retrieve its `inputs_schema` even though the id is fixed.

`template-workflow-llm` is a fixed literal too, but it differs from those three: there is no `function_llm` step type, so the node stays `type: "function"` and you must send `template_id` yourself. Nothing is inferred. The catalog does list it, so `cdp-function-templates-retrieve` still returns its `inputs_schema` if you want to check the inputs against the worked example below.

### `function_push` worked example

Retrieve `template-native-push` with `cdp-function-templates-retrieve` for the full `inputs_schema` (it has many optional Android/iOS keys), but the core shape is:

```json
{
  "id": "push_1",
  "name": "Re-engagement push",
  "type": "function_push",
  "config": {
    "template_id": "template-native-push",
    "inputs": {
      "distinctId": { "value": "{event.distinct_id}" },
      "channels": { "value": [6, 7] },
      "title": { "value": "Notification from {event.event}" },
      "body": { "value": "Hi {{ person.properties.first_name }}, come finish setting up.", "templating": "liquid" }
    }
  }
}
```

- **`channels`** is an `integration_multi` input: its `value` is an array of **integration id numbers** (e.g. `[6, 7]`), not objects. Find the FCM/APNs integration ids with `integrations-list` (look for `kind` `firebase` / `apns`); at least one is required or the send throws "No push channel configured".
- **Templating differs per input.** `body` is **liquid** — interpolate with `{{ person.x }}` / `{{ event.x }}` (double braces) and set `"templating": "liquid"`. `title` and the other string inputs are **hog** — use `{event.x}` / `{person.x}` (single braces). The wrong brace style leaves the expression as a literal.
- Required: `distinctId`, `channels`, `title`. Optional: `body`, `image`, `data`, `ttlSeconds`, `android_*`, `ios_*` (retrieve the `inputs_schema` for the full set).
- Never hand-author `bytecode` — the server compiles it from `value`. Omit `order` too: the editor lays fields out in the template's `inputs_schema` order (fixed and consistent), not by the `order` on your inputs, so leaving it off doesn't change the form. Push has no delivered/opened/clicked signal (FCM/APNs respond synchronously), so a successful send means "accepted for delivery", nothing more.

### `template-workflow-llm` ("Generate text") worked example

A `function` node that runs `prompt` on `model`, then pulls one value out of the answer per entry in `output_fields`. The step result is `{ "text": "<the whole generation>", "fields": { "<field key>": "<extracted value>" } }`. `output_variable` is what moves that result into workflow variables.

```json
{
  "id": "generate_1",
  "name": "Write the subject line",
  "type": "function",
  "on_error": "abort",
  "config": {
    "template_id": "template-workflow-llm",
    "inputs": {
      "prompt": {
        "value": "Write a subject line for {{ person.properties.first_name }}, who is on the {{ person.properties.plan }} plan.",
        "templating": "liquid"
      },
      "model": { "value": "gpt-5-mini" },
      "output_fields": { "value": { "email_subject": "The subject line, under 60 characters, no emoji." } }
    }
  },
  "output_variable": [{ "key": "email_subject", "result_path": "fields.email_subject" }]
}
```

- **Every `output_fields` key names a workflow variable the workflow already declares** in its top-level `variables`. Declare the variable first (`workflows-update` carries `variables`). The builder's field picker offers declared variables only, and a key that names nothing declared never shows up in the workflow's variable list.
- **Each declared field needs its own `output_variable` entry with `result_path: "fields.<key>"`.** Without those entries the step still runs and still spends AI credits, and then the answer is discarded: nothing is written and every downstream `{variables.<key>}` renders the variable's declared default (usually empty). The builder writes the entries for you; over MCP you write them yourself.
- **`result_path: "text"` stores the raw generation**, the whole answer before extraction. Use it for short answers only. The generation endpoint rejects a `{text, fields}` envelope over 4096 bytes with `output_too_large`, and whatever you do store counts against the 5120-byte variable cap like any other value.
- **Each run spends the project's PostHog AI credits**, in a live run and in a preview alike. A test run with `mock_async_functions=false` is a real generation; the default mock returns placeholder text and costs nothing.
- **Keep `on_error` at `abort`**, which is what the builder sets on this node. A failed generation is already billed and leaves its variables unset, so continuing sends the next step out on empty text.
- `prompt` is Liquid, so interpolate with `{{ person.x }}` / `{{ event.x }}` (double braces). `model` does not template. The builder offers six models: `gpt-4.1-mini`, `gpt-5-mini`, `gpt-5.4`, `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-8`. A model the generation endpoint does not accept fails the step with `invalid_model`.
- Failures land in the run log as `Could not generate text (<code>)`, followed by a short explanation of the code. `feature_unavailable` means the step is off for this project, `quota_exceeded` means the AI credit budget is spent, and `output_too_large` means the answer did not fit the variable cap.

## Duration strings (`delay_duration`, `max_wait_duration`)

Must match `^\d*\.?\d+[dhm]$` — a number plus unit `m` | `h` | `d`. Examples: `30m`, `2h`, `1d`, `0.5m` (=30s).

- **No seconds, no ISO-8601.** For sub-minute, use a fraction of a minute.
- Per-unit caps are **silently clamped**: `m`≤60, `h`≤24, `d`≤30. Max total 30d. Use the larger unit (`90m` → use `1.5h`) to avoid surprise clamping.

## Conversion & exit condition

- `exit_condition`: `exit_only_at_end` (default), `exit_on_conversion`, `exit_on_trigger_not_matched`, `exit_on_trigger_not_matched_or_conversion`.
- The `…conversion` variants require a `conversion` goal with two slots plus a window:
  - `filters` — **property conditions only**, an array `[{key, value, operator, type}, ...]` (empty array = any event in the window converts).
  - `events` — **event-based goals**, `[{ "filters": { "events": [{ "id": "<event>", "name": "<event>", "type": "events" }] } }]`.
  - `window_minutes` — minutes after entry (`null` = no window).
- **An event goal goes in `events`, never in `filters`.** An event object stuffed into `filters` is invisible to the conversion matcher and breaks the conversion picker. Without a goal the `…conversion` exit is a silent no-op. Server compiles the bytecode.

## Pre-submit checklist

- [ ] Exactly **one** `type: "trigger"` action; usually exactly one `exit`.
- [ ] Every action `type` and `config` matches a row above (no types outside the supported set).
- [ ] `on_error` is only `continue` or `abort`.
- [ ] `function_email.template_id == "template-email"`, `function_sms.template_id == "template-twilio"`, `function_push.template_id == "template-native-push"`.
- [ ] A "Generate text" step is `type: "function"` with `template_id == "template-workflow-llm"`, every `output_fields` key is a declared workflow variable, and each one has an `output_variable` entry with `result_path: "fields.<key>"`.
- [ ] A `webhook` / `manual` trigger sets `template_id == "template-source-webhook"` (a `tracking_pixel` uses `"template-source-webhook-pixel"`) — these are built-in source templates, not catalog lookups.
- [ ] That trigger's `inputs.event` / `inputs.distinct_id` match its own type: `{request.body.*}` for `webhook`, `$workflow_triggered` + `{request.body.user_id}` for `manual`, `{request.query.ph_*}` for `tracking_pixel`. The wrong pair saves fine and then fails at trigger time.
- [ ] Every non-exit node has an outgoing edge; `branch` edges have an `index` matching a condition.
- [ ] Every `conditional_branch` / `wait_until_condition` condition is wrapped: `{filters: {properties: [...]}}`, not `{properties: [...]}`.
- [ ] All durations match `^\d*\.?\d+[dhm]$` and dodge the silent per-unit clamp.
- [ ] Function inputs are `{key: {value: ...}}`; no hand-written `bytecode` anywhere; no top-level `trigger` field set.
