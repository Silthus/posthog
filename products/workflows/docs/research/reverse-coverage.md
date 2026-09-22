# Reverse-codegen coverage: HogFlow to @posthog/workflows

This note answers a narrow question: if a reverse renderer read a stored HogFlow and tried to
write it as `@posthog/workflows` TypeScript source, which parts could it express.

Sources:

- Action types and config: `products/workflows/backend/models/hog_flow/hog_flow.py`,
  `products/workflows/backend/api/hog_flow.py`,
  `products/workflows/skills/building-workflows/references/graph-schema.md`.
- Frontend zod types: `products/workflows/frontend/Workflows/hogflows/types.ts` and
  `products/workflows/frontend/Workflows/hogflows/steps/types.ts`.
- The SDK, read only, from `/Users/mreichenbach/dev/wf-demo/products/workflows/packages/workflows/src/`
  on `demo/workflows-as-code`: `workflow.ts`, `steps.ts`, `triggers.ts`, `definition.ts`, `emit.ts`.

All line numbers are from this branch, cut from `upstream/master`.

## 1. Action types

`SUPPORTED_ACTION_TYPES` lists 11 types
(`products/workflows/backend/models/hog_flow/hog_flow.py:28-40`).

| Type                     | SDK constructor                                              | Verdict         | What is lost                                                                                                                                                                                                                                                                                      | Config fields the reverse must read                                                                                                                              |
| ------------------------ | ------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trigger`                | `onEvent`, `onSchedule` (`triggers.ts:28`, `triggers.ts:82`) | With loss       | Covers only the `event` and `schedule` trigger kinds. `manual`, `batch`, `webhook`, `tracking_pixel`, `internal-event`, `data-warehouse-table`, `data-warehouse-view` have no constructor (see section 2). `onEvent` also fixes `filter_test_accounts: false` and cannot carry `trigger_masking`. | `config.type`, `config.filters.events[0].{id,name,properties}`, `config.filters.properties`, `config.filters.filter_test_accounts` (`api/hog_flow.py:1184-1247`) |
| `function`               | `fn`, `webhook` (`steps.ts:168`, `steps.ts:213`)             | With loss       | `mappings` on the config (`graph-schema.md:50`) has no SDK field. A `secret` input round-trips as a name, not a value, so a reverse render can restate the reference but never recover the stored secret.                                                                                         | `config.template_id`, `config.inputs` (per key, `{value}` wrapper)                                                                                               |
| `function_email`         | `email` (`steps.ts:343`)                                     | With loss       | `template_uuid` (library template reference) is never read back as a reference: the backend already materializes the body inline at save, so no loss there, but `tracking_enabled` and `message_category_type` have no SDK parameter and would silently revert to defaults on a round-trip.       | `config.inputs.email.value.{from,to,subject,text,html,design,preheader}`, `config.tracking_enabled`, `config.message_category_type`                              |
| `function_sms`           | none                                                         | Not expressible | No `sms` step exists in `steps.ts`.                                                                                                                                                                                                                                                               | `config.template_id`, `config.inputs`, `config.message_category_type`                                                                                            |
| `function_push`          | none                                                         | Not expressible | No `push` step exists in `steps.ts`.                                                                                                                                                                                                                                                              | `config.template_id`, `config.inputs.{distinctId,channels,title,body,...}`                                                                                       |
| `delay`                  | `delay` (`steps.ts:132`)                                     | With loss       | Only `delay_duration` is covered (`Step` kind `'delay'` takes a single `Duration`, `steps.ts:101`). `delay_until` (per-person/per-event date wait), its `offset`, `max_delay_duration`, `timezone`, `use_person_timezone`, `fallback_timezone` have no SDK shape.                                 | `config.delay_duration` or `config.delay_until.{expression,offset}`, `config.max_delay_duration`, `config.timezone`                                              |
| `wait_until_condition`   | none                                                         | Not expressible | No SDK step.                                                                                                                                                                                                                                                                                      | `config.condition.filters`, `config.events[]`, `config.max_wait_duration`                                                                                        |
| `wait_until_time_window` | none                                                         | Not expressible | No SDK step.                                                                                                                                                                                                                                                                                      | `config.timezone`, `config.use_person_timezone`, `config.day`, `config.time`                                                                                     |
| `conditional_branch`     | `branch` (`steps.ts:420`)                                    | Expressible     | `BranchCondition` (`definition.ts:84-87`) matches the backend's property-only, `filters`-wrapped shape (`graph-schema.md:58-61`) exactly.                                                                                                                                                         | `config.conditions[].{name,filters.properties}`                                                                                                                  |
| `random_cohort_branch`   | none                                                         | Not expressible | No SDK step.                                                                                                                                                                                                                                                                                      | `config.cohorts[].{percentage,name}`                                                                                                                             |
| `exit`                   | built into `workflow()`'s `exit` option (`workflow.ts:41`)   | Expressible     | None.                                                                                                                                                                                                                                                                                             | `config.reason`                                                                                                                                                  |

## 2. Trigger kinds vs `onEvent` / `onSchedule`

`TRIGGER_TYPES` lists 9 kinds (`products/workflows/backend/models/hog_flow/hog_flow.py:46-58`).
Only two have an SDK constructor.

| Trigger kind           | SDK constructor | Verdict         | Note                                                                                                                                                                 |
| ---------------------- | --------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event`                | `onEvent`       | With loss       | See row above; `trigger_masking` cannot travel with it.                                                                                                              |
| `schedule`             | `onSchedule`    | Expressible     | `{type: 'schedule'}` matches exactly (`triggers.ts:83`). The cadence itself is a separate `HogFlowSchedule` resource, out of scope for the definition on both sides. |
| `manual`               | none            | Not expressible | Backend needs `template_id: 'template-source-webhook'` plus fixed `inputs` (`graph-schema.md:72`); nothing in the SDK builds this.                                   |
| `batch`                | none            | Not expressible | Needs `config.filters` (person/account audience); no SDK shape.                                                                                                      |
| `webhook`              | none            | Not expressible | This is the trigger kind, distinct from the `webhook()` step helper, which builds a `function` action calling `template-webhook`, not a trigger.                     |
| `tracking_pixel`       | none            | Not expressible | Needs `template_id: 'template-source-webhook-pixel'`; no SDK shape.                                                                                                  |
| `internal-event`       | none            | Not expressible | Flag-gated; needs `config.filters.source: 'internal-events'`; no SDK shape.                                                                                          |
| `data-warehouse-table` | none            | Not expressible | Not in `graph-schema.md`'s trigger config list at all; no SDK shape.                                                                                                 |
| `data-warehouse-view`  | none            | Not expressible | Same as above.                                                                                                                                                       |

## 3. Workflow-level fields

| Field             | SDK field                                                                                   | Verdict                           | What is lost                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`            | `WorkflowOptions.name` (`workflow.ts:20`)                                                   | Expressible                       | None.                                                                                                                                                                                                                                                                                                                                                                                            |
| `description`     | `WorkflowOptions.description` (`workflow.ts:22`)                                            | Expressible                       | None; empty string when omitted on both sides.                                                                                                                                                                                                                                                                                                                                                   |
| `status`          | `WorkflowOptions.status` (`workflow.ts:28`)                                                 | Expressible                       | The three values match `HogFlow.State` exactly (`hog_flow.py:126-129`).                                                                                                                                                                                                                                                                                                                          |
| `exit_condition`  | `WorkflowOptions.exitCondition` (`workflow.ts:30`)                                          | With loss                         | The enum value itself round-trips, but the three `…conversion` variants need a paired `conversion` goal to do anything (`hog_flow.py:131-135`, `graph-schema.md:198-204`), and the SDK has no field for that goal (see next row). A reverse render of one of those three values would produce a workflow that compiles but exits only at the end in practice.                                    |
| `conversion`      | none                                                                                        | Not expressible                   | No `conversion` field anywhere in `workflow.ts` or `definition.ts`.                                                                                                                                                                                                                                                                                                                              |
| `trigger_masking` | none                                                                                        | Not expressible                   | No field in `workflow.ts` or `definition.ts`; confirmed absent from `triggers.ts` too.                                                                                                                                                                                                                                                                                                           |
| `variables`       | `WorkflowOptions.variables: WorkflowVariable[]` (`workflow.ts:35`, `definition.ts:221-226`) | With loss                         | `WorkflowVariable` only has `type: 'string' \| 'number' \| 'boolean'` and a string `default`. The stored field can hold any `CyclotronJobInputSchemaTypeSchema` type (`choice`, `dictionary`, `json`, `integration`, `integration_multi`, and others, `steps/types.ts:84-108`), each with `label`, `secret`, `order`. Only the three primitive types with a string default survive a round-trip. |
| `key`             | `WorkflowOptions.key` (`workflow.ts:18`)                                                    | Not expressible (on this backend) | The model has no `key` column (`hog_flow.py:110-196` lists every field) and the serializer exposes none (`api/hog_flow.py:2787-2882`). The SDK's own comment says the API accepts `key` "from a later backend change on" and otherwise ignores it as an unknown field (`workflow.ts:16`, `definition.ts:240-241`). A reverse renderer on this backend has no stored value to read.               |
| `managed_by`      | none                                                                                        | Not applicable                    | Not found anywhere in the workflows backend, its frontend types, or the SDK. Searched `products/workflows/` and the SDK source; no match. Likely refers to a field that does not exist yet, or was misnamed in the source ticket.                                                                                                                                                                |

## 4. Per-action `filters`, `on_error`, and `edges`

| Field                              | SDK shape                | Verdict                                        | Note                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filters` (gates the action)       | none                     | Not expressible                                | `ActionBase` in `definition.ts:148-151` is only `{id, name}`; no step constructor in `steps.ts` accepts a gating `filters` option. Every `Action` variant in `definition.ts:159-179` omits it too.                                                                                                    |
| `on_error`                         | none                     | Not expressible                                | Same `ActionBase` shape; no `on_error` anywhere in the SDK. A stored `abort` (the non-default choice) is silently lost.                                                                                                                                                                               |
| `edges` type `continue`            | derived by `emit`/`path` | Expressible                                    | The fall-through edge, including a branch's no-match path, is derived from placement (`emit.ts`, `steps.ts:424-454`).                                                                                                                                                                                 |
| `edges` type `branch` with `index` | derived by `branch`      | Expressible, but only for `conditional_branch` | `branch`'s arm order fixes each `index` (`steps.ts:420-422`, confirmed against `emit.ts:478`). `random_cohort_branch` and `wait_until_condition` also use `branch` edges on the backend, but neither action type has an SDK constructor, so those edges are unreachable from the SDK side regardless. |

## 5. Exact JSON shapes from the read API

**Secret inputs.** A set secret input reads back as the presence marker `{"secret": true}`,
never the value: `mask_secret_action_inputs` replaces `inputs[key]` with that literal
(`api/hog_flow.py:437-455`, the assignment at `:454`). Writing that marker back verbatim is
rejected by `recover_or_drop_masked_inputs` (`api/hog_flow.py:420-434`), which either restores
the previously stored value or drops the key. A reverse renderer must emit `secret('SOME_ENV_VAR')`
(`steps.ts:45`) for a masked input; it cannot recover which environment variable the original
push used, because that name was never stored, only the resolved value.

**Email `design`.** The read API returns whatever `design` object is stored, and for an inline
HTML body PostHog builds it with `build_html_wrap_design` (`posthog/cdp/validation.py:159-174`),
an Unlayer wrapper with fixed ids (`html-wrap-body`, `html-wrap-row`, `html-wrap-column`,
`html-wrap-content`) and `schemaVersion: 16`. The SDK's `htmlWrapDesign` (`steps.ts:265-299`)
builds byte-for-byte the same shape from the same `html` string, so a reverse renderer can
compare a stored `design` against a fresh `htmlWrapDesign(html)` call: an exact match means the
design was never hand-edited in the visual editor and the `email()` step alone reproduces it; any
difference is a visual-editor edit with no SDK source form.

**Integration ids on email `from`.** The read API returns
`{"integrationId": <number>, "integrationIds": [<number>, ...], "email"?: <string>, "name"?: <string>}`
(`definition.ts:130-138`, matching the backend's own shape described in
`graph-schema.md:51`). `integrationId` is always the first entry of `integrationIds`. A reverse
renderer maps this straight onto `EmailSenderOptions` (`steps.ts:245-260`).

## 6. Smallest SDK additions, and the unbridgeable gap

Two additions would raise coverage the most for the least SDK surface: an `onManual()` /
`onBatch()` pair of trigger constructors (closing the six missing trigger kinds is really about
generating the fixed `template-source-webhook*` shapes the backend already documents in
`graph-schema.md:70-76`), and a `wait()` step that emits `wait_until_condition`, since it is the
only remaining action type with a plain property/event condition shape rather than a template
lookup. Together those two cover the bulk of workflows that are not messaging-heavy.

Some HogFlow features have no plausible source form regardless of SDK additions, because nothing
about them is meant to live in a pushed file. `conversion` and `trigger_masking` are both
compiled server-side from a `hash`/`filters` the SDK does not expose, but that is a design
choice, not a technical wall, so they could still gain a source form later. `design` for an email
step that was hand-edited in the visual editor is different in kind: it is arbitrary Unlayer JSON
with no author-facing text representation, so a reverse renderer can detect the visual-editor
edit (section 5) but never re-express it as source. `key` is the other unbridgeable case today,
not because the concept is unrepresentable but because the field the SDK already emits has no
column to read back from on this backend version.
